import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { PublicDeckDetailResponse } from "@openrift/shared";
import { publicDeckDetailResponseSchema } from "@openrift/shared/response-schemas";
import { z } from "zod";

import type { Variables } from "../../types.js";
import { assertFound } from "../../utils/assertions.js";
import { toDeckCard, toPublicDeck } from "../../utils/mappers.js";

const shareTokenParamSchema = z.object({
  token: z.string().min(1),
});

const getPublicDeckByShareToken = createRoute({
  method: "get",
  path: "/decks/share/{token}",
  tags: ["Decks"],
  request: { params: shareTokenParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: publicDeckDetailResponseSchema } },
      description: "Shared deck",
    },
  },
});

/** Public: GET /decks/share/{token} — anonymous view of a shared deck. 404 if the token does not match a public deck. */
export const publicDecksRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getPublicDeckByShareToken,
  async (c) => {
    const { decks } = c.get("repos");
    const { token } = c.req.valid("param");

    const found = await decks.findByShareToken(token);
    assertFound(found, "Not found");

    const cards = await decks.cardsForDeck(found.deck.id, found.deck.userId);

    const response: PublicDeckDetailResponse = {
      deck: toPublicDeck(found.deck),
      cards: cards.map((r) => toDeckCard(r)),
      owner: { displayName: found.ownerName ?? "Anonymous" },
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(response);
  },
);
