import { zValidator } from "@hono/zod-validator";
import { centsToDollars, formatDateUTC } from "@openrift/shared";
import type {
  Card,
  CardStats,
  ContentSet,
  Domain,
  PriceHistoryResponse,
  Printing,
  PrintingImage,
  SuperType,
  RiftboundContent,
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

export const cardsRoute = new Hono<{ Variables: Variables }>()
  /**
   * `GET /cards` — Returns the full card catalog as {@link RiftboundContent}.
   *
   * Fetches cards and printings separately, then assembles each printing with
   * its card data and groups by set. Empty sets get an empty `printings` array.
   *
   * Printed text fields (`printedDescription`, `printedEffect`) are only
   * included when they differ from the oracle text, keeping the payload smaller.
   */
  .get("/cards", async (c) => {
    const catalog = catalogRepo(c.get("db"));

    const { last_modified } = await catalog.catalogLastModified();
    const etag = `"catalog-${new Date(last_modified).getTime()}"`;

    if (c.req.header("If-None-Match") === etag) {
      return c.body(null, 304);
    }

    const [sets, cardRows, printingRows] = await Promise.all([
      catalog.sets(),
      catalog.cards(),
      catalog.printings(),
    ]);

    const cardById = new Map(cardRows.map((row) => [row.id, row]));

    const printingsBySet = new Map<string, Printing[]>();
    for (const row of printingRows) {
      const cardRow = cardById.get(row.card_id);
      if (!cardRow) {
        continue;
      }
      const images: PrintingImage[] = row.image_url ? [{ face: "front", url: row.image_url }] : [];
      const card: Card = {
        id: cardRow.id,
        slug: cardRow.slug,
        name: cardRow.name,
        type: cardRow.type,
        superTypes: cardRow.super_types as SuperType[],
        domains: cardRow.domains as Domain[],
        stats: {
          might: cardRow.might,
          energy: cardRow.energy,
          power: cardRow.power,
        } satisfies CardStats,
        keywords: cardRow.keywords,
        tags: cardRow.tags,
        mightBonus: cardRow.might_bonus,
        description: cardRow.rules_text ?? "",
        effect: cardRow.effect_text ?? "",
      };
      const printing: Printing = {
        id: row.id,
        slug: row.slug,
        sourceId: row.source_id,
        set: row.set_slug,
        collectorNumber: row.collector_number,
        rarity: row.rarity,
        artVariant: row.art_variant,
        isSigned: row.is_signed,
        isPromo: row.is_promo,
        finish: row.finish,
        images,
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
        card,
      };
      const list = printingsBySet.get(row.set_slug) ?? [];
      list.push(printing);
      printingsBySet.set(row.set_slug, list);
    }

    const contentSets: ContentSet[] = sets.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      printedTotal: s.printed_total,
      printings: printingsBySet.get(s.slug) ?? [],
    }));

    const content: RiftboundContent = {
      sets: contentSets,
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
    const rows = await marketplace.latestPrices();

    const prices: Record<string, number> = {};
    for (const row of rows) {
      prices[row.printing_id] = centsToDollars(row.market_cents);
    }

    return c.json({ prices });
  })
  /**
   * `GET /prices/:printingId/history` — Returns price history for a single printing.
   *
   * Accepts a printing UUID or slug. Returns snapshots for both TCGPlayer (USD)
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
    zValidator("query", z.object({ range: z.string().optional() })),
    async (c) => {
      const db = c.get("db");
      const catalog = catalogRepo(db);
      const marketplace = marketplaceRepo(db);

      const { printingId: param } = c.req.valid("param");
      const rangeParam = c.req.valid("query").range ?? "30d";
      const days =
        rangeParam in RANGE_DAYS ? RANGE_DAYS[rangeParam as TimeRange] : RANGE_DAYS["30d"];
      const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

      const printing = await catalog.printingByIdOrSlug(param);

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

      return c.json(response);
    },
  );
