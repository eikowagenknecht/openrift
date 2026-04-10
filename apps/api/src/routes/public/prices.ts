import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { TIME_RANGE_DAYS, centsToDollars, formatDateUTC } from "@openrift/shared";
import type { Marketplace, PriceHistoryResponse, PriceMap, PricesResponse } from "@openrift/shared";
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
   * `GET /prices` — Returns the latest market price per marketplace for every printing.
   *
   * Uses `DISTINCT ON` to efficiently pick only the most recent snapshot per
   * marketplace source without scanning the full `marketplace_snapshots` table.
   * Returned as `{ [printingId]: { tcgplayer?, cardmarket?, cardtrader? } }`,
   * with each value in dollars.
   */
  .openapi(getPrices, async (c) => {
    const { marketplace } = c.get("repos");

    const rows = await marketplace.latestPrices();

    const prices: PriceMap = {};
    for (const row of rows) {
      let entry = prices[row.printingId];
      if (!entry) {
        entry = {};
        prices[row.printingId] = entry;
      }
      entry[row.marketplace as Marketplace] = centsToDollars(row.marketCents);
    }

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json({ prices } satisfies PricesResponse);
  })
  /**
   * `GET /prices/:printingId/history` — Returns price history for a single printing.
   *
   * Accepts a printing UUID. Returns snapshots for TCGPlayer (USD), Cardmarket
   * (EUR), and CardTrader (EUR) when available. CardTrader snapshots only carry
   * `low` (cheapest available listing) since the API exposes no separate market
   * value. The `range` query param controls the lookback window (`7d`, `30d`,
   * `90d`, `all`); defaults to `30d`.
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
        tcgplayer: {
          available: false,
          productId: null,
          snapshots: [],
          languageAggregate: false,
        },
        cardmarket: {
          available: false,
          productId: null,
          snapshots: [],
          languageAggregate: true,
        },
        cardtrader: {
          available: false,
          productId: null,
          snapshots: [],
          languageAggregate: false,
        },
      } satisfies PriceHistoryResponse);
    }

    const tcgSource = sources.find((s) => s.marketplace === ("tcgplayer" satisfies Marketplace));
    const cmSource = sources.find((s) => s.marketplace === ("cardmarket" satisfies Marketplace));
    const ctSource = sources.find((s) => s.marketplace === ("cardtrader" satisfies Marketplace));

    const [tcgRows, cmRows, ctRows] = await Promise.all([
      tcgSource ? marketplace.snapshots(tcgSource.variantId, cutoff) : [],
      cmSource ? marketplace.snapshots(cmSource.variantId, cutoff) : [],
      ctSource ? marketplace.snapshots(ctSource.variantId, cutoff) : [],
    ]);

    const tcgSnapshots: PriceHistoryResponse["tcgplayer"]["snapshots"] = [];
    for (const r of tcgRows) {
      if (r.marketCents === null) {
        continue;
      }
      tcgSnapshots.push({
        date: formatDateUTC(r.recordedAt),
        market: centsToDollars(r.marketCents),
        low: centsToDollars(r.lowCents),
      });
    }

    const cmSnapshots: PriceHistoryResponse["cardmarket"]["snapshots"] = [];
    for (const r of cmRows) {
      // Display Cardmarket's cheapest current listing as the headline. Their
      // `avg` field (stored in market_cents) is a sales-history mean that
      // occasionally spikes from a single anomalous listing/sale.
      const headline = r.lowCents ?? r.marketCents;
      if (headline === null) {
        continue;
      }
      cmSnapshots.push({
        date: formatDateUTC(r.recordedAt),
        market: centsToDollars(headline),
        low: centsToDollars(r.lowCents),
      });
    }

    const ctSnapshots: PriceHistoryResponse["cardtrader"]["snapshots"] = [];
    for (const r of ctRows) {
      if (r.lowCents === null) {
        continue;
      }
      ctSnapshots.push({
        date: formatDateUTC(r.recordedAt),
        low: centsToDollars(r.lowCents),
      });
    }

    const response: PriceHistoryResponse = {
      tcgplayer: {
        available: Boolean(tcgSource),
        productId: tcgSource?.externalId ?? null,
        snapshots: tcgSnapshots,
        languageAggregate: false,
      },
      cardmarket: {
        available: Boolean(cmSource),
        productId: cmSource?.externalId ?? null,
        snapshots: cmSnapshots,
        // Cardmarket's price guide is a cross-language aggregate. The
        // sourcesForPrinting fan-out means this same variant is surfaced on
        // every language of the card; the UI labels it "(any language)".
        languageAggregate: true,
      },
      cardtrader: {
        available: Boolean(ctSource),
        productId: ctSource?.externalId ?? null,
        snapshots: ctSnapshots,
        languageAggregate: false,
      },
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(response);
  });
