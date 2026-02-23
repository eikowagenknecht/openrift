import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type {
  Card,
  CardArt,
  CardStats,
  CardType,
  ContentSet,
  PricesData,
  Rarity,
  RiftboundContent,
} from "@openrift/shared";
import { Hono } from "hono";

import { db } from "../db.js";

const require = createRequire(import.meta.url);
const pricesPath = require.resolve("@openrift/shared/data/prices.json");
const pricesData: PricesData = JSON.parse(readFileSync(pricesPath, "utf-8"));

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

cardsRoute.get("/prices", (c) => c.json(pricesData));
