import type { Database } from "@openrift/shared/db";
import { buildPrintingId } from "@openrift/shared/utils";
import type { Selectable, Transaction } from "kysely";
import { sql } from "kysely";

/** Upsert a set by ID, inserting it with the next sort_order if it doesn't exist. */
async function upsertSet(
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
      .select(sql<number>`coalesce(max(sort_order), 0)`.as("max"))
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("sets")
      .values({ id: setId, name: setName, printed_total: 0, sort_order: max + 1 })
      .execute();
  }
}

/**
 * Insert an image record into printing_images for a candidate's source.
 * If no active image exists for that printing+face, marks it active.
 * If one already exists (e.g. from gallery), inserts as inactive.
 */
async function insertPrintingImage(
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
    const setName = candidatePrintings.find((p) => p.set_id === setId)?.set_name ?? setId;
    await upsertSet(trx, setId, setName);
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

/**
 * Shared transaction logic for accepting an existing-card candidate:
 * applies selected field updates, upserts printings + images, marks candidate accepted.
 */
export async function acceptExistingCardCandidate(
  trx: Transaction<Database>,
  candidate: Selectable<Database["candidate_cards"]>,
  candidatePrintings: Selectable<Database["candidate_printings"]>[],
  acceptedFields: string[],
  userId: string | null,
): Promise<void> {
  // Caller guarantees match_card_id is set (only called for update-existing-card flow)
  const matchCardId = candidate.match_card_id as string;

  const cardUpdates: Record<string, unknown> = {};
  const fieldMap: Record<string, string> = {
    name: "name",
    type: "type",
    superTypes: "super_types",
    domains: "domains",
    might: "might",
    energy: "energy",
    power: "power",
    mightBonus: "might_bonus",
    keywords: "keywords",
    rulesText: "rules_text",
    effectText: "effect_text",
    tags: "tags",
  };

  for (const field of acceptedFields) {
    const dbField = fieldMap[field];
    if (dbField && dbField in candidate) {
      cardUpdates[dbField] = candidate[dbField as keyof typeof candidate];
    }
  }

  if (Object.keys(cardUpdates).length > 0) {
    await trx.updateTable("cards").set(cardUpdates).where("id", "=", matchCardId).execute();
  }

  // Upsert printings for the matched card
  for (const p of candidatePrintings) {
    const printingId = buildPrintingId(
      p.source_id,
      p.art_variant,
      p.is_signed,
      p.is_promo,
      p.finish,
    );

    await upsertSet(trx, p.set_id, p.set_name ?? p.set_id);

    await trx
      .insertInto("printings")
      .values({
        id: printingId,
        card_id: matchCardId,
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
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          artist: sql<string>`excluded.artist`,
          public_code: sql<string>`excluded.public_code`,
          printed_rules_text: sql<string>`excluded.printed_rules_text`,
          printed_effect_text: sql<string>`excluded.printed_effect_text`,
        }),
      )
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
