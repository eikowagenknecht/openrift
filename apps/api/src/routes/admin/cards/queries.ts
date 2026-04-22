import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import {
  buildCardDetail,
  buildCandidateCardList,
  buildExport,
  buildUnmatchedDetail,
} from "../../../services/candidate-queries.js";
import type { Variables } from "../../../types.js";
import { candidateCardSummarySchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const allCards = createRoute({
  method: "get",
  path: "/all-cards",
  tags: ["Admin - Cards"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string().openapi({ example: "019cfc3b-0389-744b-837c-792fd586300e" }),
              slug: z.string().openapi({ example: "jinx-rebel" }),
              name: z.string().openapi({ example: "Jinx, Rebel" }),
              type: z.string().openapi({ example: "Unit" }),
              setSlugs: z.array(z.string()).openapi({ example: ["ogn", "unleashed"] }),
            }),
          ),
        },
      },
      description: "All candidate cards",
    },
  },
});

const providerNames = createRoute({
  method: "get",
  path: "/provider-names",
  tags: ["Admin - Cards"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(z.string()).openapi({ example: ["riftcore", "ocr", "justtcg"] }),
        },
      },
      description: "Distinct provider names",
    },
  },
});

const distinctArtists = createRoute({
  method: "get",
  path: "/distinct-artists",
  tags: ["Admin - Cards"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(z.string()).openapi({ example: ["Kudos Productions", "Six More Vodka"] }),
        },
      },
      description: "Distinct artist names from published printings",
    },
  },
});

const providerStats = createRoute({
  method: "get",
  path: "/provider-stats",
  tags: ["Admin - Cards"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              provider: z.string().openapi({ example: "riftcore" }),
              cardCount: z.number().openapi({ example: 312 }),
              printingCount: z.number().openapi({ example: 468 }),
              lastUpdated: z.string().openapi({ example: "2026-04-07T07:52:01.623Z" }),
            }),
          ),
        },
      },
      description: "Provider statistics",
    },
  },
});

const listCandidates = createRoute({
  method: "get",
  path: "/",
  tags: ["Admin - Cards"],
  responses: {
    200: {
      content: {
        "application/json": { schema: z.array(candidateCardSummarySchema) },
      },
      description: "Candidate card list",
    },
  },
});

const exportCandidates = createRoute({
  method: "get",
  path: "/export",
  tags: ["Admin - Cards"],
  responses: {
    200: {
      content: {
        "application/json": { schema: z.array(z.object({}).passthrough()) },
      },
      description: "Export candidates",
    },
  },
});

const getCandidateCard = createRoute({
  method: "get",
  path: "/{cardSlug}",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardSlug: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({}).passthrough() },
      },
      description: "Candidate card detail",
    },
  },
});

const getUnmatchedDetail = createRoute({
  method: "get",
  path: "/new/{name}",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ name: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({}).passthrough() },
      },
      description: "Unmatched candidate detail",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const queriesRoute = new OpenAPIHono<{ Variables: Variables }>()
  .openapi(allCards, async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await candidateCards.listAllCards());
  })

  .openapi(providerNames, async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await candidateCards.distinctProviderNames());
  })

  .openapi(distinctArtists, async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await candidateCards.distinctArtists());
  })

  .openapi(providerStats, async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await candidateCards.providerStats());
  })

  .openapi(listCandidates, async (c) => {
    const { candidateCards, providerSettings } = c.get("repos");
    const favoriteProviders = await providerSettings.favoriteProviders();
    return c.json(await buildCandidateCardList(candidateCards, favoriteProviders));
  })

  .openapi(exportCandidates, async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await buildExport(candidateCards));
  })

  .openapi(getCandidateCard, async (c) => {
    const { candidateCards, marketplaceMapping } = c.get("repos");
    return c.json(
      await buildCardDetail(candidateCards, marketplaceMapping, c.req.valid("param").cardSlug),
    );
  })

  .openapi(getUnmatchedDetail, async (c) => {
    const { candidateCards } = c.get("repos");
    const name = decodeURIComponent(c.req.valid("param").name);
    return c.json(await buildUnmatchedDetail(candidateCards, name));
  });
