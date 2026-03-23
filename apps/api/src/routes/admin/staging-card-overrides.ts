import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import type { Variables } from "../../types.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const stagingCardOverrideSchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
  externalId: z.number(),
  finish: z.string(),
  cardId: z.string(),
});

const deleteOverrideSchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
  externalId: z.number(),
  finish: z.string(),
});

// ── Route ───────────────────────────────────────────────────────────────────

export const stagingCardOverridesRoute = new Hono<{ Variables: Variables }>()

  // ── POST /admin/staging-card-overrides ────────────────────────────────────

  .post("/staging-card-overrides", zValidator("json", stagingCardOverrideSchema), async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace, externalId, finish, cardId } = c.req.valid("json");

    await mktAdmin.upsertStagingCardOverride({
      marketplace,
      externalId,
      finish,
      cardId,
    });

    return c.body(null, 204);
  })

  // ── DELETE /admin/staging-card-overrides ──────────────────────────────────

  .delete("/staging-card-overrides", zValidator("json", deleteOverrideSchema), async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace, externalId, finish } = c.req.valid("json");

    await mktAdmin.deleteStagingCardOverride(marketplace, externalId, finish);

    return c.body(null, 204);
  });
