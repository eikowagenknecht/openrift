/* eslint-disable no-console -- CLI script */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql, type RawBuilder } from "kysely";

import { createDb } from "./connect.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = createDb();

/** Wrap a JS string array as a Kysely raw Postgres array literal. */
function pgArray(values: string[]): RawBuilder<string[]> {
  return sql<
    string[]
  >`${`{${values.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",")}}`}::text[]`;
}

type CardType = "Legend" | "Unit" | "Rune" | "Spell" | "Gear" | "Battlefield";
type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Showcase";

interface GalleryCard {
  id: string;
  name: string;
  type: CardType;
  superTypes: string[];
  rarity: Rarity;
  collectorNumber: number;
  faction: string;
  stats: { might: number; energy: number; power: number };
  keywords: string[];
  description: string;
  effect: string;
  mightBonus: number;
  set: string;
  art: { thumbnailURL: string; fullURL: string; artist: string };
  tags: string[];
  orientation: "portrait" | "landscape";
  publicCode: string;
}

interface GallerySet {
  id: string;
  name: string;
  totalCards: number;
  cards: GalleryCard[];
}

interface GalleryData {
  sets: GallerySet[];
}

interface PricePoint {
  low: number;
  mid: number;
  high: number;
  market: number;
  directLow: number | null;
}

interface CardPrice {
  productId: number;
  url: string | null;
  normal?: PricePoint;
  foil?: PricePoint;
}

interface PricesJson {
  source: string;
  fetchedAt: string;
  cards: Record<string, CardPrice>;
}

const cardsPath = path.join(__dirname, "../../../../data/cards.json");
const gallery: GalleryData = JSON.parse(readFileSync(cardsPath, "utf-8"));

const pricesPath = path.join(__dirname, "../../../../data/prices.json");
const prices: PricesJson = JSON.parse(readFileSync(pricesPath, "utf-8"));

console.log("Seeding database...");

for (const set of gallery.sets) {
  await db
    .insertInto("sets")
    .values({
      id: set.id,
      name: set.name,
      total_cards: set.totalCards,
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        name: set.name,
        total_cards: set.totalCards,
      }),
    )
    .execute();

  console.log(`  ✓ Set: ${set.name} (${set.cards.length} cards)`);

  for (const card of set.cards) {
    await db
      .insertInto("cards")
      .values({
        id: card.id,
        name: card.name,
        type: card.type,
        super_types: pgArray(card.superTypes),
        rarity: card.rarity,
        collector_number: card.collectorNumber,
        faction: card.faction,
        might: card.stats.might,
        energy: card.stats.energy,
        power: card.stats.power,
        keywords: pgArray(card.keywords),
        description: card.description,
        effect: card.effect,
        might_bonus: card.mightBonus,
        set_id: card.set,
        thumbnail_url: card.art.thumbnailURL,
        full_url: card.art.fullURL,
        artist: card.art.artist,
        tags: pgArray(card.tags),
        orientation: card.orientation,
        public_code: card.publicCode,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: card.name,
          type: card.type,
          super_types: pgArray(card.superTypes),
          rarity: card.rarity,
          collector_number: card.collectorNumber,
          faction: card.faction,
          might: card.stats.might,
          energy: card.stats.energy,
          power: card.stats.power,
          keywords: pgArray(card.keywords),
          description: card.description,
          effect: card.effect,
          might_bonus: card.mightBonus,
          set_id: card.set,
          thumbnail_url: card.art.thumbnailURL,
          full_url: card.art.fullURL,
          artist: card.art.artist,
          tags: pgArray(card.tags),
          orientation: card.orientation,
          public_code: card.publicCode,
        }),
      )
      .execute();
  }
}

// ── Prices ──────────────────────────────────────────────────────────────────
// Truncate first since (card_id, variant) isn't a unique constraint.
await db.deleteFrom("prices").execute();

function toCents(value: number | null | undefined): number | null {
  return value != null ? Math.round(value * 100) : null;
}

type PriceVariant = "Normal" | "Foil";

const priceRows: {
  card_id: string;
  variant: PriceVariant;
  low_cents: number | null;
  mid_cents: number | null;
  high_cents: number | null;
  market_cents: number;
  direct_low_cents: number | null;
  product_id: number | null;
  url: string | null;
  source: string;
}[] = [];

for (const [cardId, cardPrice] of Object.entries(prices.cards)) {
  if (cardPrice.normal?.market) {
    priceRows.push({
      card_id: cardId,
      variant: "Normal",
      low_cents: toCents(cardPrice.normal.low),
      mid_cents: toCents(cardPrice.normal.mid),
      high_cents: toCents(cardPrice.normal.high),
      market_cents: Math.round(cardPrice.normal.market * 100),
      direct_low_cents: toCents(cardPrice.normal.directLow),
      product_id: cardPrice.productId,
      url: cardPrice.url ?? null,
      source: prices.source,
    });
  }
  if (cardPrice.foil?.market) {
    priceRows.push({
      card_id: cardId,
      variant: "Foil",
      low_cents: toCents(cardPrice.foil.low),
      mid_cents: toCents(cardPrice.foil.mid),
      high_cents: toCents(cardPrice.foil.high),
      market_cents: Math.round(cardPrice.foil.market * 100),
      direct_low_cents: toCents(cardPrice.foil.directLow),
      product_id: cardPrice.productId,
      url: cardPrice.url ?? null,
      source: prices.source,
    });
  }
}

if (priceRows.length > 0) {
  await db.insertInto("prices").values(priceRows).execute();
}

console.log(`  ✓ Prices: ${priceRows.length} rows`);

console.log("Seed complete.");
await db.destroy();
