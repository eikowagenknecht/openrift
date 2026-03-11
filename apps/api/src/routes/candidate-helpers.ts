import type { Database } from "@openrift/shared/db";
import { buildPrintingId } from "@openrift/shared/db/utils";
import type { Selectable, Transaction } from "kysely";

/**
 * Insert an image record into printing_images for a candidate's source.
 * If no active image exists for that printing+face, marks it active.
 * If one already exists (e.g. from gallery), inserts as inactive.
 */
export async function insertPrintingImage(
  trx: Transaction<Database>,
  printingId: string,
  imageUrl: string | null,
  source: string,
): Promise<void> {
  if (!imageUrl) {
    return;
  }

  // Check if there's already an active front image
  const hasActive = await trx
    .selectFrom("printing_images")
    .select("id")
    .where("printing_id", "=", printingId)
    .where("face", "=", "front")
    .where("is_active", "=", true)
    .executeTakeFirst();

  await trx
    .insertInto("printing_images")
    .values({
      printing_id: printingId,
      face: "front",
      source,
      original_url: imageUrl,
      is_active: !hasActive,
    })
    .onConflict((oc) =>
      oc.columns(["printing_id", "face", "source"]).doUpdateSet({
        original_url: imageUrl,
        updated_at: new Date(),
      }),
    )
    .execute();
}

/**
 * Shared transaction logic for accepting a new-card candidate:
 * upserts sets, inserts the card + printings + images, marks candidate accepted.
 */
export async function acceptNewCandidate(
  trx: Transaction<Database>,
  candidate: Selectable<Database["candidate_cards"]>,
  candidatePrintings: Selectable<Database["candidate_printings"]>[],
  userId: string | null,
): Promise<void> {
  const cardId = candidatePrintings[0].source_id;

  // Upsert sets
  const setIds = [...new Set(candidatePrintings.map((p) => p.set_id))];
  for (const setId of setIds) {
    const existingSet = await trx
      .selectFrom("sets")
      .select("id")
      .where("id", "=", setId)
      .executeTakeFirst();

    if (!existingSet) {
      const setName = candidatePrintings.find((p) => p.set_id === setId)?.set_name ?? setId;
      await trx.insertInto("sets").values({ id: setId, name: setName, printed_total: 0 }).execute();
    }
  }

  // Insert card
  await trx
    .insertInto("cards")
    .values({
      id: cardId,
      name: candidate.name,
      type: candidate.type,
      super_types: candidate.super_types,
      domains: candidate.domains,
      might: candidate.might,
      energy: candidate.energy,
      power: candidate.power,
      might_bonus: candidate.might_bonus,
      keywords: candidate.keywords,
      rules_text: candidate.rules_text,
      effect_text: candidate.effect_text,
      tags: candidate.tags,
    })
    .execute();

  // Insert printings
  for (const p of candidatePrintings) {
    const printingId = buildPrintingId(
      p.source_id,
      p.art_variant,
      p.is_signed,
      p.is_promo,
      p.finish,
    );

    await trx
      .insertInto("printings")
      .values({
        id: printingId,
        card_id: cardId,
        set_id: p.set_id,
        source_id: p.source_id,
        collector_number: p.collector_number,
        rarity: p.rarity,
        art_variant: p.art_variant,
        is_signed: p.is_signed,
        is_promo: p.is_promo,
        finish: p.finish,
        artist: p.artist,
        public_code: p.public_code,
        printed_rules_text: p.printed_rules_text,
        printed_effect_text: p.printed_effect_text,
      })
      .execute();

    await insertPrintingImage(trx, printingId, p.image_url, candidate.source);
  }

  // Mark as accepted
  await trx
    .updateTable("candidate_cards")
    .set({
      status: "accepted",
      reviewed_at: new Date(),
      reviewed_by: userId,
      updated_at: new Date(),
    })
    .where("id", "=", candidate.id)
    .execute();
}
