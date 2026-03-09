import type {
  Card,
  CardArt,
  CardmarketSnapshot,
  CardPrice,
  CardStats,
  CardType,
  ContentSet,
  PriceHistoryResponse,
  Rarity,
  RiftboundContent,
  TcgplayerSnapshot,
  TimeRange,
} from "@openrift/shared";
import { Hono } from "hono";
import { sql } from "kysely";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";

export const cardsRoute = new Hono();

cardsRoute.get("/cards", async (c) => {
  const sets = await db.selectFrom("sets").selectAll().execute();

  const rows = await db
    .selectFrom("printings as p")
    .innerJoin("cards as c", "c.id", "p.card_id")
    .leftJoin("printing_images as pi", (join) =>
      join
        .onRef("pi.printing_id", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.is_active", "=", true),
    )
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
      sql<string | null>`COALESCE(pi.rehosted_url, pi.original_url)`.as("image_url"),
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

  const cardsBySet = new Map<string, Card[]>();
  for (const row of rows) {
    const card: Card = {
      id: row.printing_id,
      cardId: row.card_id,
      sourceId: row.source_id,
      name: row.name,
      type: row.type as CardType,
      superTypes: row.super_types as string[],
      domains: row.domains as string[],
      stats: {
        might: row.might,
        energy: row.energy,
        power: row.power,
      } satisfies CardStats,
      keywords: row.keywords as string[],
      tags: row.tags as string[],
      mightBonus: row.might_bonus,
      set: row.set_id,
      collectorNumber: row.collector_number,
      rarity: row.rarity as Rarity,
      artVariant: row.art_variant,
      isSigned: row.is_signed,
      isPromo: row.is_promo,
      finish: row.finish,
      art: {
        imageURL: row.image_url,
        artist: row.artist,
      } satisfies CardArt,
      description: row.rules_text,
      effect: row.effect_text,
      ...(row.printed_rules_text !== row.rules_text && {
        printedDescription: row.printed_rules_text,
      }),
      ...(row.printed_effect_text !== row.effect_text && {
        printedEffect: row.printed_effect_text,
      }),
      publicCode: row.public_code,
    };
    const list = cardsBySet.get(row.set_id) ?? [];
    list.push(card);
    cardsBySet.set(row.set_id, list);
  }

  const contentSets: ContentSet[] = sets.map((s) => ({
    id: s.id,
    name: s.name,
    printedTotal: s.printed_total,
    cards: cardsBySet.get(s.id) ?? [],
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
  const rows = await db
    .selectFrom("tcgplayer_sources as ps")
    .innerJoin("tcgplayer_snapshots as snap", "snap.source_id", "ps.id")
    .select([
      "ps.printing_id",
      "ps.external_id",
      "snap.market_cents",
      "snap.low_cents",
      "snap.mid_cents",
      "snap.high_cents",
      "snap.recorded_at",
    ])
    .orderBy("snap.recorded_at", "desc")
    .execute();

  const cards: Record<string, CardPrice> = {};

  for (const row of rows) {
    // Keep first row per printing (most recent snapshot)
    if (cards[row.printing_id]) {
      continue;
    }

    cards[row.printing_id] = {
      productId: row.external_id,
      low: (row.low_cents ?? 0) / 100,
      mid: (row.mid_cents ?? 0) / 100,
      high: (row.high_cents ?? 0) / 100,
      market: row.market_cents / 100,
    };
  }

  return c.json({
    source: "tcgplayer",
    fetchedAt: new Date().toISOString(),
    cards,
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

  // TCGplayer snapshots
  let tcgSnapshots: TcgplayerSnapshot[] = [];
  if (tcgSource) {
    let query = db
      .selectFrom("tcgplayer_snapshots")
      .select(["recorded_at", "market_cents", "low_cents", "mid_cents", "high_cents"])
      .where("source_id", "=", tcgSource.id)
      .orderBy("recorded_at", "asc");
    if (cutoff) {
      query = query.where("recorded_at", ">=", cutoff);
    }
    const rows = await query.execute();
    tcgSnapshots = rows.map((r) => ({
      date: (r.recorded_at as Date).toISOString().split("T")[0],
      market: r.market_cents / 100,
      low: r.low_cents === null ? null : r.low_cents / 100,
      mid: r.mid_cents === null ? null : r.mid_cents / 100,
      high: r.high_cents === null ? null : r.high_cents / 100,
    }));
  }

  // Cardmarket snapshots
  let cmSnapshots: CardmarketSnapshot[] = [];
  if (cmSource) {
    let query = db
      .selectFrom("cardmarket_snapshots")
      .select([
        "recorded_at",
        "market_cents",
        "low_cents",
        "trend_cents",
        "avg1_cents",
        "avg7_cents",
        "avg30_cents",
      ])
      .where("source_id", "=", cmSource.id)
      .orderBy("recorded_at", "asc");
    if (cutoff) {
      query = query.where("recorded_at", ">=", cutoff);
    }
    const rows = await query.execute();
    cmSnapshots = rows.map((r) => ({
      date: (r.recorded_at as Date).toISOString().split("T")[0],
      market: r.market_cents / 100,
      low: r.low_cents === null ? null : r.low_cents / 100,
      trend: r.trend_cents === null ? null : r.trend_cents / 100,
      avg1: r.avg1_cents === null ? null : r.avg1_cents / 100,
      avg7: r.avg7_cents === null ? null : r.avg7_cents / 100,
      avg30: r.avg30_cents === null ? null : r.avg30_cents / 100,
    }));
  }

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
