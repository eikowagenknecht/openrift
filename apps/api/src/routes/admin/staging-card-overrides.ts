import { OpenAPIHono, createRoute } from "@hono/zod-openapi";

import type { Variables } from "../../types.js";
import { deleteOverrideSchema, stagingCardOverrideSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const createOverride = createRoute({
  method: "post",
  path: "/staging-card-overrides",
  tags: ["Admin - Staging"],
  request: {
    body: { content: { "application/json": { schema: stagingCardOverrideSchema } } },
  },
  responses: {
    204: { description: "Override created" },
  },
});

const deleteOverride = createRoute({
  method: "delete",
  path: "/staging-card-overrides",
  tags: ["Admin - Staging"],
  request: {
    body: { content: { "application/json": { schema: deleteOverrideSchema } } },
  },
  responses: {
    204: { description: "Override deleted" },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const stagingCardOverridesRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── POST /admin/staging-card-overrides ────────────────────────────────────

  .openapi(createOverride, async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace, externalId, finish, language, cardId } = c.req.valid("json");

    await mktAdmin.upsertStagingCardOverride({
      marketplace,
      externalId,
      finish,
      language,
      cardId,
    });

    return c.body(null, 204);
  })

  // ── DELETE /admin/staging-card-overrides ──────────────────────────────────

  .openapi(deleteOverride, async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace, externalId, finish, language } = c.req.valid("json");

    await mktAdmin.deleteStagingCardOverride(marketplace, externalId, finish, language);

    return c.body(null, 204);
  });
