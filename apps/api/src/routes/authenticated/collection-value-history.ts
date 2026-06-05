import { createRoute } from "@hono/zod-openapi";
import { TIME_RANGE_DAYS } from "@openrift/shared";
import type { TimeRange } from "@openrift/shared";
import { collectionValueHistoryResponseSchema } from "@openrift/shared/response-schemas";
import { collectionValueHistoryQuerySchema } from "@openrift/shared/schemas";

import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { cookieAuth, errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";

const getValueHistory = createRoute({
  method: "get",
  path: "/",
  tags: ["Collection Value History"],
  security: cookieAuth,
  request: { query: collectionValueHistoryQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: collectionValueHistoryResponseSchema } },
      description: "Success",
    },
    ...errorResponses(400, 401),
  },
});

const collectionValueHistoryApp = createApiApp().basePath("/collection-value-history");
collectionValueHistoryApp.use(requireAuth);

export const collectionValueHistoryRoute = collectionValueHistoryApp.openapi(
  getValueHistory,
  async (c) => {
    const { marketplace: repos } = c.get("repos");
    const userId = getUserId(c);
    const query = c.req.valid("query");

    const days = TIME_RANGE_DAYS[query.range as TimeRange];
    const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

    const collectionIds = query.collectionIds?.split(",").filter(Boolean) ?? null;

    const series = await repos.collectionValueTimeSeries({
      userId,
      marketplace: query.marketplace,
      collectionIds: collectionIds?.length ? collectionIds : null,
      cutoff,
      scope: {
        sets: query.sets?.split(",").filter(Boolean),
        languages: query.languages?.split(",").filter(Boolean),
        domains: query.domains?.split(",").filter(Boolean),
        types: query.types?.split(",").filter(Boolean),
        rarities: query.rarities?.split(",").filter(Boolean),
        finishes: query.finishes?.split(",").filter(Boolean),
        artVariants: query.artVariants?.split(",").filter(Boolean),
        promos: query.promos,
        signed: query.signed === "true" ? true : query.signed === "false" ? false : undefined,
        banned: query.banned === "true" ? true : query.banned === "false" ? false : undefined,
        errata: query.errata === "true" ? true : query.errata === "false" ? false : undefined,
      },
    });

    return c.json(
      {
        series: series.map((point) => ({
          date: point.date,
          valueCents: point.valueCents, // integer cents
          copyCount: point.copyCount,
        })),
      },
      200,
    );
  },
);
