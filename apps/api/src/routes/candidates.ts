import { buildPrintingId } from "@openrift/shared/db/utils";
import { candidateUploadSchema } from "@openrift/shared/schemas";
import { Hono } from "hono";
import { sql } from "kysely";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";
import { acceptNewCandidate, insertPrintingImage } from "./candidate-helpers.js";

export const candidatesRoute = new Hono<{ Variables: Variables }>();

// ── POST /candidates/upload ─────────────────────────────────────────────────

candidatesRoute.post("/candidates/upload", async (c) => {
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
});

// ── GET /candidates ─────────────────────────────────────────────────────────

candidatesRoute.get("/candidates", async (c) => {
  const tab = c.req.query("tab") ?? "new";
  const status = c.req.query("status") ?? "pending";

  const baseQuery = db
    .selectFrom("candidate_cards")
    .selectAll("candidate_cards")
    .where("candidate_cards.status", "=", status);

  const query =
    tab === "new"
      ? baseQuery.where("candidate_cards.match_card_id", "is", null)
      : baseQuery.where("candidate_cards.match_card_id", "is not", null);

  const rows = await query.orderBy("candidate_cards.created_at", "desc").execute();

  // Load printings for all candidates
  const candidateIds = rows.map((r) => r.id);
  const printings =
    candidateIds.length > 0
      ? await db
          .selectFrom("candidate_printings")
          .selectAll()
          .where("candidate_card_id", "in", candidateIds)
          .execute()
      : [];

  const printingsByCandidate = new Map<string, typeof printings>();
  for (const p of printings) {
    const list = printingsByCandidate.get(p.candidate_card_id) ?? [];
    list.push(p);
    printingsByCandidate.set(p.candidate_card_id, list);
  }

  // For updates tab, load matched cards
  const matchedCardIds = rows.map((r) => r.match_card_id).filter((id): id is string => id !== null);
  const matchedCards =
    matchedCardIds.length > 0
      ? await db
          .selectFrom("cards")
          .select(["id", "name"])
          .where("id", "in", matchedCardIds)
          .execute()
      : [];
  const matchedCardMap = new Map(matchedCards.map((r) => [r.id, r]));

  const result = rows.map((row) => ({
    id: row.id,
    status: row.status,
    source: row.source,
    matchCardId: row.match_card_id,
    sourceId: row.source_id,
    name: row.name,
    type: row.type,
    superTypes: row.super_types,
    domains: row.domains,
    might: row.might,
    energy: row.energy,
    power: row.power,
    mightBonus: row.might_bonus,
    keywords: row.keywords,
    rulesText: row.rules_text,
    effectText: row.effect_text,
    tags: row.tags,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewedBy: row.reviewed_by,
    printings: (printingsByCandidate.get(row.id) ?? []).map((p) => ({
      id: p.id,
      sourceId: p.source_id,
      setId: p.set_id,
      setName: p.set_name,
      collectorNumber: p.collector_number,
      rarity: p.rarity,
      artVariant: p.art_variant,
      isSigned: p.is_signed,
      isPromo: p.is_promo,
      finish: p.finish,
      artist: p.artist,
      publicCode: p.public_code,
      printedRulesText: p.printed_rules_text,
      printedEffectText: p.printed_effect_text,
      imageUrl: p.image_url,
    })),
    matchedCard: row.match_card_id ? (matchedCardMap.get(row.match_card_id) ?? null) : null,
  }));

  return c.json(result);
});

// ── PATCH /candidates/:id ───────────────────────────────────────────────────

candidatesRoute.patch("/candidates/:id", async (c) => {
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
});

// ── POST /candidates/:id/accept ─────────────────────────────────────────────

candidatesRoute.post("/candidates/:id/accept", async (c) => {
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
});

// ── POST /candidates/:id/reject ─────────────────────────────────────────────

candidatesRoute.post("/candidates/:id/reject", async (c) => {
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
});

// ── POST /candidates/batch-accept ───────────────────────────────────────────

candidatesRoute.post("/candidates/batch-accept", async (c) => {
  const body = await c.req.json();
  const ids: string[] = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError(400, "BAD_REQUEST", "ids array required");
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const id of ids) {
    try {
      // Reuse accept logic by making internal call
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
});

// ── POST /candidates/:id/alias ──────────────────────────────────────────────

candidatesRoute.post("/candidates/:id/alias", async (c) => {
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
});
