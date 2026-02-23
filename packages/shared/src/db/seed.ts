/* eslint-disable no-console -- CLI script */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is required.");
  console.error(
    "Example: DATABASE_URL=postgres://riftbound_app:dev_password@localhost:5432/riftbound",
  );
  process.exit(1);
}

const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString }),
  }),
});

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

const galleryPath = path.join(__dirname, "../../data/gallery.json");
const gallery: GalleryData = JSON.parse(readFileSync(galleryPath, "utf-8"));

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
        super_types: card.superTypes,
        rarity: card.rarity,
        collector_number: card.collectorNumber,
        faction: card.faction,
        might: card.stats.might,
        energy: card.stats.energy,
        power: card.stats.power,
        keywords: card.keywords,
        description: card.description,
        effect: card.effect,
        might_bonus: card.mightBonus,
        set_id: card.set,
        thumbnail_url: card.art.thumbnailURL,
        full_url: card.art.fullURL,
        artist: card.art.artist,
        tags: card.tags,
        orientation: card.orientation,
        public_code: card.publicCode,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: card.name,
          type: card.type,
          super_types: card.superTypes,
          rarity: card.rarity,
          collector_number: card.collectorNumber,
          faction: card.faction,
          might: card.stats.might,
          energy: card.stats.energy,
          power: card.stats.power,
          keywords: card.keywords,
          description: card.description,
          effect: card.effect,
          might_bonus: card.mightBonus,
          set_id: card.set,
          thumbnail_url: card.art.thumbnailURL,
          full_url: card.art.fullURL,
          artist: card.art.artist,
          tags: card.tags,
          orientation: card.orientation,
          public_code: card.publicCode,
        }),
      )
      .execute();
  }
}

console.log("Seed complete.");
await db.destroy();
