import { zValidator } from "@hono/zod-validator";
import { centsToDollars, formatDateUTC } from "@openrift/shared";
import type {
  ArtVariant,
  Card,
  CardStats,
  CardType,
  ContentSet,
  Domain,
  Finish,
  PriceHistoryResponse,
  Printing,
  PrintingImage,
  Rarity,
  SuperType,
  RiftboundContent,
  TimeRange,
} from "@openrift/shared";
import type { Database } from "@openrift/shared/db";
import { Hono } from "hono";
import type { Kysely, Selectable } from "kysely";
import { z } from "zod/v4";

import { imageUrl, selectPrintingWithCard } from "../db-helpers.js";
import type { Variables } from "../types.js";

// ─── Snapshot helpers ────────────────────────────────────────────────────────

/**
 * Fetches marketplace snapshots for a single source, ordered chronologically.
 *
 * @param sourceId - The `marketplace_sources.id` to filter on.
 * @param cutoff - Only return snapshots recorded on or after this date. Pass `null` for all history.
 * @param mapRow - Transform each DB row into the desired response shape (TCGPlayer vs Cardmarket).
 * @returns The mapped snapshots, ordered chronologically.
 */
async function fetchSnapshots<R>(
  db: Kysely<Database>,
  sourceId: string,
  cutoff: Date | null,
  mapRow: (row: Selectable<Database["marketplace_snapshots"]>) => R,
): Promise<R[]> {
  let query = db
    .selectFrom("marketplace_snapshots")
    .selectAll()
    .where("source_id", "=", sourceId)
    .orderBy("recorded_at", "asc");
  if (cutoff) {
    query = query.where("recorded_at", ">=", cutoff);
  }
  const rows = await query.execute();
  return rows.map((row) => mapRow(row));
}

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
   * Joins printings → cards → front-face images → sets, then groups printings
   * by set slug. Empty sets are included with an empty `printings` array.
   *
   * Printed text fields (`printedDescription`, `printedEffect`) are only
   * included when they differ from the oracle text, keeping the payload smaller.
   */
  .get("/cards", async (c) => {
    const db = c.get("db");
    const sets = await db.selectFrom("sets").selectAll().orderBy("sort_order").execute();

    const rows = await selectPrintingWithCard(db)
      .innerJoin("sets as s", "s.id", "p.set_id")
      .select([
        "p.id as printing_id",
        "p.slug as printing_slug",
        "p.set_id",
        "p.source_id",
        "p.collector_number",
        "p.rarity",
        "p.art_variant",
        "p.is_signed",
        "p.is_promo",
        "p.finish",
        imageUrl("pi").as("image_url"),
        "p.artist",
        "p.public_code",
        "p.printed_rules_text",
        "p.printed_effect_text",
        "p.flavor_text",
        "p.comment",
        "c.id as card_id",
        "c.slug as card_slug",
        "c.name",
        "c.type",
        "c.super_types",
        "c.domains",
        "c.might",
        "c.energy",
        "c.power",
        "c.might_bonus",
        "c.keywords",
        "c.rules_text",
        "c.effect_text",
        "c.tags",
        "s.slug as set_slug",
      ])
      .orderBy("p.set_id")
      .orderBy("p.collector_number")
      .orderBy("p.finish", "desc")
      .execute();

    const printingsBySet = new Map<string, Printing[]>();
    for (const row of rows) {
      const images: PrintingImage[] = row.image_url ? [{ face: "front", url: row.image_url }] : [];
      const card: Card = {
        id: row.card_id,
        slug: row.card_slug,
        name: row.name,
        type: row.type as CardType,
        superTypes: row.super_types as SuperType[],
        domains: row.domains as Domain[],
        stats: {
          might: row.might,
          energy: row.energy,
          power: row.power,
        } satisfies CardStats,
        keywords: row.keywords as string[],
        tags: row.tags as string[],
        mightBonus: row.might_bonus,
        description: row.rules_text ?? "",
        effect: row.effect_text ?? "",
      };
      const printing: Printing = {
        id: row.printing_id,
        slug: row.printing_slug,
        sourceId: row.source_id,
        set: row.set_slug,
        collectorNumber: row.collector_number,
        rarity: row.rarity as Rarity,
        artVariant: row.art_variant as ArtVariant,
        isSigned: row.is_signed,
        isPromo: row.is_promo,
        finish: row.finish as Finish,
        images,
        artist: row.artist,
        publicCode: row.public_code,
        ...(row.printed_rules_text !== null &&
          row.printed_rules_text !== row.rules_text && {
            printedDescription: row.printed_rules_text,
          }),
        ...(row.printed_effect_text !== null &&
          row.printed_effect_text !== row.effect_text && {
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
    const db = c.get("db");
    const rows = await db
      .selectFrom("marketplace_sources as ps")
      .innerJoin("marketplace_snapshots as snap", "snap.source_id", "ps.id")
      .innerJoin("printings as p", "p.id", "ps.printing_id")
      .where("ps.marketplace", "=", "tcgplayer")
      .distinctOn("ps.id")
      .select(["p.id as printing_id", "snap.market_cents"])
      .orderBy("ps.id")
      .orderBy("snap.recorded_at", "desc")
      .execute();

    const prices: Record<string, number> = {};

    for (const row of rows) {
      prices[row.printing_id] = row.market_cents / 100;
    }

    return c.json({
      prices,
    });
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
      const { printingId: param } = c.req.valid("param");
      const rangeParam = c.req.valid("query").range ?? "30d";
      const days =
        rangeParam in RANGE_DAYS ? RANGE_DAYS[rangeParam as TimeRange] : RANGE_DAYS["30d"];
      const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

      // Accept both UUID and slug
      const printing = await db
        .selectFrom("printings")
        .select("id")
        .where((eb) => eb.or([eb("id", "=", param), eb("slug", "=", param)]))
        .executeTakeFirst();

      if (!printing) {
        return c.json({
          printingId: param,
          tcgplayer: { available: false, currency: "USD", productId: null, snapshots: [] },
          cardmarket: { available: false, currency: "EUR", productId: null, snapshots: [] },
        });
      }

      // Look up sources from unified table
      const sources = await db
        .selectFrom("marketplace_sources")
        .select(["id", "external_id", "marketplace"])
        .where("printing_id", "=", printing.id)
        .execute();

      const tcgSource = sources.find((s) => s.marketplace === "tcgplayer");
      const cmSource = sources.find((s) => s.marketplace === "cardmarket");

      const tcgSnapshots = tcgSource
        ? await fetchSnapshots(db, tcgSource.id, cutoff, (r) => ({
            date: formatDateUTC(r.recorded_at),
            market: r.market_cents / 100,
            low: centsToDollars(r.low_cents),
            mid: centsToDollars(r.mid_cents),
            high: centsToDollars(r.high_cents),
          }))
        : [];

      const cmSnapshots = cmSource
        ? await fetchSnapshots(db, cmSource.id, cutoff, (r) => ({
            date: formatDateUTC(r.recorded_at),
            market: r.market_cents / 100,
            low: centsToDollars(r.low_cents),
            trend: centsToDollars(r.trend_cents),
            avg1: centsToDollars(r.avg1_cents),
            avg7: centsToDollars(r.avg7_cents),
            avg30: centsToDollars(r.avg30_cents),
          }))
        : [];

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
