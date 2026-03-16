import { zValidator } from "@hono/zod-validator";
import { centsToDollars, formatDateUTC } from "@openrift/shared";
import type { PriceHistoryResponse, PricesData, TimeRange } from "@openrift/shared";
import { Hono } from "hono";
import { etag } from "hono/etag";
import { z } from "zod/v4";

import { catalogRepo } from "../repositories/catalog.js";
import { marketplaceRepo } from "../repositories/marketplace.js";
import type { Variables } from "../types.js";

/** Maps each {@link TimeRange} to its lookback window in days (`null` = no limit). */
const RANGE_DAYS: Record<TimeRange, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

export const pricesRoute = new Hono<{ Variables: Variables }>()
  /**
   * `GET /prices` — Returns the latest TCGPlayer market price for every printing.
   *
   * Uses `DISTINCT ON` to efficiently pick only the most recent snapshot per
   * marketplace source without scanning the full `marketplace_snapshots` table.
   * Prices are returned as a `{ [printingId]: dollars }` map.
   */
  .get("/prices", etag(), async (c) => {
    const marketplace = marketplaceRepo(c.get("db"));

    const rows = await marketplace.latestPrices();

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

    const prices: Record<string, number> = {};
    for (const row of rows) {
      prices[row.printingId] = centsToDollars(row.marketCents);
    }

    return c.json({ prices } satisfies PricesData);
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
  .get(
    "/prices/:printingId/history",
    zValidator("param", z.object({ printingId: z.string().min(1) })),
    zValidator(
      "query",
      z.object({
        range: z.enum(Object.keys(RANGE_DAYS) as [TimeRange, ...TimeRange[]]).default("30d"),
      }),
    ),
    etag(),
    async (c) => {
      const db = c.get("db");
      const catalog = catalogRepo(db);
      const marketplace = marketplaceRepo(db);

      const { printingId } = c.req.valid("param");
      const rangeParam = c.req.valid("query").range;
      const days = RANGE_DAYS[rangeParam];
      const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

      const printing = await catalog.printingById(printingId);

      if (!printing) {
        return c.json({
          printingId,
          tcgplayer: { available: false, currency: "USD", productId: null, snapshots: [] },
          cardmarket: { available: false, currency: "EUR", productId: null, snapshots: [] },
        } satisfies PriceHistoryResponse);
      }

      const sources = await marketplace.sourcesForPrinting(printing.id);

      const tcgSource = sources.find((s) => s.marketplace === "tcgplayer");
      const cmSource = sources.find((s) => s.marketplace === "cardmarket");

      c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

      const [tcgRows, cmRows] = await Promise.all([
        tcgSource ? marketplace.snapshots(tcgSource.id, cutoff) : [],
        cmSource ? marketplace.snapshots(cmSource.id, cutoff) : [],
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
      };

      return c.json(response);
    },
  );
