import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import { saveMappings, unmapAll, unmapPrinting } from "../../services/marketplace-mapping.js";
import {
  buildUnifiedMappingsCardResponse,
  buildUnifiedMappingsResponse,
} from "../../services/unified-mapping-merge.js";
import type { Variables } from "../../types.js";
import { createMarketplaceConfigs } from "./marketplace-configs.js";
import { marketplaceSchema, saveMappingsSchema, unmapSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listMappings = createRoute({
  method: "get",
  path: "/marketplace-mappings",
  tags: ["Admin - Mappings"],
  request: {
    query: z.object({ all: z.string().optional() }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({}).passthrough() },
      },
      description: "Unified mappings",
    },
  },
});

const cardMappings = createRoute({
  method: "get",
  path: "/marketplace-mappings/card/{cardId}",
  tags: ["Admin - Mappings"],
  request: {
    params: z.object({ cardId: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({}).passthrough() },
      },
      description: "Unified mappings for a single card",
    },
  },
});

const saveMappingsRoute = createRoute({
  method: "post",
  path: "/marketplace-mappings",
  tags: ["Admin - Mappings"],
  request: {
    query: marketplaceSchema,
    body: { content: { "application/json": { schema: saveMappingsSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            saved: z.number().openapi({ example: 312 }),
            skipped: z.array(
              z.object({
                externalId: z.number().openapi({ example: 748_215 }),
                reason: z.string().openapi({ example: "Already mapped to a different printing" }),
              }),
            ),
          }),
        },
      },
      description: "Mappings saved",
    },
  },
});

const unmapPrintingRoute = createRoute({
  method: "delete",
  path: "/marketplace-mappings",
  tags: ["Admin - Mappings"],
  request: {
    query: marketplaceSchema,
    body: { content: { "application/json": { schema: unmapSchema } } },
  },
  responses: {
    204: { description: "Printing unmapped" },
  },
});

const unmapAllRoute = createRoute({
  method: "delete",
  path: "/marketplace-mappings/all",
  tags: ["Admin - Mappings"],
  request: {
    query: marketplaceSchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ unmapped: z.number().openapi({ example: 312 }) }),
        },
      },
      description: "All mappings removed",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const unifiedMappingsRoute = new OpenAPIHono<{ Variables: Variables }>()

  .openapi(listMappings, async (c) => {
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
  })

  .openapi(cardMappings, async (c) => {
    const repos = c.get("repos");
    const { getMappingOverview } = c.get("services");
    const { tcgplayer, cardmarket, cardtrader } = createMarketplaceConfigs(repos);
    const { cardId } = c.req.valid("param");

    const result = await buildUnifiedMappingsCardResponse(
      repos,
      tcgplayer,
      cardmarket,
      cardtrader,
      getMappingOverview,
      cardId,
    );

    return c.json(result);
  })

  .openapi(saveMappingsRoute, async (c) => {
    const repos = c.get("repos");
    const transact = c.get("transact");
    const { marketplace } = c.req.valid("query");
    const configs = createMarketplaceConfigs(repos);
    const config = configs[marketplace];
    const { mappings } = c.req.valid("json");
    const result = await saveMappings(transact, config, mappings);
    return c.json(result);
  })

  .openapi(unmapPrintingRoute, async (c) => {
    const repos = c.get("repos");
    const transact = c.get("transact");
    const { marketplace } = c.req.valid("query");
    const configs = createMarketplaceConfigs(repos);
    const config = configs[marketplace];
    const { printingId } = c.req.valid("json");
    await unmapPrinting(transact, config, printingId);
    return c.body(null, 204);
  })

  .openapi(unmapAllRoute, async (c) => {
    const repos = c.get("repos");
    const transact = c.get("transact");
    const { marketplace } = c.req.valid("query");
    const configs = createMarketplaceConfigs(repos);
    const config = configs[marketplace];
    const result = await unmapAll(transact, config);
    return c.json({ unmapped: result.unmapped });
  });
