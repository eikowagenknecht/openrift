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

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { imageUrl, selectPrintingWithCard } from "../db-helpers.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";

// ─── Snapshot helpers ────────────────────────────────────────────────────────

type SnapshotTable = "tcgplayer_snapshots" | "cardmarket_snapshots";

function formatSnapshotDate(recordedAt: Date | string): string {
  return (recordedAt as Date).toISOString().split("T")[0];
}

function centsToDollars(cents: number | null): number | null {
  return cents === null ? null : cents / 100;
}

async function fetchSnapshots<T extends SnapshotTable, R>(
  table: T,
  sourceId: number,
  cutoff: Date | null,
  mapRow: (row: Selectable<Database[T]>) => R,
): Promise<R[]> {
  // Both snapshot tables share source_id + recorded_at; Kysely can't verify
  // that on a union, so we use a targeted assertion for the query chain.
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Kysely union limitation
  let query = (db.selectFrom(table).selectAll() as any)
    .where("source_id", "=", sourceId)
    .orderBy("recorded_at", "asc");
  if (cutoff) {
    query = query.where("recorded_at", ">=", cutoff);
  }
  const rows: Selectable<Database[T]>[] = await query.execute();
  return rows.map((row) => mapRow(row));
}

export const cardsRoute = new Hono();

cardsRoute.get("/cards", async (c) => {
  const sets = await db.selectFrom("sets").selectAll().orderBy("sort_order").execute();

  const rows = await selectPrintingWithCard(db)
    .select([
      "p.id as printing_id",
      "p.card_id",
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
      description: row.rules_text,
      effect: row.effect_text,
    };
    const printing: Printing = {
      id: row.printing_id,
      sourceId: row.source_id,
      set: row.set_id,
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
      ...(row.printed_effect_text !== row.effect_text && {
        printedEffect: row.printed_effect_text,
      }),
      card,
    };
    const list = printingsBySet.get(row.set_id) ?? [];
    list.push(printing);
    printingsBySet.set(row.set_id, list);
  }

  const contentSets: ContentSet[] = sets.map((s) => ({
    id: s.id,
    name: s.name,
    printedTotal: s.printed_total,
    printings: printingsBySet.get(s.id) ?? [],
  }));

  const content: RiftboundContent = {
    game: "Riftbound",
    version: "2.0.0",
    lastUpdated: new Date().toISOString().split("T")[0],
    sets: contentSets,
  };

  return c.json(content);
});

cardsRoute.get("/prices", async (c) => {
  // Use DISTINCT ON to fetch only the most recent snapshot per source,
  // avoiding a full table scan of tcgplayer_snapshots.
  const rows = await db
    .selectFrom("tcgplayer_sources as ps")
    .innerJoin("tcgplayer_snapshots as snap", "snap.source_id", "ps.id")
    .distinctOn("ps.id")
    .select(["ps.printing_id", "snap.market_cents"])
    .orderBy("ps.id")
    .orderBy("snap.recorded_at", "desc")
    .execute();

  const prices: Record<string, number> = {};

  for (const row of rows) {
    prices[row.printing_id] = row.market_cents / 100;
  }

  return c.json({
    source: "tcgplayer",
    fetchedAt: new Date().toISOString(),
    prices,
  });
});

const RANGE_DAYS: Record<TimeRange, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

cardsRoute.get("/prices/:printingId/history", async (c) => {
  const printingId = c.req.param("printingId");
  const rangeParam = c.req.query("range") ?? "30d";
  const days = rangeParam in RANGE_DAYS ? RANGE_DAYS[rangeParam as TimeRange] : RANGE_DAYS["30d"];
  const cutoff = days ? new Date(Date.now() - days * 86_400_000) : null;

  // Look up sources
  const tcgSource = await db
    .selectFrom("tcgplayer_sources")
    .select(["id", "external_id"])
    .where("printing_id", "=", printingId)
    .executeTakeFirst();

  const cmSource = await db
    .selectFrom("cardmarket_sources")
    .select(["id", "external_id"])
    .where("printing_id", "=", printingId)
    .executeTakeFirst();

  const tcgSnapshots = tcgSource
    ? await fetchSnapshots("tcgplayer_snapshots", tcgSource.id, cutoff, (r) => ({
        date: formatSnapshotDate(r.recorded_at),
        market: r.market_cents / 100,
        low: centsToDollars(r.low_cents),
        mid: centsToDollars(r.mid_cents),
        high: centsToDollars(r.high_cents),
      }))
    : [];

  const cmSnapshots = cmSource
    ? await fetchSnapshots("cardmarket_snapshots", cmSource.id, cutoff, (r) => ({
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
    printingId,
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
});
