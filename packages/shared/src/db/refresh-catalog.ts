/* oxlint-disable no-console -- CLI script */
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { CardType, Rarity } from "../types.js";
import { fetchCatalog } from "./fetch-catalog.js";
import type { Database } from "./types.js";

/**
 * Build composite printing ID.
 * @returns Deterministic ID string.
 */
function buildPrintingId(
  sourceId: string,
  artVariant: string,
  isSigned: boolean,
  isPromo: boolean,
  finish: string,
): string {
  return `${sourceId}:${artVariant}:${isSigned ? "signed" : ""}:${isPromo ? "promo" : ""}:${finish}`;
}

// Finish rules:
// - OGS → non-foil only
// - Token (superType) → non-foil only
// - Base Rune (non-Showcase) → non-foil only
// - Common/Uncommon → both non-foil and foil
// - Rare/Epic/Showcase → foil only
function getFinishes(
  setCode: string,
  cardType: CardType,
  superTypes: string[],
  rarity: Rarity,
  // If you add a finish here, also update the CHECK constraint in a new migration
  // (see 009_check_constraints.ts — chk_printings_finish).
): ("normal" | "foil")[] {
  if (setCode === "OGS") {
    return ["normal"];
  }
  if (superTypes.includes("Token")) {
    return ["normal"];
  }
  if (cardType === "Rune" && rarity !== "Showcase") {
    return ["normal"];
  }
  if (rarity === "Common" || rarity === "Uncommon") {
    return ["normal", "foil"];
  }
  return ["foil"];
}

export async function refreshCatalog(db: Kysely<Database>): Promise<void> {
  const data = await fetchCatalog();

  console.log("Seeding database...");

  // ── Sets ───────────────────────────────────────────────────────────────────
  for (const set of data.sets) {
    await db
      .insertInto("sets")
      .values({
        id: set.id,
        name: set.name,
        printed_total: set.printedTotal,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: set.name,
          printed_total: set.printedTotal,
        }),
      )
      .execute();

    console.log(`  ✓ Set: ${set.name}`);
  }

  // ── Game cards ─────────────────────────────────────────────────────────────
  for (const [id, card] of Object.entries(data.cards)) {
    await db
      .insertInto("cards")
      .values({
        id,
        name: card.name,
        type: card.type,
        super_types: card.superTypes,
        domains: card.domains,
        might: card.stats.might,
        energy: card.stats.energy,
        power: card.stats.power,
        might_bonus: card.mightBonus,
        keywords: card.keywords,
        rules_text: card.rulesText,
        effect_text: card.effectText,
        tags: card.tags,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: card.name,
          type: card.type,
          super_types: card.superTypes,
          domains: card.domains,
          might: card.stats.might,
          energy: card.stats.energy,
          power: card.stats.power,
          might_bonus: card.mightBonus,
          keywords: card.keywords,
          rules_text: card.rulesText,
          effect_text: card.effectText,
          tags: card.tags,
        }),
      )
      .execute();
  }

  console.log(`  ✓ Cards: ${Object.keys(data.cards).length} game cards`);

  // ── Printings ──────────────────────────────────────────────────────────────
  const printingRows: {
    id: string;
    card_id: string;
    set_id: string;
    source_id: string;
    collector_number: number;
    rarity: Rarity;
    art_variant: string;
    is_signed: boolean;
    is_promo: boolean;
    finish: string;
    image_url: string;
    artist: string;
    public_code: string;
    printed_rules_text: string;
    printed_effect_text: string;
  }[] = [];

  for (const p of data.printings) {
    const gameCard = data.cards[p.cardId];
    for (const finish of getFinishes(p.set, gameCard.type, gameCard.superTypes, p.rarity)) {
      const id = buildPrintingId(p.sourceId, p.artVariant, p.isSigned, p.isPromo, finish);
      printingRows.push({
        id,
        card_id: p.cardId,
        set_id: p.set,
        source_id: p.sourceId,
        collector_number: p.collectorNumber,
        rarity: p.rarity,
        art_variant: p.artVariant,
        is_signed: p.isSigned,
        is_promo: p.isPromo,
        finish,
        image_url: p.art.imageURL.split("?")[0],
        artist: p.art.artist,
        public_code: p.publicCode,
        printed_rules_text: p.printedRulesText,
        printed_effect_text: p.printedEffectText,
      });
    }
  }

  // Upsert in batches — preserves price history across re-seeds
  const BATCH_SIZE = 200;
  for (let i = 0; i < printingRows.length; i += BATCH_SIZE) {
    await db
      .insertInto("printings")
      .values(printingRows.slice(i, i + BATCH_SIZE))
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          card_id: sql<string>`excluded.card_id`,
          set_id: sql<string>`excluded.set_id`,
          collector_number: sql<number>`excluded.collector_number`,
          rarity: sql<Rarity>`excluded.rarity`,
          image_url: sql<string>`excluded.image_url`,
          artist: sql<string>`excluded.artist`,
          public_code: sql<string>`excluded.public_code`,
          printed_rules_text: sql<string>`excluded.printed_rules_text`,
          printed_effect_text: sql<string>`excluded.printed_effect_text`,
        }),
      )
      .execute();
  }

  console.log(`  ✓ Printings: ${printingRows.length} rows`);

  // ── Stale row detection ───────────────────────────────────────────────────
  const seedSetIds = new Set(data.sets.map((s) => s.id));
  const seedCardIds = new Set(Object.keys(data.cards));
  const seedPrintingIds = new Set(printingRows.map((r) => r.id));

  const dbSets = await db.selectFrom("sets").select("id").execute();
  const staleSets = dbSets.filter((r) => !seedSetIds.has(r.id));

  const dbCards = await db.selectFrom("cards").select("id").execute();
  const staleCards = dbCards.filter((r) => !seedCardIds.has(r.id));

  const dbPrintings = await db.selectFrom("printings").select("id").execute();
  const stalePrintings = dbPrintings.filter((r) => !seedPrintingIds.has(r.id));

  if (staleSets.length > 0 || staleCards.length > 0 || stalePrintings.length > 0) {
    console.log("\n⚠ Stale rows (in DB but not in seed data):");
    if (staleSets.length > 0) {
      console.log(`  Sets (${staleSets.length}): ${staleSets.map((r) => r.id).join(", ")}`);
    }
    if (staleCards.length > 0) {
      console.log(`  Cards (${staleCards.length}): ${staleCards.map((r) => r.id).join(", ")}`);
    }
    if (stalePrintings.length > 0) {
      console.log(
        `  Printings (${stalePrintings.length}): ${stalePrintings.map((r) => r.id).join(", ")}`,
      );
    }
  }

  console.log("\nRefresh complete.");
}

if (import.meta.main) {
  const { createDb } = await import("./connect.js");
  const db = createDb();
  try {
    await refreshCatalog(db);
  } finally {
    await db.destroy();
  }
}
