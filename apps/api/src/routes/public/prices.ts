import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { TIME_RANGE_DAYS, centsToDollars, formatDateUTC } from "@openrift/shared";
import type {
  Marketplace,
  MarketplaceInfo,
  MarketplaceInfoResponse,
  PriceHistoryResponse,
  PriceMap,
  PricesResponse,
} from "@openrift/shared";
import {
  marketplaceInfoResponseSchema,
  priceHistoryResponseSchema,
  pricesResponseSchema,
} from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";

import type { Variables } from "../../types.js";
import { marketplaceInfoQuerySchema, printingIdParamSchema, rangeQuerySchema } from "./schemas.js";

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

const getMarketplaceInfo = createRoute({
  method: "get",
  path: "/prices/marketplace-info",
  tags: ["Prices"],
  request: { query: marketplaceInfoQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: marketplaceInfoResponseSchema } },
      description: "Marketplace source metadata (productId, availability) for printings",
    },
  },
});

function emptyMarketplaceInfo(): MarketplaceInfo {
  return {
    available: false,
    productId: null,
  };
}

const pricesApp = new OpenAPIHono<{ Variables: Variables }>();
pricesApp.use("/prices", etag());
pricesApp.use("/prices/:printingId/history", etag());
pricesApp.use("/prices/marketplace-info", etag());
export const pricesRoute = pricesApp
  /**
   * `GET /prices` — Returns the latest market price per marketplace for every printing.
   *
   * Uses `DISTINCT ON` to efficiently pick only the most recent price row per
   * marketplace source without scanning the full `marketplace_product_prices` table.
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

    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return c.json({ prices } satisfies PricesResponse);
  })
  /**
   * `GET /prices/:printingId/history` — Returns price history for a single printing.
   *
   * Accepts a printing UUID. Returns snapshots for TCGPlayer (USD), Cardmarket
   * (EUR), and CardTrader (EUR) when available. CardTrader snapshots carry
   * `zeroLow` (cheapest among CT Zero / hub-eligible sellers — the headline
   * price) and `low` (cheapest across all sellers — a secondary figure).
   * Either may be null; the snapshot is emitted when at least one is known.
   * The `range` query param controls the lookback window (`7d`, `30d`, `90d`,
   * `all`); defaults to `30d`.
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
        tcgplayer: { available: false, productId: null, snapshots: [] },
        cardmarket: { available: false, productId: null, snapshots: [] },
        cardtrader: { available: false, productId: null, snapshots: [] },
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
      const market = r.marketCents ?? r.lowCents;
      if (market === null) {
        continue;
      }
      cmSnapshots.push({
        date: formatDateUTC(r.recordedAt),
        market: centsToDollars(market),
        low: centsToDollars(r.lowCents),
      });
    }

    const ctSnapshots: PriceHistoryResponse["cardtrader"]["snapshots"] = [];
    for (const r of ctRows) {
      if (r.zeroLowCents === null && r.lowCents === null) {
        continue;
      }
      ctSnapshots.push({
        date: formatDateUTC(r.recordedAt),
        zeroLow: centsToDollars(r.zeroLowCents),
        low: centsToDollars(r.lowCents),
      });
    }

    const response: PriceHistoryResponse = {
      tcgplayer: {
        available: Boolean(tcgSource),
        productId: tcgSource?.externalId ?? null,
        snapshots: tcgSnapshots,
      },
      cardmarket: {
        available: Boolean(cmSource),
        productId: cmSource?.externalId ?? null,
        snapshots: cmSnapshots,
      },
      cardtrader: {
        available: Boolean(ctSource),
        productId: ctSource?.externalId ?? null,
        snapshots: ctSnapshots,
      },
    };

    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return c.json(response);
  })
  /**
   * `GET /prices/marketplace-info?printings=uuid1,uuid2,...` — Batch variant of
   * the `productId` / `available` fields from the history endpoint.
   *
   * Returns source metadata only (no snapshots) so the frontend can craft
   * deep-link marketplace URLs for an arbitrary set of printings (e.g. every
   * missing card in a deck) with a single request. Unmapped printings and
   * unmapped marketplaces get `available: false` and `productId: null`.
   */
  .openapi(getMarketplaceInfo, async (c) => {
    const { marketplace } = c.get("repos");
    const { printings } = c.req.valid("query");

    const rows = await marketplace.sourcesForPrintings(printings);

    const infos: MarketplaceInfoResponse["infos"] = {};
    for (const printingId of printings) {
      infos[printingId] = {
        tcgplayer: emptyMarketplaceInfo(),
        cardmarket: emptyMarketplaceInfo(),
        cardtrader: emptyMarketplaceInfo(),
      };
    }
    for (const row of rows) {
      const entry = infos[row.printingId];
      if (!entry) {
        continue;
      }
      entry[row.marketplace as Marketplace] = {
        available: true,
        productId: row.externalId,
      };
    }

    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return c.json({ infos } satisfies MarketplaceInfoResponse);
  });
