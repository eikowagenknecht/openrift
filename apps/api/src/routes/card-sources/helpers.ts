import { extractKeywords } from "@openrift/shared/keywords";
import type { Transaction } from "kysely";
import type { z } from "zod";

import type { Database } from "../../db/index.js";
import { setsRepo } from "../../repositories/sets.js";
import type { acceptNewCardSchema } from "./schemas.js";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
export { resolveCardId } from "../../db-helpers.js";

/** Upsert a set by slug, inserting it with the next sort_order if it doesn't exist. */
export async function upsertSet(
  trx: Transaction<Database>,
  setSlug: string,
  setName: string,
): Promise<void> {
  // Delegates to setsRepo — trx is passed as both the db binding and the transaction context
  await setsRepo(trx).upsert(setSlug, setName, trx);
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
