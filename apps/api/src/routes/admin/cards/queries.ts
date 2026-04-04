import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "zod";

import {
  buildCandidateCardDetail,
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
              id: z.string(),
              slug: z.string(),
              name: z.string(),
              type: z.string(),
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
        "application/json": { schema: z.array(z.string()) },
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
        "application/json": { schema: z.array(z.string()) },
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
              provider: z.string(),
              cardCount: z.number(),
              printingCount: z.number(),
              lastUpdated: z.string(),
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
  path: "/{cardId}",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardId: z.string() }),
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
    const { candidateCards } = c.get("repos");
    return c.json(await buildCandidateCardList(candidateCards));
  })

  .openapi(exportCandidates, async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await buildExport(candidateCards));
  })

  .openapi(getCandidateCard, async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await buildCandidateCardDetail(candidateCards, c.req.valid("param").cardId));
  })

  .openapi(getUnmatchedDetail, async (c) => {
    const { candidateCards } = c.get("repos");
    const name = decodeURIComponent(c.req.valid("param").name);
    return c.json(await buildUnmatchedDetail(candidateCards, name));
  });
