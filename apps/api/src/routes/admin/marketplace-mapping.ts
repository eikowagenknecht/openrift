import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { requireAdmin } from "../../middleware/require-admin.js";
import {
  getMappingOverview,
  saveMappings,
  unmapAll,
  unmapPrinting,
} from "../../services/marketplace-mapping.js";
import type { Variables } from "../../types.js";
import { createMarketplaceConfigs } from "./marketplace-configs.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const querySchema = z.object({ all: z.string().optional() });

const saveMappingsSchema = z.object({
  mappings: z.array(
    z.object({
      printingId: z.string(),
      externalId: z.number(),
    }),
  ),
});

const unmapSchema = z.object({
  printingId: z.string(),
});

// ── TCGPlayer mappings ──────────────────────────────────────────────────────

export const tcgplayerMappingsRoute = new Hono<{ Variables: Variables }>()
  .use("/admin/tcgplayer-mappings", requireAdmin)
  .use("/admin/tcgplayer-mappings/all", requireAdmin)

  .get("/admin/tcgplayer-mappings", zValidator("query", querySchema), async (c) => {
    const db = c.get("db");
    const { tcgplayer: tcgplayerConfig } = createMarketplaceConfigs(db);
    const showAll = c.req.valid("query").all === "true";
    const result = await getMappingOverview(db, tcgplayerConfig);
    if (!showAll) {
      result.groups = result.groups.filter((g) => g.printings.some((p) => p.externalId === null));
    }
    return c.json(result);
  })

  .post("/admin/tcgplayer-mappings", zValidator("json", saveMappingsSchema), async (c) => {
    const db = c.get("db");
    const { tcgplayer: tcgplayerConfig } = createMarketplaceConfigs(db);
    const { mappings } = c.req.valid("json");
    const result = await saveMappings(db, tcgplayerConfig, mappings);
    return c.json(result);
  })

  .delete("/admin/tcgplayer-mappings", zValidator("json", unmapSchema), async (c) => {
    const db = c.get("db");
    const { tcgplayer: tcgplayerConfig } = createMarketplaceConfigs(db);
    const { printingId } = c.req.valid("json");
    await unmapPrinting(db, tcgplayerConfig, printingId);
    return c.body(null, 204);
  })

  .delete("/admin/tcgplayer-mappings/all", async (c) => {
    const db = c.get("db");
    const { tcgplayer: tcgplayerConfig } = createMarketplaceConfigs(db);
    const result = await unmapAll(db, tcgplayerConfig);
    return c.json({ unmapped: result.unmapped });
  });

// ── Cardmarket mappings ─────────────────────────────────────────────────────

export const cardmarketMappingsRoute = new Hono<{ Variables: Variables }>()
  .use("/admin/cardmarket-mappings", requireAdmin)
  .use("/admin/cardmarket-mappings/all", requireAdmin)

  .get("/admin/cardmarket-mappings", zValidator("query", querySchema), async (c) => {
    const db = c.get("db");
    const { cardmarket: cardmarketConfig } = createMarketplaceConfigs(db);
    const showAll = c.req.valid("query").all === "true";
    const result = await getMappingOverview(db, cardmarketConfig);
    if (!showAll) {
      result.groups = result.groups.filter((g) => g.printings.some((p) => p.externalId === null));
    }
    return c.json(result);
  })

  .post("/admin/cardmarket-mappings", zValidator("json", saveMappingsSchema), async (c) => {
    const db = c.get("db");
    const { cardmarket: cardmarketConfig } = createMarketplaceConfigs(db);
    const { mappings } = c.req.valid("json");
    const result = await saveMappings(db, cardmarketConfig, mappings);
    return c.json(result);
  })

  .delete("/admin/cardmarket-mappings", zValidator("json", unmapSchema), async (c) => {
    const db = c.get("db");
    const { cardmarket: cardmarketConfig } = createMarketplaceConfigs(db);
    const { printingId } = c.req.valid("json");
    await unmapPrinting(db, cardmarketConfig, printingId);
    return c.body(null, 204);
  })

  .delete("/admin/cardmarket-mappings/all", async (c) => {
    const db = c.get("db");
    const { cardmarket: cardmarketConfig } = createMarketplaceConfigs(db);
    const result = await unmapAll(db, cardmarketConfig);
    return c.json({ unmapped: result.unmapped });
  });
