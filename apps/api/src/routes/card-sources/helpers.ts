import { extractKeywords } from "@openrift/shared/keywords";
import type { Transaction } from "kysely";
import type { z } from "zod";

import type { Database } from "../../db/index.js";
import type { acceptNewCardSchema } from "./schemas.js";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
export { resolveCardId } from "../../db-helpers.js";

/** Upsert a set by ID, inserting it with the next sort_order if it doesn't exist. */
export async function upsertSet(
  trx: Transaction<Database>,
  setSlug: string,
  setName: string,
): Promise<void> {
  const existing = await trx
    .selectFrom("sets")
    .select("id")
    .where("slug", "=", setSlug)
    .executeTakeFirst();

  if (!existing) {
    const { max } = await trx
      .selectFrom("sets")
      .select((eb) => eb.fn.coalesce(eb.fn.max("sortOrder"), eb.lit(0)).as("max"))
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("sets")
      .values({ slug: setSlug, name: setName, printedTotal: 0, sortOrder: max + 1 })
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
      .updateTable("printingImages")
      .set({ isActive: false, updatedAt: new Date() })
      .where("printingId", "=", printingId)
      .where("face", "=", "front")
      .where("isActive", "=", true)
      .execute();

    // Insert or update as active
    await trx
      .insertInto("printingImages")
      .values({
        printingId: printingId,
        face: "front",
        source,
        originalUrl: imageUrl,
        isActive: true,
      })
      .onConflict((oc) =>
        oc.columns(["printingId", "face", "source"]).doUpdateSet({
          originalUrl: imageUrl,
          isActive: true,
          updatedAt: new Date(),
        }),
      )
      .execute();
  } else {
    // Insert as inactive additional image
    await trx
      .insertInto("printingImages")
      .values({
        printingId: printingId,
        face: "front",
        source,
        originalUrl: imageUrl,
        isActive: false,
      })
      .onConflict((oc) =>
        oc.columns(["printingId", "face", "source"]).doUpdateSet({
          originalUrl: imageUrl,
          updatedAt: new Date(),
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
  cardFields: z.infer<typeof acceptNewCardSchema>["cardFields"],
  normalizedName: string,
): Promise<void> {
  const keywords = [
    ...extractKeywords(cardFields.rulesText ?? ""),
    ...extractKeywords(cardFields.effectText ?? ""),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const { id: cardUuid } = await trx
    .insertInto("cards")
    .values({
      slug: cardFields.id,
      name: cardFields.name,
      type: cardFields.type,
      superTypes: cardFields.superTypes ?? [],
      domains: cardFields.domains,
      might: cardFields.might ?? null,
      energy: cardFields.energy ?? null,
      power: cardFields.power ?? null,
      mightBonus: cardFields.mightBonus ?? null,
      keywords,
      rulesText: cardFields.rulesText ?? null,
      effectText: cardFields.effectText ?? null,
      tags: cardFields.tags ?? [],
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  // Link all card_sources with matching normalized name to the new card
  await createNameAliases(trx, normalizedName, cardUuid);
}

/**
 * Create name aliases for every distinct spelling of the normalized name,
 * so that resolveCardId() can match card_sources to this card dynamically.
 */
export async function createNameAliases(
  trx: Transaction<Database>,
  normalizedName: string,
  cardId: string,
): Promise<void> {
  await trx
    .insertInto("cardNameAliases")
    .values({ normName: normalizedName, cardId: cardId })
    .onConflict((oc) => oc.column("normName").doUpdateSet({ cardId: cardId }))
    .execute();
}
