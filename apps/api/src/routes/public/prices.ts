import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { TIME_RANGE_DAYS, centsToDollars, formatDateUTC } from "@openrift/shared";
import type { Marketplace, PriceHistoryResponse, PricesResponse } from "@openrift/shared";
import {
  priceHistoryResponseSchema,
  pricesResponseSchema,
} from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";

import type { Variables } from "../../types.js";
import { printingIdParamSchema, rangeQuerySchema } from "./schemas.js";

const getPrices = createRoute({
  method: "get",
  path: "/prices",
  tags: ["Prices"],
  responses: {
    200: {
      content: { "application/json": { schema: pricesResponseSchema } },
      description: "Latest prices for all printings",
    },
  },
});

const getPriceHistory = createRoute({
  method: "get",
  path: "/prices/{printingId}/history",
  tags: ["Prices"],
  request: {
    params: printingIdParamSchema,
    query: rangeQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: priceHistoryResponseSchema } },
      description: "Price history for a printing",
    },
  },
});

const pricesApp = new OpenAPIHono<{ Variables: Variables }>();
pricesApp.use("/prices", etag());
pricesApp.use("/prices/:printingId/history", etag());
export const pricesRoute = pricesApp
  /**
   * `GET /prices` — Returns the latest TCGPlayer market price for every printing.
   *
   * Uses `DISTINCT ON` to efficiently pick only the most recent snapshot per
   * marketplace source without scanning the full `marketplace_snapshots` table.
   * Prices are returned as a `{ [printingId]: dollars }` map.
   */
  .openapi(getPrices, async (c) => {
    const { marketplace } = c.get("repos");

    const rows = await marketplace.latestPrices();

    // This endpoint returns a simple printingId → USD price map (TCGplayer only).
    const prices: Record<string, number> = {};
    for (const row of rows) {
      if (row.marketplace === "tcgplayer") {
        prices[row.printingId] = centsToDollars(row.marketCents);
      }
    }

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json({ prices } satisfies PricesResponse);
  })
  /**
   * `GET /prices/:printingId/history` — Returns price history for a single printing.
   *
   * Accepts a printing UUID. Returns snapshots for both TCGPlayer (USD)
   * and Cardmarket (EUR) when available. The `range` query param controls the
   * lookback window (`7d`, `30d`, `90d`, `all`); defaults to `30d`.
   *
   * Returns `available: false` (not a 404) when the printing or marketplace
   * source doesn't exist, so the frontend can render an empty state without
   * special error handling.
   */
  .openapi(getPriceHistory, async (c) => {
    const { catalog, marketplace } = c.get("repos");

    const { printingId } = c.req.valid("param");
    const rangeParam = c.req.valid("query").range;
    const days = TIME_RANGE_DAYS[rangeParam];
    const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

    const [printing, sources] = await Promise.all([
      catalog.printingById(printingId),
      marketplace.sourcesForPrinting(printingId),
    ]);

    if (!printing) {
      return c.json({
        printingId,
        tcgplayer: { available: false, currency: "USD", productId: null, snapshots: [] },
        cardmarket: { available: false, currency: "EUR", productId: null, snapshots: [] },
        cardtrader: { available: false, currency: "EUR", productId: null, snapshots: [] },
      } satisfies PriceHistoryResponse);
    }

    const tcgSource = sources.find((s) => s.marketplace === ("tcgplayer" satisfies Marketplace));
    const cmSource = sources.find((s) => s.marketplace === ("cardmarket" satisfies Marketplace));
    const ctSource = sources.find((s) => s.marketplace === ("cardtrader" satisfies Marketplace));

    const [tcgRows, cmRows, ctRows] = await Promise.all([
      tcgSource ? marketplace.snapshots(tcgSource.id, cutoff) : [],
      cmSource ? marketplace.snapshots(cmSource.id, cutoff) : [],
      ctSource ? marketplace.snapshots(ctSource.id, cutoff) : [],
    ]);

    const tcgSnapshots = tcgRows.map((r) => ({
      date: formatDateUTC(r.recordedAt),
      market: centsToDollars(r.marketCents),
      low: centsToDollars(r.lowCents),
      mid: centsToDollars(r.midCents),
      high: centsToDollars(r.highCents),
    }));

    const cmSnapshots = cmRows.map((r) => ({
      date: formatDateUTC(r.recordedAt),
      market: centsToDollars(r.marketCents),
      low: centsToDollars(r.lowCents),
      trend: centsToDollars(r.trendCents),
      avg1: centsToDollars(r.avg1Cents),
      avg7: centsToDollars(r.avg7Cents),
      avg30: centsToDollars(r.avg30Cents),
    }));

    const ctSnapshots = ctRows.map((r) => ({
      date: formatDateUTC(r.recordedAt),
      market: centsToDollars(r.marketCents),
    }));

    const response: PriceHistoryResponse = {
      printingId: printing.id,
      tcgplayer: {
        available: Boolean(tcgSource),
        currency: "USD",
        productId: tcgSource?.externalId ?? null,
        snapshots: tcgSnapshots,
      },
      cardmarket: {
        available: Boolean(cmSource),
        currency: "EUR",
        productId: cmSource?.externalId ?? null,
        snapshots: cmSnapshots,
      },
      cardtrader: {
        available: Boolean(ctSource),
        currency: "EUR",
        productId: ctSource?.externalId ?? null,
        snapshots: ctSnapshots,
      },
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(response);
  });
