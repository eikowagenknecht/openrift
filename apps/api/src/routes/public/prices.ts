import {
  MARKETPLACE_CURRENCY,
  PRICE_STALE_AFTER_DAYS,
  TIME_RANGE_DAYS,
  formatDay,
} from "@openrift/shared";
import type {
  Marketplace,
  MarketplaceInfo,
  MarketplaceInfoResponse,
  PriceHistoryResponse,
  PriceMap,
  PricesResponse,
} from "@openrift/shared";
import { pricesContract } from "@openrift/shared/contracts/prices";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(pricesContract).$context<ApiContext>().use(requireUser);

function emptyMarketplaceInfo(): MarketplaceInfo {
  return {
    available: false,
    productId: null,
  };
}

/**
 * Whole days between two `YYYY-MM-DD` days. Both are dates rather than
 * instants, so UTC midnight on each side keeps this free of timezone drift.
 * @returns The day count, never negative.
 */
function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Public price reads. An unknown printing in `history` resolves to an
 * `available: false` payload (200) rather than a 404. The short-TTL
 * `Cache-Control` is applied uniformly in the mount.
 */
export const pricesRouter = {
  /**
   * `GET /prices` — latest market price per marketplace for every printing.
   * Returned as `{ [printingId]: { tcgplayer?, cardmarket?, cardtrader? } }`
   * with integer-cents amounts; the web converts at the display boundary.
   */
  prices: os.prices.handler(async ({ context }): Promise<PricesResponse> => {
    const { marketplace } = context.repos;

    const rows = await marketplace.latestPrices();

    const prices: PriceMap = {};
    const stale: PricesResponse["stale"] = {};
    // Age against the freshest observation anywhere rather than the wall
    // clock: the pipeline runs on a cron, so "today" in the data can lag real
    // time by hours, and comparing to now() would report every price as a day
    // older than it is right after midnight.
    const newest = rows.reduce((max, row) => (row.lastSeen > max ? row.lastSeen : max), "");

    for (const row of rows) {
      let entry = prices[row.printingId];
      if (!entry) {
        entry = {};
        prices[row.printingId] = entry;
      }
      entry[row.marketplace as Marketplace] = row.marketCents;

      const age = daysBetween(row.lastSeen, newest);
      if (age > PRICE_STALE_AFTER_DAYS) {
        (stale[row.printingId] ??= {})[row.marketplace as Marketplace] = age;
      }
    }

    return { prices, currencies: MARKETPLACE_CURRENCY, stale };
  }),

  /**
   * `GET /prices/marketplace-info?printings=uuid1,uuid2,...` — batch source
   * metadata (productId / available) so the frontend can craft deep-link
   * marketplace URLs for an arbitrary set of printings in one request.
   */
  marketplaceInfo: os.marketplaceInfo.handler(
    async ({ input, context }): Promise<MarketplaceInfoResponse> => {
      const { marketplace } = context.repos;
      const { printings } = input;

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

      return { infos };
    },
  ),

  /**
   * `GET /prices/:printingId/history` — price history for a single printing.
   * Returns snapshots for TCGPlayer (USD), Cardmarket (EUR), and CardTrader
   * (EUR) when available; `range` (`7d`/`30d`/`90d`/`all`) controls the window.
   * An unknown printing / source returns `available: false` (not a 404).
   */
  history: os.history.handler(async ({ input, context }): Promise<PriceHistoryResponse> => {
    const { catalog, marketplace } = context.repos;

    const { printingId, range } = input;
    const days = TIME_RANGE_DAYS[range];
    const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

    const [printing, sources] = await Promise.all([
      catalog.printingById(printingId),
      marketplace.sourcesForPrinting(printingId),
    ]);

    if (!printing) {
      return {
        tcgplayer: {
          available: false,
          productId: null,
          currency: MARKETPLACE_CURRENCY.tcgplayer,
          snapshots: [],
        },
        cardmarket: {
          available: false,
          productId: null,
          currency: MARKETPLACE_CURRENCY.cardmarket,
          snapshots: [],
        },
        cardtrader: {
          available: false,
          productId: null,
          currency: MARKETPLACE_CURRENCY.cardtrader,
          snapshots: [],
        },
      };
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
        date: formatDay(r.recordedAt),
        market: r.marketCents,
        low: r.lowCents,
      });
    }

    const cmSnapshots: PriceHistoryResponse["cardmarket"]["snapshots"] = [];
    for (const r of cmRows) {
      const market = r.marketCents ?? r.lowCents;
      if (market === null) {
        continue;
      }
      cmSnapshots.push({
        date: formatDay(r.recordedAt),
        market,
        low: r.lowCents,
      });
    }

    const ctSnapshots: PriceHistoryResponse["cardtrader"]["snapshots"] = [];
    for (const r of ctRows) {
      if (r.zeroLowCents === null && r.lowCents === null) {
        continue;
      }
      ctSnapshots.push({
        date: formatDay(r.recordedAt),
        zeroLow: r.zeroLowCents,
        low: r.lowCents,
      });
    }

    return {
      tcgplayer: {
        available: Boolean(tcgSource),
        productId: tcgSource?.externalId ?? null,
        currency: MARKETPLACE_CURRENCY.tcgplayer,
        snapshots: tcgSnapshots,
      },
      cardmarket: {
        available: Boolean(cmSource),
        productId: cmSource?.externalId ?? null,
        currency: MARKETPLACE_CURRENCY.cardmarket,
        snapshots: cmSnapshots,
      },
      cardtrader: {
        available: Boolean(ctSource),
        productId: ctSource?.externalId ?? null,
        currency: MARKETPLACE_CURRENCY.cardtrader,
        snapshots: ctSnapshots,
      },
    };
  }),
};
