import type {
  Card,
  CardArt,
  CardPrice,
  CardStats,
  CardType,
  ContentSet,
  PricePoint,
  Rarity,
  RiftboundContent,
} from "@openrift/shared";
import { Hono } from "hono";

import { db } from "../db.js";

export const cardsRoute = new Hono();

cardsRoute.get("/cards", async (c) => {
  const sets = await db.selectFrom("sets").selectAll().execute();

  const cards = await db
    .selectFrom("cards")
    .selectAll()
    .orderBy("set_id")
    .orderBy("collector_number")
    .execute();

  const cardsBySet = new Map<string, Card[]>();
  for (const row of cards) {
    const card: Card = {
      id: row.id,
      name: row.name,
      type: row.type as CardType,
      superTypes: row.super_types,
      rarity: row.rarity as Rarity,
      collectorNumber: row.collector_number,
      faction: row.faction,
      stats: {
        might: row.might,
        energy: row.energy,
        power: row.power,
      } satisfies CardStats,
      keywords: row.keywords,
      description: row.description,
      effect: row.effect,
      mightBonus: row.might_bonus,
      set: row.set_id,
      art: {
        thumbnailURL: row.thumbnail_url,
        fullURL: row.full_url,
        artist: row.artist,
      } satisfies CardArt,
      tags: row.tags,
      orientation: row.orientation,
      publicCode: row.public_code,
    };
    const list = cardsBySet.get(row.set_id) ?? [];
    list.push(card);
    cardsBySet.set(row.set_id, list);
  }

  const contentSets: ContentSet[] = sets.map((s) => ({
    id: s.id,
    name: s.name,
    totalCards: s.total_cards,
    cards: cardsBySet.get(s.id) ?? [],
  }));

  const content: RiftboundContent = {
    game: "Riftbound",
    version: "1.0.0",
    lastUpdated: new Date().toISOString().split("T")[0],
    sets: contentSets,
  };

  return c.json(content);
});

cardsRoute.get("/prices", async (c) => {
  const rows = await db.selectFrom("prices").selectAll().execute();

  const cards: Record<string, CardPrice> = {};

  for (const row of rows) {
    const point: PricePoint = {
      low: (row.low_cents ?? 0) / 100,
      mid: (row.mid_cents ?? 0) / 100,
      high: (row.high_cents ?? 0) / 100,
      market: row.market_cents / 100,
      directLow: row.direct_low_cents != null ? row.direct_low_cents / 100 : null,
    };

    let entry = cards[row.card_id];
    if (!entry) {
      entry = {
        productId: row.product_id ?? 0,
        url: row.url,
      };
      cards[row.card_id] = entry;
    }

    if (row.variant === "Normal") {
      entry.normal = point;
    } else if (row.variant === "Foil") {
      entry.foil = point;
    }
  }

  return c.json({
    source: rows[0]?.source ?? "",
    fetchedAt: new Date().toISOString(),
    cards,
    unmatched: [],
  });
});
