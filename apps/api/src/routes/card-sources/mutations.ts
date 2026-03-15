import { zValidator } from "@hono/zod-validator";
import { extractKeywords } from "@openrift/shared/keywords";
import type { Finish, Rarity } from "@openrift/shared/types";
import { RARITY_ORDER } from "@openrift/shared/types";
import { buildPrintingId, normalizeNameForMatching } from "@openrift/shared/utils";
import { Hono } from "hono";
import { sql } from "kysely";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { ingestCardSources } from "../../services/ingest-card-sources.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";
import {
  acceptNewCardFromSources,
  createNameAliases,
  insertPrintingImage,
  resolveCardId,
  upsertSet,
} from "./helpers.js";
import {
  acceptFieldSchema,
  acceptNewCardSchema,
  acceptPrintingSchema,
  checkAllPrintingSourcesSchema,
  copyPrintingSourceSchema,
  linkPrintingSourcesSchema,
  linkUnmatchedSchema,
  patchPrintingSourceSchema,
  renameSchema,
  uploadCardSourcesSchema,
} from "./schemas.js";

// ── POST /auto-check ───────────────────────────────────────────────────────
// Bulk-mark sources as checked when every acceptable field matches the active
// card or printing.  Must be registered before /:cardSourceId/check so the
// wildcard doesn't swallow "auto-check".
export const mutationsRoute = new Hono<{ Variables: Variables }>()
  .post("/auto-check", async (c) => {
    const now = new Date();
    const rcid = resolveCardId("cs");

    // Normalise empty strings to NULL so '' and NULL are treated as equal.
    const n = (ref: string) => sql`COALESCE(NULLIF(${sql.ref(ref)}, ''), NULL)`;

    // 1. Card sources: compare all acceptablefields against the resolved card
    const cardResult = await sql`
      UPDATE card_sources cs
      SET checked_at = ${now}, updated_at = ${now}
      FROM cards c
      WHERE c.id = (${rcid})
        AND cs.checked_at IS NULL
        AND cs.name        IS NOT DISTINCT FROM c.name
        AND cs.type        IS NOT DISTINCT FROM c.type
        AND cs.super_types IS NOT DISTINCT FROM c.super_types
        AND cs.domains     IS NOT DISTINCT FROM c.domains
        AND cs.might       IS NOT DISTINCT FROM c.might
        AND cs.energy      IS NOT DISTINCT FROM c.energy
        AND cs.power       IS NOT DISTINCT FROM c.power
        AND cs.might_bonus IS NOT DISTINCT FROM c.might_bonus
        AND ${n("cs.rules_text")}  IS NOT DISTINCT FROM ${n("c.rules_text")}
        AND ${n("cs.effect_text")} IS NOT DISTINCT FROM ${n("c.effect_text")}
        AND cs.tags        IS NOT DISTINCT FROM c.tags
    `.execute(db);

    // 2. Printing sources: compare against the linked printing
    const printingResult = await sql`
      UPDATE printing_sources ps
      SET checked_at = ${now}, updated_at = ${now}
      FROM printings p
      LEFT JOIN sets s ON s.id = p.set_id
      WHERE ps.printing_id = p.id
        AND ps.checked_at IS NULL
        AND ps.source_id         IS NOT DISTINCT FROM p.source_id
        AND ps.set_id            IS NOT DISTINCT FROM s.slug
        AND ps.collector_number  IS NOT DISTINCT FROM p.collector_number
        AND LOWER(ps.rarity)     IS NOT DISTINCT FROM LOWER(p.rarity)
        AND ${n("ps.art_variant")}  IS NOT DISTINCT FROM ${n("p.art_variant")}
        AND ps.is_signed         IS NOT DISTINCT FROM p.is_signed
        AND ps.is_promo          IS NOT DISTINCT FROM p.is_promo
        AND ps.finish            IS NOT DISTINCT FROM p.finish
        AND COALESCE(ps.artist, '') IS NOT DISTINCT FROM p.artist
        AND ps.public_code       IS NOT DISTINCT FROM p.public_code
        AND ${n("ps.printed_rules_text")}  IS NOT DISTINCT FROM ${n("p.printed_rules_text")}
        AND ${n("ps.printed_effect_text")} IS NOT DISTINCT FROM ${n("p.printed_effect_text")}
        AND ${n("ps.flavor_text")}         IS NOT DISTINCT FROM ${n("p.flavor_text")}
    `.execute(db);

    return c.json({
      ok: true,
      cardSourcesChecked: Number(cardResult.numAffectedRows),
      printingSourcesChecked: Number(printingResult.numAffectedRows),
    });
  })

  // ── POST /:cardSourceId/check ──────────────────────────────────────────────
  .post("/:cardSourceId/check", async (c) => {
    const { cardSourceId } = c.req.param();

    const result = await db
      .updateTable("card_sources")
      .set({ checked_at: new Date(), updated_at: new Date() })
      .where("id", "=", cardSourceId)
      .executeTakeFirst();

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Card source not found");
    }

    return c.json({ ok: true });
  })

  // ── POST /printing-sources/check-all ─────────────────────────────────────
  // Mark all printing_sources for a given printing as checked
  // NOTE: Must be registered before /:cardId/check-all to avoid
  // the :cardId wildcard matching "printing-sources" as a card ID.
  .post(
    "/printing-sources/check-all",
    zValidator("json", checkAllPrintingSourcesSchema),
    async (c) => {
      const { printingId, extraIds } = c.req.valid("json");

      const results = await db
        .updateTable("printing_sources")
        .set({ checked_at: new Date(), updated_at: new Date() })
        .where((eb) =>
          eb.or([
            eb("printing_id", "=", printingId),
            ...(extraIds?.length ? [eb("id", "in", extraIds)] : []),
          ]),
        )
        .where("checked_at", "is", null)
        .execute();

      const updated = results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
      return c.json({ ok: true, updated });
    },
  )

  // ── POST /printing-sources/:id/check ─────────────────────────────────────
  .post("/printing-sources/:id/check", async (c) => {
    const { id } = c.req.param();

    const result = await db
      .updateTable("printing_sources")
      .set({ checked_at: new Date(), updated_at: new Date() })
      .where("id", "=", id)
      .executeTakeFirst();

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.json({ ok: true });
  })

  // ── POST /:cardId/check-all ──────────────────────────────────────────────
  // Mark all card_sources for a given card as checked
  .post("/:cardId/check-all", async (c) => {
    const cardSlug = c.req.param("cardId");

    // Resolve slug → card, then find sources by name/alias
    const card = await db
      .selectFrom("cards")
      .select(["id", "name"])
      .where("slug", "=", cardSlug)
      .executeTakeFirst();
    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Card not found");
    }

    const cardNormName = normalizeNameForMatching(card.name);
    const aliasRows = await db
      .selectFrom("card_name_aliases")
      .select("norm_name")
      .where("card_id", "=", card.id)
      .execute();
    const uniqueVariants = [...new Set([cardNormName, ...aliasRows.map((a) => a.norm_name)])];

    const results = await db
      .updateTable("card_sources")
      .set({ checked_at: new Date(), updated_at: new Date() })
      .where("card_sources.norm_name", "in", uniqueVariants)
      .where("checked_at", "is", null)
      .execute();

    const updated = results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
    return c.json({ ok: true, updated });
  })

  // ── PATCH /printing-sources/:id ───────────────────────────────────────────
  // Update differentiator fields on a printing_source (e.g. fix wrong art_variant)
  .patch("/printing-sources/:id", zValidator("json", patchPrintingSourceSchema), async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const allowedFields: Record<string, string> = {
      artVariant: "art_variant",
      isSigned: "is_signed",
      isPromo: "is_promo",
      finish: "finish",
      collectorNumber: "collector_number",
      setId: "set_id",
      sourceId: "source_id",
      rarity: "rarity",
    };

    const updates: Record<string, unknown> = { updated_at: new Date() };
    const bodyRecord = body as Record<string, unknown>;
    for (const [camel, col] of Object.entries(allowedFields)) {
      if (camel in body) {
        updates[col] = bodyRecord[camel];
      }
    }

    if (Object.keys(updates).length === 1) {
      throw new AppError(400, "BAD_REQUEST", "No valid fields to update");
    }

    const result = await db
      .updateTable("printing_sources")
      .set(updates)
      .where("id", "=", id)
      .executeTakeFirst();

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.json({ ok: true });
  })

  // ── DELETE /printing-sources/:id ──────────────────────────────────────────
  .delete("/printing-sources/:id", async (c) => {
    const { id } = c.req.param();

    const result = await db.deleteFrom("printing_sources").where("id", "=", id).execute();

    if (Number(result[0].numDeletedRows) === 0) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.json({ ok: true });
  })

  // ── POST /printing-sources/:id/copy ───────────────────────────────────────
  // Duplicate a printing_source and link the copy to a different printing
  .post("/printing-sources/:id/copy", zValidator("json", copyPrintingSourceSchema), async (c) => {
    const { id } = c.req.param();
    const { printingId } = c.req.valid("json");

    if (!printingId) {
      throw new AppError(400, "BAD_REQUEST", "printingId is required");
    }

    const ps = await db
      .selectFrom("printing_sources")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!ps) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    const target = await db
      .selectFrom("printings")
      .select(["id", "finish", "art_variant", "is_signed", "is_promo", "rarity"])
      .where("slug", "=", printingId)
      .executeTakeFirst();

    if (!target) {
      throw new AppError(404, "NOT_FOUND", "Target printing not found");
    }

    await db
      .insertInto("printing_sources")
      .values({
        card_source_id: ps.card_source_id,
        printing_id: target.id,
        source_id: ps.source_id,
        set_id: ps.set_id,
        set_name: ps.set_name,
        collector_number: ps.collector_number,
        rarity: target.rarity,
        art_variant: target.art_variant,
        is_signed: target.is_signed,
        is_promo: target.is_promo,
        finish: target.finish,
        artist: ps.artist,
        public_code: ps.public_code,
        printed_rules_text: ps.printed_rules_text,
        printed_effect_text: ps.printed_effect_text,
        image_url: ps.image_url,
        flavor_text: ps.flavor_text,
        source_entity_id: ps.source_entity_id,
        extra_data: ps.extra_data,
      })
      .execute();

    return c.json({ ok: true });
  })

  // ── POST /printing-sources/link ───────────────────────────────────────────
  // Bulk-link (or unlink) printing sources to a printing
  .post("/printing-sources/link", zValidator("json", linkPrintingSourcesSchema), async (c) => {
    const { printingSourceIds, printingId } = c.req.valid("json");

    if (!Array.isArray(printingSourceIds) || printingSourceIds.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "printingSourceIds[] required");
    }

    // Resolve slug → uuid if linking (printingId is null when unlinking)
    let printingUuid: string | null = null;
    if (printingId) {
      const p = await db
        .selectFrom("printings")
        .select("id")
        .where("slug", "=", printingId)
        .executeTakeFirst();
      if (!p) {
        throw new AppError(404, "NOT_FOUND", "Target printing not found");
      }
      printingUuid = p.id;
    }

    await db
      .updateTable("printing_sources")
      .set({ printing_id: printingUuid, updated_at: new Date() })
      .where("id", "in", printingSourceIds)
      .execute();

    return c.json({ ok: true });
  })

  // ── POST /:cardId/rename ──────────────────────────────────────────────────
  .post("/:cardId/rename", zValidator("json", renameSchema), async (c) => {
    const cardSlug = c.req.param("cardId");
    const { newId } = c.req.valid("json");

    if (!newId?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "newId is required");
    }

    if (newId === cardSlug) {
      return c.json({ ok: true });
    }

    // UUID PK is immutable — only the slug changes
    await db
      .updateTable("cards")
      .set({ slug: newId.trim(), updated_at: new Date() })
      .where("slug", "=", cardSlug)
      .execute();

    return c.json({ ok: true });
  })

  // ── POST /:cardId/accept-field ────────────────────────────────────────────
  .post("/:cardId/accept-field", zValidator("json", acceptFieldSchema), async (c) => {
    const cardSlug = c.req.param("cardId");
    const { field, value } = c.req.valid("json");

    if (!field) {
      throw new AppError(400, "BAD_REQUEST", "field is required");
    }

    const allowedFields: Record<string, string> = {
      name: "name",
      type: "type",
      superTypes: "super_types",
      domains: "domains",
      might: "might",
      energy: "energy",
      power: "power",
      mightBonus: "might_bonus",
      rulesText: "rules_text",
      effectText: "effect_text",
      tags: "tags",
    };

    const dbField = allowedFields[field];
    if (!dbField) {
      throw new AppError(400, "BAD_REQUEST", `Invalid field: ${field}`);
    }

    const updates: Record<string, unknown> = { [dbField]: value, updated_at: new Date() };

    // Recompute keywords when rules_text or effect_text changes
    if (dbField === "rules_text" || dbField === "effect_text") {
      const card = await db
        .selectFrom("cards")
        .select(["rules_text", "effect_text"])
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      const rulesText = dbField === "rules_text" ? (value as string) : card.rules_text;
      const effectText = dbField === "effect_text" ? (value as string) : card.effect_text;
      updates.keywords = [
        ...extractKeywords(rulesText ?? ""),
        ...extractKeywords(effectText ?? ""),
      ].filter((v, i, a) => a.indexOf(v) === i);
    }

    await db.updateTable("cards").set(updates).where("slug", "=", cardSlug).execute();

    return c.json({ ok: true });
  })

  // ── POST /printing/:printingId/accept-field ──────────────────────────────
  .post("/printing/:printingId/accept-field", zValidator("json", acceptFieldSchema), async (c) => {
    const printingSlug = c.req.param("printingId");
    const { field, value } = c.req.valid("json");

    if (!field) {
      throw new AppError(400, "BAD_REQUEST", "field is required");
    }

    const allowedFields: Record<string, string> = {
      sourceId: "source_id",
      setId: "set_id",
      collectorNumber: "collector_number",
      rarity: "rarity",
      artVariant: "art_variant",
      isSigned: "is_signed",
      isPromo: "is_promo",
      finish: "finish",
      artist: "artist",
      publicCode: "public_code",
      printedRulesText: "printed_rules_text",
      printedEffectText: "printed_effect_text",
      flavorText: "flavor_text",
      comment: "comment",
    };

    const dbField = allowedFields[field];
    if (!dbField) {
      throw new AppError(400, "BAD_REQUEST", `Invalid field: ${field}`);
    }

    // Normalize enum fields that have DB check constraints
    let normalizedValue = value;
    if (field === "rarity" && typeof value === "string") {
      normalizedValue = RARITY_ORDER.find((r) => r.toLowerCase() === value.toLowerCase()) || value;
    }

    await db
      .updateTable("printings")
      .set({ [dbField]: normalizedValue, updated_at: new Date() })
      .where("slug", "=", printingSlug)
      .execute();

    return c.json({ ok: true });
  })

  // ── POST /printing/:printingId/rename ────────────────────────────────────
  .post("/printing/:printingId/rename", zValidator("json", renameSchema), async (c) => {
    const printingSlug = c.req.param("printingId");
    const { newId } = c.req.valid("json");

    if (!newId?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "newId is required");
    }

    if (newId === printingSlug) {
      return c.json({ ok: true });
    }

    // UUID PK is immutable — only the slug changes
    await db
      .updateTable("printings")
      .set({ slug: newId.trim(), updated_at: new Date() })
      .where("slug", "=", printingSlug)
      .execute();

    return c.json({ ok: true });
  })

  // ── POST /new/:name/accept ────────────────────────────────────────────────
  // Create new card from source data and link card_sources
  .post("/new/:name/accept", zValidator("json", acceptNewCardSchema), async (c) => {
    const normalizedName = decodeURIComponent(c.req.param("name"));
    const { cardFields } = c.req.valid("json");

    if (!cardFields) {
      throw new AppError(400, "BAD_REQUEST", "cardFields required");
    }

    await db.transaction().execute(async (trx) => {
      await acceptNewCardFromSources(trx, cardFields, normalizedName);
    });

    return c.json({ ok: true });
  })

  // ── POST /new/:name/link ──────────────────────────────────────────────────
  // Link unmatched sources to an existing card
  .post("/new/:name/link", zValidator("json", linkUnmatchedSchema), async (c) => {
    const normalizedName = decodeURIComponent(c.req.param("name"));
    const { cardId: cardSlug } = c.req.valid("json");

    if (!cardSlug) {
      throw new AppError(400, "BAD_REQUEST", "cardId required");
    }

    const card = await db
      .selectFrom("cards")
      .select("id")
      .where("slug", "=", cardSlug)
      .executeTakeFirst();

    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Target card not found");
    }

    await db.transaction().execute(async (trx) => {
      await createNameAliases(trx, normalizedName, card.id);
    });

    return c.json({ ok: true });
  })

  // ── POST /:cardId/accept-printing ─────────────────────────────────────────
  // Create a new printing from admin-selected fields, link all sources in the group
  .post("/:cardId/accept-printing", zValidator("json", acceptPrintingSchema), async (c) => {
    const cardSlug = c.req.param("cardId");
    const { printingFields, printingSourceIds } = c.req.valid("json");

    if (printingSourceIds.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "printingFields and printingSourceIds[] required");
    }

    // Verify card exists (resolve slug → uuid)
    const card = await db
      .selectFrom("cards")
      .select("id")
      .where("slug", "=", cardSlug)
      .executeTakeFirst();

    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Card not found");
    }

    const printingId =
      printingFields.id ||
      buildPrintingId(
        printingFields.sourceId,
        printingFields.rarity ?? ("Common" satisfies Rarity),
        printingFields.isPromo ?? false,
        printingFields.finish ?? ("normal" satisfies Finish),
      );

    // Get source name from the first printing_source's card_source
    const firstPs = await db
      .selectFrom("printing_sources")
      .innerJoin("card_sources", "card_sources.id", "printing_sources.card_source_id")
      .select("card_sources.source")
      .where("printing_sources.id", "=", printingSourceIds[0])
      .executeTakeFirst();

    await db.transaction().execute(async (trx) => {
      if (printingFields.setId) {
        await upsertSet(trx, printingFields.setId, printingFields.setName ?? printingFields.setId);
      }

      let setUuid = "";
      if (printingFields.setId) {
        const setRow = await trx
          .selectFrom("sets")
          .select("id")
          .where("slug", "=", printingFields.setId)
          .executeTakeFirst();
        setUuid = setRow?.id ?? "";
      }

      // Normalize rarity to title case (source data may be lowercase)
      const rawRarity = String(printingFields.rarity || ("Common" satisfies Rarity));
      const normalizedRarity =
        RARITY_ORDER.find((r) => r.toLowerCase() === rawRarity.toLowerCase()) ||
        ("Common" satisfies Rarity);

      const inserted = await trx
        .insertInto("printings")
        .values({
          slug: printingId,
          card_id: card.id,
          set_id: setUuid,
          source_id: printingFields.sourceId,
          collector_number: printingFields.collectorNumber ?? 0,
          rarity: normalizedRarity as Rarity,
          art_variant: printingFields.artVariant ?? "",
          is_signed: printingFields.isSigned ?? false,
          is_promo: printingFields.isPromo ?? false,
          finish: printingFields.finish ?? ("normal" satisfies Finish),
          artist: printingFields.artist ?? "",
          public_code: printingFields.publicCode ?? "",
          printed_rules_text: printingFields.printedRulesText ?? null,
          printed_effect_text: printingFields.printedEffectText ?? null,
          flavor_text: printingFields.flavorText ?? null,
        })
        .onConflict((oc) =>
          oc.column("slug").doUpdateSet((eb) => ({
            artist: eb.ref("excluded.artist"),
            public_code: eb.ref("excluded.public_code"),
            printed_rules_text: eb.ref("excluded.printed_rules_text"),
            printed_effect_text: eb.ref("excluded.printed_effect_text"),
            flavor_text: eb.ref("excluded.flavor_text"),
          })),
        )
        .returning("id")
        .executeTakeFirstOrThrow();

      // Insert image from the first source
      if (printingFields.imageUrl) {
        await insertPrintingImage(
          trx,
          inserted.id,
          printingFields.imageUrl,
          firstPs?.source ?? "import",
        );
      }

      // Link all printing_sources in the group
      await trx
        .updateTable("printing_sources")
        .set({ printing_id: inserted.id, checked_at: new Date(), updated_at: new Date() })
        .where("id", "in", printingSourceIds)
        .execute();
    });

    return c.json({ ok: true, printingId });
  })

  // ── POST /printing-sources/:id/accept-new ────────────────────────────────
  // Create a new printing from a printing_source row (legacy, single source)
  .post("/printing-sources/:id/accept-new", async (c) => {
    const { id } = c.req.param();

    const ps = await db
      .selectFrom("printing_sources")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!ps) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    if (ps.printing_id) {
      throw new AppError(400, "BAD_REQUEST", "Printing source already linked to a printing");
    }

    // Get the parent card_source to resolve card dynamically
    const cs = await db
      .selectFrom("card_sources")
      .select(["name", "source"])
      .where("id", "=", ps.card_source_id)
      .executeTakeFirst();

    if (!cs) {
      throw new AppError(400, "BAD_REQUEST", "Card source not found");
    }

    // Resolve card by name or alias
    const normName = normalizeNameForMatching(cs.name);
    const resolvedCard = await db
      .selectFrom("cards")
      .select("id")
      .where("cards.norm_name", "=", normName)
      .executeTakeFirst();
    const aliasMatch = await db
      .selectFrom("card_name_aliases")
      .select("card_id")
      .where("card_name_aliases.norm_name", "=", normName)
      .executeTakeFirst();
    const cardId = resolvedCard?.id ?? aliasMatch?.card_id;

    if (!cardId) {
      throw new AppError(400, "BAD_REQUEST", "Card source does not match any card");
    }

    const printingId = buildPrintingId(ps.source_id, ps.rarity, ps.is_promo, ps.finish);

    await db.transaction().execute(async (trx) => {
      if (ps.set_id) {
        await upsertSet(trx, ps.set_id, ps.set_name ?? ps.set_id);
      }

      let setUuid = "";
      if (ps.set_id) {
        const setRow = await trx
          .selectFrom("sets")
          .select("id")
          .where("slug", "=", ps.set_id)
          .executeTakeFirst();
        setUuid = setRow?.id ?? "";
      }

      const inserted = await trx
        .insertInto("printings")
        .values({
          slug: printingId,
          card_id: cardId,
          set_id: setUuid,
          source_id: ps.source_id,
          collector_number: ps.collector_number,
          rarity: ps.rarity as Rarity,
          art_variant: ps.art_variant ?? "",
          is_signed: ps.is_signed,
          is_promo: ps.is_promo,
          finish: ps.finish,
          artist: ps.artist ?? "",
          public_code: ps.public_code,
          printed_rules_text: ps.printed_rules_text ?? null,
          printed_effect_text: ps.printed_effect_text,
          flavor_text: ps.flavor_text,
        })
        .onConflict((oc) =>
          oc.column("slug").doUpdateSet((eb) => ({
            artist: eb.ref("excluded.artist"),
            public_code: eb.ref("excluded.public_code"),
            printed_rules_text: eb.ref("excluded.printed_rules_text"),
            printed_effect_text: eb.ref("excluded.printed_effect_text"),
            flavor_text: eb.ref("excluded.flavor_text"),
          })),
        )
        .returning("id")
        .executeTakeFirstOrThrow();

      await insertPrintingImage(trx, inserted.id, ps.image_url, cs.source);

      await trx
        .updateTable("printing_sources")
        .set({ printing_id: inserted.id, checked_at: new Date(), updated_at: new Date() })
        .where("id", "=", id)
        .execute();
    });

    return c.json({ ok: true, printingId });
  })

  // ── POST /upload ──────────────────────────────────────────────────────────
  .post("/upload", zValidator("json", uploadCardSourcesSchema), async (c) => {
    const { source, candidates } = c.req.valid("json");

    if (!source || typeof source !== "string" || source.trim() === "") {
      throw new AppError(400, "BAD_REQUEST", "Non-empty source name is required");
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "Non-empty candidates array is required");
    }

    // Transform candidates to the ingestion format
    const cards = candidates.map(
      (candidate: { card: Record<string, unknown>; printings: Record<string, unknown>[] }) => ({
        name: candidate.card.name as string,
        type: candidate.card.type as string,
        super_types: (candidate.card.super_types as string[]) ?? [],
        domains: (candidate.card.domains as string[]) ?? [],
        might: candidate.card.might as number | null,
        energy: candidate.card.energy as number | null,
        power: candidate.card.power as number | null,
        might_bonus: (candidate.card.might_bonus as number | null) ?? null,
        rules_text: (candidate.card.rules_text as string | null) ?? null,
        effect_text: (candidate.card.effect_text as string | null) ?? null,
        tags: (candidate.card.tags as string[]) ?? [],
        source_id: (candidate.card.source_id as string) ?? null,
        source_entity_id: (candidate.card.source_entity_id as string) ?? null,
        extra_data: (candidate.card.extra_data as Record<string, unknown>) ?? null,
        printings: candidate.printings as {
          source_id: string;
          set_id: string;
          set_name?: string | null;
          collector_number: number;
          rarity: string;
          art_variant: string;
          is_signed: boolean;
          is_promo: boolean;
          finish: string;
          artist: string;
          public_code: string;
          printed_rules_text: string;
          printed_effect_text: string;
          image_url?: string | null;
          flavor_text?: string;
          extra_data?: unknown | null;
        }[],
      }),
    );

    const result = await ingestCardSources(db, source.trim(), cards);

    return c.json({
      newCards: result.newCards,
      updates: result.updates,
      unchanged: result.unchanged,
      errors: result.errors,
      updatedCards: result.updatedCards,
    });
  })

  // ── DELETE /by-source/:source ─────────────────────────────────────────────
  // Delete all card_sources (and cascaded printing_sources) for a given source name
  .delete("/by-source/:source", async (c) => {
    const source = decodeURIComponent(c.req.param("source"));
    if (!source.trim()) {
      throw new AppError(400, "BAD_REQUEST", "Source name is required");
    }

    const result = await db
      .deleteFrom("card_sources")
      .where("source", "=", source.trim())
      .execute();

    const deleted = Number(result[0].numDeletedRows);
    return c.json({ status: "ok", source, deleted });
  });
