/* oxlint-disable no-console -- CLI script */
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { CardType, Rarity } from "../types.js";
import { fetchCatalog } from "./fetch-catalog.js";
import type { Database } from "./types.js";
import { buildPrintingId } from "./utils.js";

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

export interface CatalogChange {
  kind: "added" | "updated" | "stale";
  entity: "set" | "card" | "printing" | "image";
  id: string;
  name?: string;
  fields?: string[];
}

export interface CatalogRefreshResult {
  sets: { total: number; names: string[] };
  cards: { total: number };
  printings: { total: number };
  images: { total: number; added: number; updated: number };
  changes: CatalogChange[];
}

export async function refreshCatalog(
  db: Kysely<Database>,
  options?: { dryRun?: boolean },
): Promise<CatalogRefreshResult> {
  const dryRun = options?.dryRun ?? false;
  const data = await fetchCatalog();
  const changes: CatalogChange[] = [];

  console.log("Seeding database...");

  // ── Snapshot existing data for change detection ─────────────────────────────
  const setRows = await db.selectFrom("sets").select(["id", "name", "printed_total"]).execute();
  const existingSets = new Map(setRows.map((r) => [r.id, r]));

  const cardRows = await db
    .selectFrom("cards")
    .select([
      "id",
      "name",
      "type",
      "super_types",
      "domains",
      "might",
      "energy",
      "power",
      "might_bonus",
      "keywords",
      "rules_text",
      "effect_text",
      "tags",
    ])
    .execute();
  const existingCards = new Map(cardRows.map((r) => [r.id, r]));

  const printingRows_ = await db.selectFrom("printings").select("id").execute();
  const existingPrintingIds = new Set(printingRows_.map((r) => r.id));

  const imageRows_ = await db
    .selectFrom("printing_images")
    .select(["printing_id", "original_url"])
    .where("face", "=", "front")
    .where("source", "=", "gallery")
    .execute();
  const existingGalleryImages = new Map(imageRows_.map((r) => [r.printing_id, r.original_url]));

  // ── Sets ───────────────────────────────────────────────────────────────────
  for (const set of data.sets) {
    const existing = existingSets.get(set.id);
    if (existing) {
      const changed: string[] = [];
      if (existing.name !== set.name) {
        changed.push("name");
      }
      if (existing.printed_total !== set.printedTotal) {
        changed.push("printed_total");
      }
      if (changed.length > 0) {
        changes.push({
          kind: "updated",
          entity: "set",
          id: set.id,
          name: set.name,
          fields: changed,
        });
      }
    } else {
      changes.push({ kind: "added", entity: "set", id: set.id, name: set.name });
    }

    if (!dryRun) {
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
    }

    console.log(`  ${dryRun ? "(dry run)" : "✓"} Set: ${set.name}`);
  }

  // ── Game cards ─────────────────────────────────────────────────────────────
  for (const [id, card] of Object.entries(data.cards)) {
    const existing = existingCards.get(id);
    if (existing) {
      const changed: string[] = [];
      if (existing.name !== card.name) {
        changed.push("name");
      }
      if (existing.type !== card.type) {
        changed.push("type");
      }
      if (JSON.stringify(existing.super_types) !== JSON.stringify(card.superTypes)) {
        changed.push("super_types");
      }
      if (JSON.stringify(existing.domains) !== JSON.stringify(card.domains)) {
        changed.push("domains");
      }
      if (existing.might !== card.stats.might) {
        changed.push("might");
      }
      if (existing.energy !== card.stats.energy) {
        changed.push("energy");
      }
      if (existing.power !== card.stats.power) {
        changed.push("power");
      }
      if (existing.might_bonus !== card.mightBonus) {
        changed.push("might_bonus");
      }
      if (JSON.stringify(existing.keywords) !== JSON.stringify(card.keywords)) {
        changed.push("keywords");
      }
      if (existing.rules_text !== card.rulesText) {
        changed.push("rules_text");
      }
      if (existing.effect_text !== card.effectText) {
        changed.push("effect_text");
      }
      if (JSON.stringify(existing.tags) !== JSON.stringify(card.tags)) {
        changed.push("tags");
      }
      if (changed.length > 0) {
        changes.push({ kind: "updated", entity: "card", id, name: card.name, fields: changed });
      }
    } else {
      changes.push({ kind: "added", entity: "card", id, name: card.name });
    }

    if (!dryRun) {
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
  }

  console.log(
    `  ${dryRun ? "(dry run)" : "✓"} Cards: ${Object.keys(data.cards).length} game cards`,
  );

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
    artist: string;
    public_code: string;
    printed_rules_text: string;
    printed_effect_text: string;
    _image_url: string | null;
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
        artist: p.art.artist,
        _image_url: p.art.imageURL?.split("?")[0] ?? null,
        public_code: p.publicCode,
        printed_rules_text: p.printedRulesText,
        printed_effect_text: p.printedEffectText,
      });
    }
  }

  // Upsert in batches — preserves price history across re-seeds
  if (!dryRun) {
    const BATCH_SIZE = 200;
    for (let i = 0; i < printingRows.length; i += BATCH_SIZE) {
      const batch = printingRows.slice(i, i + BATCH_SIZE);
      await db
        .insertInto("printings")
        .values(batch.map(({ _image_url, ...row }) => row))
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            card_id: sql<string>`excluded.card_id`,
            set_id: sql<string>`excluded.set_id`,
            collector_number: sql<number>`excluded.collector_number`,
            rarity: sql<Rarity>`excluded.rarity`,
            artist: sql<string>`excluded.artist`,
            public_code: sql<string>`excluded.public_code`,
            printed_rules_text: sql<string>`excluded.printed_rules_text`,
            printed_effect_text: sql<string>`excluded.printed_effect_text`,
          }),
        )
        .execute();

      // Upsert printing_images for gallery source.
      // Uses the (printing_id, face, source) unique index so gallery rows
      // are updated without touching images from other sources.
      // is_active is only set on INSERT (first time) — if another source is
      // already active, the gallery row stays inactive.
      const imageRows = batch
        .filter((r) => r._image_url)
        .map((r) => ({
          printing_id: r.id,
          face: "front" as const,
          source: "gallery",
          original_url: r._image_url as string,
          is_active: true,
        }));
      if (imageRows.length > 0) {
        await db
          .insertInto("printing_images")
          .values(imageRows)
          .onConflict((oc) =>
            oc.columns(["printing_id", "face", "source"]).doUpdateSet({
              original_url: sql<string>`excluded.original_url`,
              updated_at: sql`NOW()`,
            }),
          )
          .execute();
      }
    }
  }

  // Track new printings
  for (const row of printingRows) {
    if (!existingPrintingIds.has(row.id)) {
      changes.push({ kind: "added", entity: "printing", id: row.id });
    }
  }

  // Track image changes
  let imagesAdded = 0;
  let imagesUpdated = 0;
  for (const row of printingRows) {
    if (!row._image_url) {
      continue;
    }
    const existing = existingGalleryImages.get(row.id);
    if (existing === undefined) {
      imagesAdded++;
      changes.push({ kind: "added", entity: "image", id: row.id });
    } else if (existing !== row._image_url) {
      imagesUpdated++;
      changes.push({ kind: "updated", entity: "image", id: row.id, fields: ["original_url"] });
    }
  }

  console.log(`  ${dryRun ? "(dry run)" : "✓"} Printings: ${printingRows.length} rows`);
  if (imagesAdded > 0 || imagesUpdated > 0) {
    console.log(
      `  ${dryRun ? "(dry run)" : "✓"} Images: ${imagesAdded} new, ${imagesUpdated} updated`,
    );
  }

  // ── Stale row detection ───────────────────────────────────────────────────
  const seedSetIds = new Set(data.sets.map((s) => s.id));
  const seedCardIds = new Set(Object.keys(data.cards));
  const seedPrintingIds = new Set(printingRows.map((r) => r.id));

  const staleSets = [...existingSets.keys()].filter((id) => !seedSetIds.has(id));
  const staleCards = [...existingCards.keys()].filter((id) => !seedCardIds.has(id));
  const stalePrintings = [...existingPrintingIds].filter((id) => !seedPrintingIds.has(id));

  for (const id of staleSets) {
    changes.push({ kind: "stale", entity: "set", id, name: existingSets.get(id)?.name });
  }
  for (const id of staleCards) {
    changes.push({ kind: "stale", entity: "card", id, name: existingCards.get(id)?.name });
  }
  for (const id of stalePrintings) {
    changes.push({ kind: "stale", entity: "printing", id });
  }

  if (staleSets.length > 0 || staleCards.length > 0 || stalePrintings.length > 0) {
    console.log("\n⚠ Stale rows (in DB but not in seed data):");
    if (staleSets.length > 0) {
      console.log(`  Sets (${staleSets.length}): ${staleSets.join(", ")}`);
    }
    if (staleCards.length > 0) {
      console.log(`  Cards (${staleCards.length}): ${staleCards.join(", ")}`);
    }
    if (stalePrintings.length > 0) {
      console.log(`  Printings (${stalePrintings.length}): ${stalePrintings.join(", ")}`);
    }
  }

  console.log(`\n${dryRun ? "Dry run" : "Refresh"} complete.`);

  const totalImages = printingRows.filter((r) => r._image_url).length;
  return {
    sets: { total: data.sets.length, names: data.sets.map((s) => s.name) },
    cards: { total: Object.keys(data.cards).length },
    printings: { total: printingRows.length },
    images: { total: totalImages, added: imagesAdded, updated: imagesUpdated },
    changes,
  };
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
