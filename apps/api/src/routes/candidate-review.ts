import { buildPrintingId } from "@openrift/shared/utils";
import type { Context } from "hono";
import { sql } from "kysely";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";
import { acceptNewCandidate, insertPrintingImage } from "./candidate-helpers.js";

// PATCH /candidates/:id
export async function handlePatch(c: Context<{ Variables: Variables }>) {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await db
    .selectFrom("candidate_cards")
    .select("id")
    .where("id", "=", id)
    .where("status", "=", "pending")
    .executeTakeFirst();

  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Candidate not found or not pending");
  }

  // Only allow updating card fields
  const allowedFields = [
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
    "source_id",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, "BAD_REQUEST", "No valid fields to update");
  }

  await db
    .updateTable("candidate_cards")
    .set({ ...updates, updated_at: new Date() })
    .where("id", "=", id)
    .execute();

  return c.json({ ok: true });
}

// POST /candidates/:id/accept
export async function handleAccept(c: Context<{ Variables: Variables }>) {
  const { id } = c.req.param();
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  const candidate = await db
    .selectFrom("candidate_cards")
    .selectAll()
    .where("id", "=", id)
    .where("status", "=", "pending")
    .executeTakeFirst();

  if (!candidate) {
    throw new AppError(404, "NOT_FOUND", "Candidate not found or not pending");
  }

  const candidatePrintings = await db
    .selectFrom("candidate_printings")
    .selectAll()
    .where("candidate_card_id", "=", id)
    .execute();

  if (candidate.match_card_id) {
    // ── Update existing card ──────────────────────────────────────────────
    const matchCardId = candidate.match_card_id;
    const acceptedFields: string[] = body.acceptedFields ?? [];
    if (acceptedFields.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "No fields selected for update");
    }

    await db.transaction().execute(async (trx) => {
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

        // Upsert set if needed
        const existingSet = await trx
          .selectFrom("sets")
          .select("id")
          .where("id", "=", p.set_id)
          .executeTakeFirst();

        if (!existingSet) {
          await trx
            .insertInto("sets")
            .values({
              id: p.set_id,
              name: p.set_name ?? p.set_id,
              printed_total: 0,
            })
            .execute();
        }

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
          reviewed_by: user?.id ?? null,
          updated_at: new Date(),
        })
        .where("id", "=", id)
        .execute();
    });
  } else {
    // ── New card ──────────────────────────────────────────────────────────
    await db.transaction().execute(async (trx) => {
      await acceptNewCandidate(trx, candidate, candidatePrintings, user?.id ?? null);
    });
  }

  return c.json({ ok: true });
}

// POST /candidates/:id/reject
export async function handleReject(c: Context<{ Variables: Variables }>) {
  const { id } = c.req.param();
  const user = c.get("user");

  const result = await db
    .updateTable("candidate_cards")
    .set({
      status: "rejected",
      reviewed_at: new Date(),
      reviewed_by: user?.id ?? null,
      updated_at: new Date(),
    })
    .where("id", "=", id)
    .where("status", "=", "pending")
    .executeTakeFirst();

  if (!result || result.numUpdatedRows === 0n) {
    throw new AppError(404, "NOT_FOUND", "Candidate not found or not pending");
  }

  return c.json({ ok: true });
}

// POST /candidates/batch-accept
export async function handleBatchAccept(c: Context<{ Variables: Variables }>) {
  const body = await c.req.json();
  const ids: string[] = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError(400, "BAD_REQUEST", "ids array required");
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const id of ids) {
    try {
      const candidate = await db
        .selectFrom("candidate_cards")
        .selectAll()
        .where("id", "=", id)
        .where("status", "=", "pending")
        .where("match_card_id", "is", null)
        .executeTakeFirst();

      if (!candidate) {
        results.push({ id, ok: false, error: "Not found or not a pending new card" });
        continue;
      }

      const user = c.get("user");
      const candidatePrintings = await db
        .selectFrom("candidate_printings")
        .selectAll()
        .where("candidate_card_id", "=", id)
        .execute();

      await db.transaction().execute(async (trx) => {
        await acceptNewCandidate(trx, candidate, candidatePrintings, user?.id ?? null);
      });

      results.push({ id, ok: true });
    } catch (error) {
      results.push({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return c.json({ results });
}

// POST /candidates/:id/alias
export async function handleAlias(c: Context<{ Variables: Variables }>) {
  const { id } = c.req.param();
  const body = await c.req.json();
  const cardId: string | undefined = body.cardId;

  if (!cardId) {
    throw new AppError(400, "BAD_REQUEST", "cardId required");
  }

  // Verify the target card exists
  const targetCard = await db
    .selectFrom("cards")
    .select("id")
    .where("id", "=", cardId)
    .executeTakeFirst();

  if (!targetCard) {
    throw new AppError(404, "NOT_FOUND", "Target card not found");
  }

  const candidate = await db
    .selectFrom("candidate_cards")
    .select(["id", "name"])
    .where("id", "=", id)
    .where("status", "=", "pending")
    .executeTakeFirst();

  if (!candidate) {
    throw new AppError(404, "NOT_FOUND", "Candidate not found or not pending");
  }

  await db.transaction().execute(async (trx) => {
    // Insert alias
    await trx
      .insertInto("card_name_aliases")
      .values({ alias: candidate.name, card_id: cardId })
      .onConflict((oc) => oc.column("alias").doUpdateSet({ card_id: cardId }))
      .execute();

    // Reclassify candidate as update
    await trx
      .updateTable("candidate_cards")
      .set({ match_card_id: cardId, updated_at: new Date() })
      .where("id", "=", id)
      .execute();
  });

  return c.json({ ok: true });
}
