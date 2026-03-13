import type { Transaction } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/types.js";
import type { CardType } from "../types.js";
import { extractKeywords } from "./extract-keywords.js";

// SQL equivalent of normalizeNameForMatching — strips non-alphanumeric and lowercases
const sqlNormName = (col: string) =>
  sql`lower(regexp_replace(${sql.ref(col)}, '[^a-zA-Z0-9]', '', 'g'))`;

/** Upsert a set by ID, inserting it with the next sort_order if it doesn't exist. */
export async function upsertSet(
  trx: Transaction<Database>,
  setId: string,
  setName: string,
): Promise<void> {
  const existing = await trx
    .selectFrom("sets")
    .select("id")
    .where("id", "=", setId)
    .executeTakeFirst();

  if (!existing) {
    const { max } = await trx
      .selectFrom("sets")
      .select((eb) => eb.fn.coalesce(eb.fn.max("sort_order"), eb.lit(0)).as("max"))
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("sets")
      .values({ id: setId, name: setName, printed_total: 0, sort_order: max + 1 })
      .execute();
  }
}

/**
 * Insert an image record into printing_images.
 *
 * @param mode - `'main'`: deactivate current active image, insert/update as active.
 *               `'additional'`: insert as inactive.
 */
export async function insertPrintingImage(
  trx: Transaction<Database>,
  printingId: string,
  imageUrl: string | null,
  source: string,
  mode: "main" | "additional" = "main",
): Promise<void> {
  if (!imageUrl) {
    return;
  }

  if (mode === "main") {
    // Deactivate current active front image
    await trx
      .updateTable("printing_images")
      .set({ is_active: false, updated_at: new Date() })
      .where("printing_id", "=", printingId)
      .where("face", "=", "front")
      .where("is_active", "=", true)
      .execute();

    // Insert or update as active
    await trx
      .insertInto("printing_images")
      .values({
        printing_id: printingId,
        face: "front",
        source,
        original_url: imageUrl,
        is_active: true,
      })
      .onConflict((oc) =>
        oc.columns(["printing_id", "face", "source"]).doUpdateSet({
          original_url: imageUrl,
          is_active: true,
          updated_at: new Date(),
        }),
      )
      .execute();
  } else {
    // Insert as inactive additional image
    await trx
      .insertInto("printing_images")
      .values({
        printing_id: printingId,
        face: "front",
        source,
        original_url: imageUrl,
        is_active: false,
      })
      .onConflict((oc) =>
        oc.columns(["printing_id", "face", "source"]).doUpdateSet({
          original_url: imageUrl,
          updated_at: new Date(),
        }),
      )
      .execute();
  }
}

/**
 * Create a new card from source data,
 * then link all card_sources with the given normalized name to the new card.
 * Printings are accepted separately via acceptNewPrintingFromSource.
 */
export async function acceptNewCardFromSources(
  trx: Transaction<Database>,
  cardFields: {
    id: string;
    name: string;
    type: CardType;
    superTypes: string[];
    domains: string[];
    might: number | null;
    energy: number | null;
    power: number | null;
    mightBonus: number | null;
    rulesText: string | null;
    effectText: string | null;
    tags: string[];
  },
  normalizedName: string,
): Promise<void> {
  const keywords = [
    ...extractKeywords(cardFields.rulesText ?? ""),
    ...extractKeywords(cardFields.effectText ?? ""),
  ].filter((v, i, a) => a.indexOf(v) === i);

  await trx
    .insertInto("cards")
    .values({
      id: cardFields.id,
      name: cardFields.name,
      type: cardFields.type,
      super_types: cardFields.superTypes,
      domains: cardFields.domains,
      might: cardFields.might,
      energy: cardFields.energy,
      power: cardFields.power,
      might_bonus: cardFields.mightBonus,
      keywords,
      rules_text: cardFields.rulesText,
      effect_text: cardFields.effectText,
      tags: cardFields.tags,
    })
    .execute();

  // Link all card_sources with matching normalized name to the new card
  await linkUnmatchedSources(trx, normalizedName, cardFields.id);
}

/**
 * Set card_id on all unmatched card_sources whose normalized name matches,
 * and create name aliases for every distinct spelling.
 */
export async function linkUnmatchedSources(
  trx: Transaction<Database>,
  normalizedName: string,
  cardId: string,
): Promise<void> {
  // Find all distinct name spellings that match
  const nameRows = await trx
    .selectFrom("card_sources")
    .select("name")
    .distinct()
    .where(sqlNormName("card_sources.name"), "=", normalizedName)
    .where("card_id", "is", null)
    .execute();

  // Link all matching card_sources
  await trx
    .updateTable("card_sources")
    .set({ card_id: cardId, updated_at: new Date() })
    .where(sqlNormName("card_sources.name"), "=", normalizedName)
    .where("card_id", "is", null)
    .execute();

  // Create aliases for every name variant so future uploads match automatically
  for (const { name } of nameRows) {
    await trx
      .insertInto("card_name_aliases")
      .values({ alias: name, card_id: cardId })
      .onConflict((oc) => oc.column("alias").doUpdateSet({ card_id: cardId }))
      .execute();
  }
}
