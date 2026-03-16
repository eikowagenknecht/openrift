import { zValidator } from "@hono/zod-validator";
import { centsToDollars, formatDateUTC } from "@openrift/shared";
import type {
  Card,
  CardStats,
  CatalogPrinting,
  PriceHistoryResponse,
  PrintingImage,
  RiftboundCatalog,
  TimeRange,
} from "@openrift/shared";
import { Hono } from "hono";
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

export const catalogRoute = new Hono<{ Variables: Variables }>()
  /**
   * `GET /catalog` — Returns the full card catalog as {@link RiftboundCatalog}.
   *
   * Returns a normalized response with cards keyed by ID, a flat printings
   * array (referencing cards by `cardId`), and a simple sets list. Latest
   * market prices are included directly on each printing.
   *
   * Printed text fields (`printedDescription`, `printedEffect`) are only
   * included when they differ from the oracle text, keeping the payload smaller.
   */
  .get("/catalog", async (c) => {
    const db = c.get("db");
    const catalog = catalogRepo(db);
    const marketplace = marketplaceRepo(db);

    const [catalogTs, pricesTs] = await Promise.all([
      catalog.catalogLastModified(),
      marketplace.pricesLastModified(),
    ]);
    const combinedTs = Math.max(
      new Date(catalogTs.last_modified).getTime(),
      new Date(pricesTs.last_modified).getTime(),
    );
    const etag = `"catalog-${combinedTs}"`;

    if (c.req.header("If-None-Match") === etag) {
      return c.body(null, 304);
    }

    const [sets, cardRows, printingRows, imageRows, priceRows] = await Promise.all([
      catalog.sets(),
      catalog.cards(),
      catalog.printings(),
      catalog.printingImages(),
      marketplace.latestPrices(),
    ]);

    // Build price lookup
    const priceByPrinting = new Map<string, number>();
    for (const row of priceRows) {
      priceByPrinting.set(row.printing_id, centsToDollars(row.market_cents));
    }

    // Build cards map + raw-row lookup in a single pass
    const cards: Record<string, Card> = {};
    const cardRowById = new Map<string, (typeof cardRows)[number]>();
    for (const row of cardRows) {
      cardRowById.set(row.id, row);
      cards[row.id] = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        type: row.type,
        superTypes: row.super_types,
        domains: row.domains,
        stats: {
          might: row.might,
          energy: row.energy,
          power: row.power,
        } satisfies CardStats,
        keywords: row.keywords,
        tags: row.tags,
        mightBonus: row.might_bonus,
        description: row.rules_text ?? "",
        effect: row.effect_text ?? "",
      };
    }

    // Build images lookup
    const imagesByPrinting = new Map<string, PrintingImage[]>();
    for (const row of imageRows) {
      if (!row.url) {
        continue;
      }
      let list = imagesByPrinting.get(row.printing_id);
      if (!list) {
        list = [];
        imagesByPrinting.set(row.printing_id, list);
      }
      list.push({ face: row.face, url: row.url });
    }

    // Build set slug lookup (sets are already fetched above)
    const setSlugById = new Map(sets.map((s) => [s.id, s.slug]));

    // Build flat printings array
    const printings: CatalogPrinting[] = [];
    for (const row of printingRows) {
      const cardRow = cardRowById.get(row.card_id);
      const setSlug = setSlugById.get(row.set_id);
      if (!cardRow || !setSlug) {
        continue;
      }
      const printing: CatalogPrinting = {
        id: row.id,
        slug: row.slug,
        sourceId: row.source_id,
        set: setSlug,
        collectorNumber: row.collector_number,
        rarity: row.rarity,
        artVariant: row.art_variant,
        isSigned: row.is_signed,
        isPromo: row.is_promo,
        finish: row.finish,
        images: imagesByPrinting.get(row.id) ?? [],
        artist: row.artist,
        publicCode: row.public_code,
        ...(row.printed_rules_text !== null &&
          row.printed_rules_text !== cardRow.rules_text && {
            printedDescription: row.printed_rules_text,
          }),
        ...(row.printed_effect_text !== null &&
          row.printed_effect_text !== cardRow.effect_text && {
            printedEffect: row.printed_effect_text,
          }),
        ...(row.flavor_text && { flavorText: row.flavor_text }),
        ...(row.comment && { comment: row.comment }),
        ...(priceByPrinting.has(row.id) && { marketPrice: priceByPrinting.get(row.id) }),
        cardId: row.card_id,
      };
      printings.push(printing);
    }

    const content: RiftboundCatalog = {
      sets: sets.map((s) => ({ slug: s.slug, name: s.name })),
      cards,
      printings,
    };

    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(content);
  })
  /**
   * `GET /prices` — Returns the latest TCGPlayer market price for every printing.
   *
   * Uses `DISTINCT ON` to efficiently pick only the most recent snapshot per
   * marketplace source without scanning the full `marketplace_snapshots` table.
   * Prices are returned as a `{ [printingId]: dollars }` map.
   */
  .get("/prices", async (c) => {
    const marketplace = marketplaceRepo(c.get("db"));

    const { last_modified } = await marketplace.pricesLastModified();
    const etag = `"prices-${new Date(last_modified).getTime()}"`;

    if (c.req.header("If-None-Match") === etag) {
      return c.body(null, 304);
    }

    const rows = await marketplace.latestPrices();

    const prices: Record<string, number> = {};
    for (const row of rows) {
      prices[row.printing_id] = centsToDollars(row.market_cents);
    }

    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=60");
    return c.json({ prices });
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
    async (c) => {
      const db = c.get("db");
      const catalog = catalogRepo(db);
      const marketplace = marketplaceRepo(db);

      const { printingId: param } = c.req.valid("param");
      const rangeParam = c.req.valid("query").range;
      const days = RANGE_DAYS[rangeParam];
      const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

      const printing = await catalog.printingById(param);

      if (!printing) {
        return c.json({
          printingId: param,
          tcgplayer: { available: false, currency: "USD", productId: null, snapshots: [] },
          cardmarket: { available: false, currency: "EUR", productId: null, snapshots: [] },
        });
      }

      const sources = await marketplace.sourcesForPrinting(printing.id);
      const tcgSource = sources.find((s) => s.marketplace === "tcgplayer");
      const cmSource = sources.find((s) => s.marketplace === "cardmarket");

      const [tcgRows, cmRows] = await Promise.all([
        tcgSource ? marketplace.snapshots(tcgSource.id, cutoff) : [],
        cmSource ? marketplace.snapshots(cmSource.id, cutoff) : [],
      ]);

      const tcgSnapshots = tcgRows.map((r) => ({
        date: formatDateUTC(r.recorded_at),
        market: centsToDollars(r.market_cents),
        low: centsToDollars(r.low_cents),
        mid: centsToDollars(r.mid_cents),
        high: centsToDollars(r.high_cents),
      }));

      const cmSnapshots = cmRows.map((r) => ({
        date: formatDateUTC(r.recorded_at),
        market: centsToDollars(r.market_cents),
        low: centsToDollars(r.low_cents),
        trend: centsToDollars(r.trend_cents),
        avg1: centsToDollars(r.avg1_cents),
        avg7: centsToDollars(r.avg7_cents),
        avg30: centsToDollars(r.avg30_cents),
      }));

      const latestTcg = tcgRows.at(-1)?.recorded_at;
      const latestCm = cmRows.at(-1)?.recorded_at;
      const latestTs = Math.max(
        latestTcg ? new Date(latestTcg).getTime() : 0,
        latestCm ? new Date(latestCm).getTime() : 0,
      );
      const etag = `"history-${printing.id}-${rangeParam}-${latestTs}"`;

      if (c.req.header("If-None-Match") === etag) {
        return c.body(null, 304);
      }

      const response: PriceHistoryResponse = {
        printingId: printing.id,
        tcgplayer: {
          available: Boolean(tcgSource),
          currency: "USD",
          productId: tcgSource?.external_id ?? null,
          snapshots: tcgSnapshots,
        },
        cardmarket: {
          available: Boolean(cmSource),
          currency: "EUR",
          productId: cmSource?.external_id ?? null,
          snapshots: cmSnapshots,
        },
      };

      c.header("ETag", etag);
      c.header("Cache-Control", "public, max-age=60");
      return c.json(response);
    },
  );
