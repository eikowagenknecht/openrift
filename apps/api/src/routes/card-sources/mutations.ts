import { zValidator } from "@hono/zod-validator";
import { extractKeywords } from "@openrift/shared/keywords";
import type { ArtVariant, Finish, Rarity } from "@openrift/shared/types";
import { RARITY_ORDER } from "@openrift/shared/types";
import { buildPrintingId, normalizeNameForMatching } from "@openrift/shared/utils";
import { Hono } from "hono";
import { sql } from "kysely";

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
  cardFieldRules,
  checkAllPrintingSourcesSchema,
  copyPrintingSourceSchema,
  linkPrintingSourcesSchema,
  linkUnmatchedSchema,
  patchPrintingSourceSchema,
  printingFieldRules,
  renameSchema,
  uploadCardSourcesSchema,
} from "./schemas.js";

// ── POST /auto-check ───────────────────────────────────────────────────────
// Bulk-mark sources as checked when every acceptable field matches the active
// card or printing.  Must be registered before /:cardSourceId/check so the
// wildcard doesn't swallow "auto-check".
export const mutationsRoute = new Hono<{ Variables: Variables }>()
  .post("/auto-check", async (c) => {
    const db = c.get("db");
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
        AND ${n("cs.rulesText")}  IS NOT DISTINCT FROM ${n("c.rulesText")}
        AND ${n("cs.effectText")} IS NOT DISTINCT FROM ${n("c.effectText")}
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
        AND ${n("ps.artVariant")}  IS NOT DISTINCT FROM ${n("p.artVariant")}
        AND ps.is_signed         IS NOT DISTINCT FROM p.is_signed
        AND ps.is_promo          IS NOT DISTINCT FROM p.is_promo
        AND ps.finish            IS NOT DISTINCT FROM p.finish
        AND COALESCE(ps.artist, '') IS NOT DISTINCT FROM p.artist
        AND ps.public_code       IS NOT DISTINCT FROM p.public_code
        AND ${n("ps.printedRulesText")}  IS NOT DISTINCT FROM ${n("p.printedRulesText")}
        AND ${n("ps.printedEffectText")} IS NOT DISTINCT FROM ${n("p.printedEffectText")}
        AND ${n("ps.flavorText")}         IS NOT DISTINCT FROM ${n("p.flavorText")}
    `.execute(db);

    return c.json({
      cardSourcesChecked: Number(cardResult.numAffectedRows),
      printingSourcesChecked: Number(printingResult.numAffectedRows),
    });
  })

  // ── POST /:cardSourceId/check ──────────────────────────────────────────────
  .post("/:cardSourceId/check", async (c) => {
    const db = c.get("db");
    const { cardSourceId } = c.req.param();

    const result = await db
      .updateTable("cardSources")
      .set({ checkedAt: new Date(), updatedAt: new Date() })
      .where("id", "=", cardSourceId)
      .executeTakeFirst();

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Card source not found");
    }

    return c.body(null, 204);
  })

  // ── POST /printing-sources/check-all ─────────────────────────────────────
  // Mark all printing_sources for a given printing as checked
  // NOTE: Must be registered before /:cardId/check-all to avoid
  // the :cardId wildcard matching "printing-sources" as a card ID.
  .post(
    "/printing-sources/check-all",
    zValidator("json", checkAllPrintingSourcesSchema),
    async (c) => {
      const db = c.get("db");
      const { printingId, extraIds } = c.req.valid("json");

      const results = await db
        .updateTable("printingSources")
        .set({ checkedAt: new Date(), updatedAt: new Date() })
        .where((eb) =>
          eb.or([
            eb("printingId", "=", printingId),
            ...(extraIds?.length ? [eb("id", "in", extraIds)] : []),
          ]),
        )
        .where("checkedAt", "is", null)
        .execute();

      const updated = results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
      return c.json({ updated });
    },
  )

  // ── POST /printing-sources/:id/check ─────────────────────────────────────
  .post("/printing-sources/:id/check", async (c) => {
    const db = c.get("db");
    const { id } = c.req.param();

    const result = await db
      .updateTable("printingSources")
      .set({ checkedAt: new Date(), updatedAt: new Date() })
      .where("id", "=", id)
      .executeTakeFirst();

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.body(null, 204);
  })

  // ── POST /:cardId/check-all ──────────────────────────────────────────────
  // Mark all card_sources for a given card as checked
  .post("/:cardId/check-all", async (c) => {
    const db = c.get("db");
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
      .selectFrom("cardNameAliases")
      .select("normName")
      .where("cardId", "=", card.id)
      .execute();
    const uniqueVariants = [...new Set([cardNormName, ...aliasRows.map((a) => a.normName)])];

    const results = await db
      .updateTable("cardSources")
      .set({ checkedAt: new Date(), updatedAt: new Date() })
      .where("cardSources.normName", "in", uniqueVariants)
      .where("checkedAt", "is", null)
      .execute();

    const updated = results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
    return c.json({ updated });
  })

  // ── PATCH /printing-sources/:id ───────────────────────────────────────────
  // Update differentiator fields on a printing_source (e.g. fix wrong art_variant)
  .patch("/printing-sources/:id", zValidator("json", patchPrintingSourceSchema), async (c) => {
    const db = c.get("db");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const allowedFields = [
      "artVariant",
      "isSigned",
      "isPromo",
      "finish",
      "collectorNumber",
      "setId",
      "sourceId",
      "rarity",
    ];

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const bodyRecord = body as Record<string, unknown>;
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = bodyRecord[field];
      }
    }

    if (Object.keys(updates).length === 1) {
      throw new AppError(400, "BAD_REQUEST", "No valid fields to update");
    }

    const result = await db
      .updateTable("printingSources")
      .set(updates)
      .where("id", "=", id)
      .executeTakeFirst();

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.body(null, 204);
  })

  // ── DELETE /printing-sources/:id ──────────────────────────────────────────
  .delete("/printing-sources/:id", async (c) => {
    const db = c.get("db");
    const { id } = c.req.param();

    const result = await db.deleteFrom("printingSources").where("id", "=", id).executeTakeFirst();

    if (!result || result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.body(null, 204);
  })

  // ── POST /printing-sources/:id/copy ───────────────────────────────────────
  // Duplicate a printing_source and link the copy to a different printing
  .post("/printing-sources/:id/copy", zValidator("json", copyPrintingSourceSchema), async (c) => {
    const db = c.get("db");
    const { id } = c.req.param();
    const { printingId } = c.req.valid("json");

    if (!printingId) {
      throw new AppError(400, "BAD_REQUEST", "printingId is required");
    }

    const ps = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!ps) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    const target = await db
      .selectFrom("printings")
      .select(["id", "finish", "artVariant", "isSigned", "isPromo", "rarity"])
      .where("slug", "=", printingId)
      .executeTakeFirst();

    if (!target) {
      throw new AppError(404, "NOT_FOUND", "Target printing not found");
    }

    await db
      .insertInto("printingSources")
      .values({
        cardSourceId: ps.cardSourceId,
        printingId: target.id,
        sourceId: ps.sourceId,
        setId: ps.setId,
        setName: ps.setName,
        collectorNumber: ps.collectorNumber,
        rarity: target.rarity,
        artVariant: target.artVariant,
        isSigned: target.isSigned,
        isPromo: target.isPromo,
        finish: target.finish,
        artist: ps.artist,
        publicCode: ps.publicCode,
        printedRulesText: ps.printedRulesText,
        printedEffectText: ps.printedEffectText,
        imageUrl: ps.imageUrl,
        flavorText: ps.flavorText,
        sourceEntityId: ps.sourceEntityId,
        extraData: ps.extraData,
      })
      .execute();

    return c.body(null, 204);
  })

  // ── POST /printing-sources/link ───────────────────────────────────────────
  // Bulk-link (or unlink) printing sources to a printing
  .post("/printing-sources/link", zValidator("json", linkPrintingSourcesSchema), async (c) => {
    const db = c.get("db");
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
      .updateTable("printingSources")
      .set({ printingId: printingUuid, updatedAt: new Date() })
      .where("id", "in", printingSourceIds)
      .execute();

    return c.body(null, 204);
  })

  // ── POST /:cardId/rename ──────────────────────────────────────────────────
  .post("/:cardId/rename", zValidator("json", renameSchema), async (c) => {
    const db = c.get("db");
    const cardSlug = c.req.param("cardId");
    const { newId } = c.req.valid("json");

    if (!newId?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "newId is required");
    }

    if (newId === cardSlug) {
      return c.body(null, 204);
    }

    // UUID PK is immutable — only the slug changes
    await db
      .updateTable("cards")
      .set({ slug: newId.trim(), updatedAt: new Date() })
      .where("slug", "=", cardSlug)
      .execute();

    return c.body(null, 204);
  })

  // ── POST /:cardId/accept-field ────────────────────────────────────────────
  .post("/:cardId/accept-field", zValidator("json", acceptFieldSchema), async (c) => {
    const db = c.get("db");
    const cardSlug = c.req.param("cardId");
    const { field, value } = c.req.valid("json");

    if (!field) {
      throw new AppError(400, "BAD_REQUEST", "field is required");
    }

    const allowedFields = new Set([
      "name",
      "type",
      "superTypes",
      "domains",
      "might",
      "energy",
      "power",
      "mightBonus",
      "rulesText",
      "effectText",
      "tags",
    ]);

    if (!allowedFields.has(field)) {
      throw new AppError(400, "BAD_REQUEST", `Invalid field: ${field}`);
    }

    const validator = cardFieldRules[field as keyof typeof cardFieldRules];
    if (validator) {
      const parsed = validator.safeParse(value);
      if (!parsed.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Invalid value for ${field}: ${parsed.error.issues[0].message}`,
        );
      }
    }

    const updates: Record<string, unknown> = { [field]: value, updatedAt: new Date() };

    // Recompute keywords when rulesText or effectText changes
    if (field === "rulesText" || field === "effectText") {
      const card = await db
        .selectFrom("cards")
        .select(["rulesText", "effectText"])
        .where("slug", "=", cardSlug)
        .executeTakeFirstOrThrow();
      const rulesText = field === "rulesText" ? (value as string) : card.rulesText;
      const effectText = field === "effectText" ? (value as string) : card.effectText;
      updates.keywords = [
        ...extractKeywords(rulesText ?? ""),
        ...extractKeywords(effectText ?? ""),
      ].filter((v, i, a) => a.indexOf(v) === i);
    }

    await db.updateTable("cards").set(updates).where("slug", "=", cardSlug).execute();

    return c.body(null, 204);
  })

  // ── POST /printing/:printingId/accept-field ──────────────────────────────
  .post("/printing/:printingId/accept-field", zValidator("json", acceptFieldSchema), async (c) => {
    const db = c.get("db");
    const printingSlug = c.req.param("printingId");
    const { field, value } = c.req.valid("json");

    if (!field) {
      throw new AppError(400, "BAD_REQUEST", "field is required");
    }

    const allowedFields = new Set([
      "sourceId",
      "setId",
      "collectorNumber",
      "rarity",
      "artVariant",
      "isSigned",
      "isPromo",
      "finish",
      "artist",
      "publicCode",
      "printedRulesText",
      "printedEffectText",
      "flavorText",
      "comment",
    ]);

    if (!allowedFields.has(field)) {
      throw new AppError(400, "BAD_REQUEST", `Invalid field: ${field}`);
    }

    // Normalize enum fields that have DB check constraints (before validation
    // so that case-insensitive input like "common" is accepted)
    let normalizedValue = value;
    if (field === "rarity" && typeof value === "string") {
      normalizedValue = RARITY_ORDER.find((r) => r.toLowerCase() === value.toLowerCase()) || value;
    }

    // Validate against printingFieldRules when a rule exists for this field
    const validator = printingFieldRules[field as keyof typeof printingFieldRules];
    if (validator) {
      const parsed = validator.safeParse(normalizedValue);
      if (!parsed.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Invalid value for ${field}: ${parsed.error.issues[0].message}`,
        );
      }
    }

    await db
      .updateTable("printings")
      .set({ [field]: normalizedValue, updatedAt: new Date() })
      .where("slug", "=", printingSlug)
      .execute();

    return c.body(null, 204);
  })

  // ── POST /printing/:printingId/rename ────────────────────────────────────
  .post("/printing/:printingId/rename", zValidator("json", renameSchema), async (c) => {
    const db = c.get("db");
    const printingSlug = c.req.param("printingId");
    const { newId } = c.req.valid("json");

    if (!newId?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "newId is required");
    }

    if (newId === printingSlug) {
      return c.body(null, 204);
    }

    // UUID PK is immutable — only the slug changes
    await db
      .updateTable("printings")
      .set({ slug: newId.trim(), updatedAt: new Date() })
      .where("slug", "=", printingSlug)
      .execute();

    return c.body(null, 204);
  })

  // ── POST /new/:name/accept ────────────────────────────────────────────────
  // Create new card from source data and link card_sources
  .post("/new/:name/accept", zValidator("json", acceptNewCardSchema), async (c) => {
    const db = c.get("db");
    const normalizedName = decodeURIComponent(c.req.param("name"));
    const { cardFields } = c.req.valid("json");

    if (!cardFields) {
      throw new AppError(400, "BAD_REQUEST", "cardFields required");
    }

    await db.transaction().execute(async (trx) => {
      await acceptNewCardFromSources(trx, cardFields, normalizedName);
    });

    return c.body(null, 204);
  })

  // ── POST /new/:name/link ──────────────────────────────────────────────────
  // Link unmatched sources to an existing card
  .post("/new/:name/link", zValidator("json", linkUnmatchedSchema), async (c) => {
    const db = c.get("db");
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

    return c.body(null, 204);
  })

  // ── POST /:cardId/accept-printing ─────────────────────────────────────────
  // Create a new printing from admin-selected fields, link all sources in the group
  .post("/:cardId/accept-printing", zValidator("json", acceptPrintingSchema), async (c) => {
    const db = c.get("db");
    const cardSlug = c.req.param("cardId");
    const { printingFields, printingSourceIds } = c.req.valid("json");

    if (printingSourceIds.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "printingFields and printingSourceIds[] required");
    }
    if (!printingFields.setId) {
      throw new AppError(400, "BAD_REQUEST", "printingFields.setId is required");
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
      .selectFrom("printingSources")
      .innerJoin("cardSources", "cardSources.id", "printingSources.cardSourceId")
      .select("cardSources.source")
      .where("printingSources.id", "=", printingSourceIds[0])
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
      const normalizedRarity = RARITY_ORDER.find(
        (r) => r.toLowerCase() === rawRarity.toLowerCase(),
      );
      if (!normalizedRarity) {
        throw new AppError(
          400,
          "BAD_REQUEST",
          `Invalid rarity "${rawRarity}". Must be one of: ${RARITY_ORDER.join(", ")}`,
        );
      }

      const inserted = await trx
        .insertInto("printings")
        .values({
          slug: printingId,
          cardId: card.id,
          setId: setUuid,
          sourceId: printingFields.sourceId,
          collectorNumber: printingFields.collectorNumber,
          rarity: normalizedRarity as Rarity,
          artVariant: (printingFields.artVariant ?? "normal") as ArtVariant,
          isSigned: printingFields.isSigned ?? false,
          isPromo: printingFields.isPromo ?? false,
          finish: (printingFields.finish ?? "normal") as Finish,
          artist: printingFields.artist,
          publicCode: printingFields.publicCode,
          printedRulesText: printingFields.printedRulesText ?? null,
          printedEffectText: printingFields.printedEffectText ?? null,
          flavorText: printingFields.flavorText ?? null,
        })
        .onConflict((oc) =>
          oc.column("slug").doUpdateSet((eb) => ({
            artist: eb.ref("excluded.artist"),
            publicCode: eb.ref("excluded.publicCode"),
            printedRulesText: eb.ref("excluded.printedRulesText"),
            printedEffectText: eb.ref("excluded.printedEffectText"),
            flavorText: eb.ref("excluded.flavorText"),
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
        .updateTable("printingSources")
        .set({ printingId: inserted.id, checkedAt: new Date(), updatedAt: new Date() })
        .where("id", "in", printingSourceIds)
        .execute();
    });

    return c.json({ printingId });
  })

  // ── POST /printing-sources/:id/accept-new ────────────────────────────────
  // Create a new printing from a printing_source row (legacy, single source)
  .post("/printing-sources/:id/accept-new", async (c) => {
    const db = c.get("db");
    const { id } = c.req.param();

    const ps = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!ps) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    if (ps.printingId) {
      throw new AppError(400, "BAD_REQUEST", "Printing source already linked to a printing");
    }

    // Get the parent card_source to resolve card dynamically
    const cs = await db
      .selectFrom("cardSources")
      .select(["name", "source"])
      .where("id", "=", ps.cardSourceId)
      .executeTakeFirst();

    if (!cs) {
      throw new AppError(400, "BAD_REQUEST", "Card source not found");
    }

    // Resolve card by name or alias
    const normName = normalizeNameForMatching(cs.name);
    const resolvedCard = await db
      .selectFrom("cards")
      .select("id")
      .where("cards.normName", "=", normName)
      .executeTakeFirst();
    const aliasMatch = await db
      .selectFrom("cardNameAliases")
      .select("cardId")
      .where("cardNameAliases.normName", "=", normName)
      .executeTakeFirst();
    const cardId = resolvedCard?.id ?? aliasMatch?.cardId;

    if (!cardId) {
      throw new AppError(400, "BAD_REQUEST", "Card source does not match any card");
    }

    // Validate fields required by printings CHECK constraints
    const normalizedRarity = RARITY_ORDER.find(
      (r) => r.toLowerCase() === (ps.rarity ?? "").toLowerCase(),
    );
    if (!normalizedRarity) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Cannot accept: invalid rarity "${ps.rarity ?? "(empty)"}". Must be one of: ${RARITY_ORDER.join(", ")}`,
      );
    }
    const validatedFinish = printingFieldRules.finish.safeParse(ps.finish);
    if (!validatedFinish.success) {
      const finishDisplay = ps.finish ?? "(empty)";
      throw new AppError(400, "BAD_REQUEST", `Cannot accept: invalid finish "${finishDisplay}"`);
    }
    if (!ps.collectorNumber || ps.collectorNumber <= 0) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Cannot accept: collector_number must be a positive integer",
      );
    }
    if (!ps.artist) {
      throw new AppError(400, "BAD_REQUEST", "Cannot accept: artist is required");
    }
    if (!ps.publicCode) {
      throw new AppError(400, "BAD_REQUEST", "Cannot accept: public_code is required");
    }
    const collectorNumber = ps.collectorNumber;
    const { artist } = ps;
    const publicCode = ps.publicCode;

    const printingId = buildPrintingId(
      ps.sourceId,
      normalizedRarity,
      ps.isPromo ?? false,
      validatedFinish.data,
    );

    await db.transaction().execute(async (trx) => {
      if (ps.setId) {
        await upsertSet(trx, ps.setId, ps.setName ?? ps.setId);
      }

      let setUuid = "";
      if (ps.setId) {
        const setRow = await trx
          .selectFrom("sets")
          .select("id")
          .where("slug", "=", ps.setId)
          .executeTakeFirst();
        setUuid = setRow?.id ?? "";
      }

      const inserted = await trx
        .insertInto("printings")
        .values({
          slug: printingId,
          cardId: cardId,
          setId: setUuid,
          sourceId: ps.sourceId,
          collectorNumber: collectorNumber,
          rarity: normalizedRarity as Rarity,
          artVariant: (ps.artVariant ?? "normal") as ArtVariant,
          isSigned: ps.isSigned ?? false,
          isPromo: ps.isPromo ?? false,
          finish: validatedFinish.data as Finish,
          artist,
          publicCode: publicCode,
          printedRulesText: ps.printedRulesText ?? null,
          printedEffectText: ps.printedEffectText,
          flavorText: ps.flavorText,
        })
        .onConflict((oc) =>
          oc.column("slug").doUpdateSet((eb) => ({
            artist: eb.ref("excluded.artist"),
            publicCode: eb.ref("excluded.publicCode"),
            printedRulesText: eb.ref("excluded.printedRulesText"),
            printedEffectText: eb.ref("excluded.printedEffectText"),
            flavorText: eb.ref("excluded.flavorText"),
          })),
        )
        .returning("id")
        .executeTakeFirstOrThrow();

      await insertPrintingImage(trx, inserted.id, ps.imageUrl, cs.source);

      await trx
        .updateTable("printingSources")
        .set({ printingId: inserted.id, checkedAt: new Date(), updatedAt: new Date() })
        .where("id", "=", id)
        .execute();
    });

    return c.json({ printingId });
  })

  // ── POST /upload ──────────────────────────────────────────────────────────
  .post("/upload", zValidator("json", uploadCardSourcesSchema), async (c) => {
    const db = c.get("db");
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
    const db = c.get("db");
    const source = decodeURIComponent(c.req.param("source"));
    if (!source.trim()) {
      throw new AppError(400, "BAD_REQUEST", "Source name is required");
    }

    const result = await db.deleteFrom("cardSources").where("source", "=", source.trim()).execute();

    const deleted = Number(result[0].numDeletedRows);
    return c.json({ source, deleted });
  });
