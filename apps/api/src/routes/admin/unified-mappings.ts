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
      const repos = c.get("repos");
      const { getMappingOverview } = c.get("services");
      const { tcgplayer, cardmarket, cardtrader } = createMarketplaceConfigs(repos);
      const showAll = c.req.valid("query").all === "true";

      const result = await buildUnifiedMappingsResponse(
        repos,
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
      const repos = c.get("repos");
      const transact = c.get("transact");
      const { marketplace } = c.req.valid("query");
      const configs = createMarketplaceConfigs(repos);
      const config = configs[marketplace];
      const { mappings } = c.req.valid("json");
      const result = await saveMappings(transact, config, mappings);
      return c.json(result);
    },
  )

  .delete(
    "/marketplace-mappings",
    zValidator("query", marketplaceSchema),
    zValidator("json", unmapSchema),
    async (c) => {
      const repos = c.get("repos");
      const transact = c.get("transact");
      const { marketplace } = c.req.valid("query");
      const configs = createMarketplaceConfigs(repos);
      const config = configs[marketplace];
      const { printingId } = c.req.valid("json");
      await unmapPrinting(transact, config, printingId);
      return c.body(null, 204);
    },
  )

  .delete("/marketplace-mappings/all", zValidator("query", marketplaceSchema), async (c) => {
    const repos = c.get("repos");
    const transact = c.get("transact");
    const { marketplace } = c.req.valid("query");
    const configs = createMarketplaceConfigs(repos);
    const config = configs[marketplace];
    const result = await unmapAll(transact, config);
    return c.json({ unmapped: result.unmapped });
  });
