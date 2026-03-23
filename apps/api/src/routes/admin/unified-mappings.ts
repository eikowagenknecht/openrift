import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { saveMappings, unmapAll, unmapPrinting } from "../../services/marketplace-mapping.js";
import { buildUnifiedMappingsResponse } from "../../services/unified-mapping-merge.js";
import type { Variables } from "../../types.js";
import { createMarketplaceConfigs } from "./marketplace-configs.js";

// ── Schemas ─────────────────────────────────────────────────────────────────

const marketplaceSchema = z.object({
  marketplace: z.enum(["tcgplayer", "cardmarket", "cardtrader"]),
});

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

// ── Route ───────────────────────────────────────────────────────────────────

export const unifiedMappingsRoute = new Hono<{ Variables: Variables }>()

  .get(
    "/marketplace-mappings",
    zValidator("query", z.object({ all: z.string().optional() })),
    async (c) => {
      const db = c.get("db");
      const { getMappingOverview } = c.get("services");
      const { tcgplayer, cardmarket, cardtrader } = createMarketplaceConfigs(db);
      const showAll = c.req.valid("query").all === "true";

      const result = await buildUnifiedMappingsResponse(
        db,
        tcgplayer,
        cardmarket,
        cardtrader,
        getMappingOverview,
        showAll,
      );

      return c.json(result);
    },
  )

  .post(
    "/marketplace-mappings",
    zValidator("query", marketplaceSchema),
    zValidator("json", saveMappingsSchema),
    async (c) => {
      const db = c.get("db");
      const { marketplace } = c.req.valid("query");
      const configs = createMarketplaceConfigs(db);
      const config = configs[marketplace];
      const { mappings } = c.req.valid("json");
      const result = await saveMappings(db, config, mappings);
      return c.json(result);
    },
  )

  .delete(
    "/marketplace-mappings",
    zValidator("query", marketplaceSchema),
    zValidator("json", unmapSchema),
    async (c) => {
      const db = c.get("db");
      const { marketplace } = c.req.valid("query");
      const configs = createMarketplaceConfigs(db);
      const config = configs[marketplace];
      const { printingId } = c.req.valid("json");
      await unmapPrinting(db, config, printingId);
      return c.body(null, 204);
    },
  )

  .delete("/marketplace-mappings/all", zValidator("query", marketplaceSchema), async (c) => {
    const db = c.get("db");
    const { marketplace } = c.req.valid("query");
    const configs = createMarketplaceConfigs(db);
    const config = configs[marketplace];
    const result = await unmapAll(db, config);
    return c.json({ unmapped: result.unmapped });
  });
