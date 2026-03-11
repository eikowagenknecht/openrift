import { candidateUploadSchema } from "@openrift/shared/schemas";
import type { Context } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

// POST /candidates/upload
export async function handleUpload(c: Context<{ Variables: Variables }>) {
  const { source, candidates } = candidateUploadSchema.parse(await c.req.json());

  // Load alias table for matching
  const aliasRows = await db.selectFrom("card_name_aliases").select(["alias", "card_id"]).execute();
  const aliasMap = new Map(aliasRows.map((r) => [r.alias.toLowerCase(), r.card_id]));

  // Load existing card names for exact matching
  const cardRows = await db.selectFrom("cards").select(["id", "name"]).execute();
  const nameToCardId = new Map(cardRows.map((r) => [r.name.toLowerCase(), r.id]));

  let newCards = 0;
  let updates = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      // Determine match_card_id
      const nameLower = candidate.card.name.toLowerCase();
      let matchCardId: string | null =
        aliasMap.get(nameLower) ?? nameToCardId.get(nameLower) ?? null;

      // Verify matched card still exists
      if (matchCardId) {
        const exists = await db
          .selectFrom("cards")
          .select("id")
          .where("id", "=", matchCardId)
          .executeTakeFirst();
        if (!exists) {
          matchCardId = null;
        }
      }

      // Insert candidate card + printings in a transaction
      await db.transaction().execute(async (trx) => {
        const [inserted] = await trx
          .insertInto("candidate_cards")
          .values({
            status: "pending",
            source,
            match_card_id: matchCardId,
            source_id: candidate.card.source_id,
            name: candidate.card.name,
            type: candidate.card.type,
            super_types: candidate.card.super_types,
            domains: candidate.card.domains,
            might: candidate.card.might,
            energy: candidate.card.energy,
            power: candidate.card.power,
            might_bonus: candidate.card.might_bonus,
            keywords: candidate.card.keywords,
            rules_text: candidate.card.rules_text,
            effect_text: candidate.card.effect_text,
            tags: candidate.card.tags,
          })
          .returning("id")
          .execute();

        for (const p of candidate.printings) {
          await trx
            .insertInto("candidate_printings")
            .values({
              candidate_card_id: inserted.id,
              source_id: p.source_id,
              set_id: p.set_id,
              set_name: p.set_name ?? null,
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
              image_url: p.image_url ?? null,
            })
            .execute();
        }
      });

      if (matchCardId) {
        updates++;
      } else {
        newCards++;
      }
    } catch (error) {
      errors.push(
        `${candidate.card.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return c.json({ newCards, updates, errors });
}
