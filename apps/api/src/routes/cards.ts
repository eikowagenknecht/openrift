import { zValidator } from "@hono/zod-validator";
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
import type { Selectable } from "kysely";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { imageUrl, selectPrintingWithCard } from "../db-helpers.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";

// ─── Snapshot helpers ────────────────────────────────────────────────────────

function formatSnapshotDate(recordedAt: Date | string): string {
  return (recordedAt as Date).toISOString().split("T")[0];
}

function centsToDollars(cents: number | null): number | null {
  return cents === null ? null : cents / 100;
}

async function fetchSnapshots<R>(
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

const RANGE_DAYS: Record<TimeRange, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

export const cardsRoute = new Hono()
  .get("/cards", async (c) => {
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
        ...(row.printed_rules_text !== row.rules_text && {
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
  .get("/prices", async (c) => {
    // Use DISTINCT ON to fetch only the most recent snapshot per source,
    // avoiding a full table scan of marketplace_snapshots.
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
  .get(
    "/prices/:printingId/history",
    zValidator("query", z.object({ range: z.string().optional() })),
    async (c) => {
      const param = c.req.param("printingId");
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
        ? await fetchSnapshots(tcgSource.id, cutoff, (r) => ({
            date: formatSnapshotDate(r.recorded_at),
            market: r.market_cents / 100,
            low: centsToDollars(r.low_cents),
            mid: centsToDollars(r.mid_cents),
            high: centsToDollars(r.high_cents),
          }))
        : [];

      const cmSnapshots = cmSource
        ? await fetchSnapshots(cmSource.id, cutoff, (r) => ({
            date: formatSnapshotDate(r.recorded_at),
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
