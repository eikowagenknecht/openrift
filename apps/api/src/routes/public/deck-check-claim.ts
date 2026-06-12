import { createRoute } from "@hono/zod-openapi";
import { ERROR_CODES } from "@openrift/shared";
import { deckCheckClaimLandingResponseSchema } from "@openrift/shared/response-schemas";
import { deckCheckClaimTokenParamSchema } from "@openrift/shared/schemas";

import { AppError } from "../../errors.js";
import { errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";

const getClaimLanding = createRoute({
  method: "get",
  path: "/deck-check/claim/{token}",
  tags: ["Deck Check"],
  description:
    "The pre-claim landing for a provider-issued claim link (ADR-026 " +
    "amendment). Public, because any holder of the link reaches it before " +
    "authenticating; it reveals only the event and owning group, never the " +
    "entrant or the deck. An unknown token is a 404.",
  request: { params: deckCheckClaimTokenParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: deckCheckClaimLandingResponseSchema } },
      description: "The claim landing payload",
    },
    ...errorResponses(404),
  },
});

/**
 * Public claim landing. Mounted before the authenticated player app so this
 * GET handler terminates ahead of that app's `/deck-check/*` auth middleware
 * (the same ordering the public deck-share route relies on); the matching POST
 * claim lives in the authenticated app and keeps its session guard.
 */
export const deckCheckClaimRoute = createApiApp().openapi(getClaimLanding, async (c) => {
  const { token } = c.req.valid("param");
  const landing = await c.get("repos").deckCheck.getClaimLandingByToken(token);
  if (!landing) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Claim link not found");
  }
  return c.json(landing, 200);
});
