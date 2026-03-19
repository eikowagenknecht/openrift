import { zValidator } from "@hono/zod-validator";
import type { CardSourceUploadResponse } from "@openrift/shared";
import { extractKeywords } from "@openrift/shared/keywords";
import { RARITY_ORDER } from "@openrift/shared/types";
import { normalizeNameForMatching } from "@openrift/shared/utils";
import { Hono } from "hono";

import { AppError } from "../../../errors.js";
import {
  acceptPrinting,
  renamePrinting,
  updatePrintingPromoType,
} from "../../../services/printing-admin.js";
import type { Variables } from "../../../types.js";
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
    const { cardSourceMutations: mut } = c.get("repos");
    const now = new Date();

    const [cardResult, printingResult] = await Promise.all([
      mut.autoCheckCardSources(now),
      mut.autoCheckPrintingSources(now),
    ]);

    return c.json({
      cardSourcesChecked: Number(cardResult.numAffectedRows),
      printingSourcesChecked: Number(printingResult.numAffectedRows),
    });
  })

  // ── POST /:cardSourceId/check ──────────────────────────────────────────────
  .post("/:cardSourceId/check", async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const { cardSourceId } = c.req.param();

    const result = await mut.checkCardSource(cardSourceId);

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Card source not found");
    }

    return c.body(null, 204);
  })

  // ── POST /:cardSourceId/uncheck ────────────────────────────────────────────
  .post("/:cardSourceId/uncheck", async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const { cardSourceId } = c.req.param();

    const result = await mut.uncheckCardSource(cardSourceId);

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
      const { cardSourceMutations: mut } = c.get("repos");
      const { printingId, extraIds } = c.req.valid("json");

      const updated = await mut.checkAllPrintingSources(printingId, extraIds);
      return c.json({ updated });
    },
  )

  // ── POST /printing-sources/:id/check ─────────────────────────────────────
  .post("/printing-sources/:id/check", async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const { id } = c.req.param();

    const result = await mut.checkPrintingSource(id);

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.body(null, 204);
  })

  // ── POST /printing-sources/:id/uncheck ─────────────────────────────────────
  .post("/printing-sources/:id/uncheck", async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const { id } = c.req.param();

    const result = await mut.uncheckPrintingSource(id);

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.body(null, 204);
  })

  // ── POST /:cardId/check-all ──────────────────────────────────────────────
  // Mark all card_sources for a given card as checked
  .post("/:cardId/check-all", async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const cardSlug = c.req.param("cardId");

    // Resolve slug → card, then find sources by name/alias
    const card = await mut.getCardBySlug(cardSlug);
    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Card not found");
    }

    const cardNormName = normalizeNameForMatching(card.name);
    const aliasRows = await mut.getCardAliases(card.id);
    const uniqueVariants = [...new Set([cardNormName, ...aliasRows.map((a) => a.normName)])];

    const updated = await mut.checkAllCardSources(uniqueVariants, card.id);
    return c.json({ updated });
  })

  // ── PATCH /printing-sources/:id ───────────────────────────────────────────
  // Update differentiator fields on a printing_source (e.g. fix wrong art_variant)
  .patch("/printing-sources/:id", zValidator("json", patchPrintingSourceSchema), async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const allowedFields = [
      "artVariant",
      "isSigned",
      "promoTypeId",
      "finish",
      "collectorNumber",
      "setId",
      "sourceId",
      "rarity",
    ];

    const updates: Record<string, unknown> = {};
    const bodyRecord = body as Record<string, unknown>;
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = bodyRecord[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new AppError(400, "BAD_REQUEST", "No valid fields to update");
    }

    const result = await mut.patchPrintingSource(id, updates);

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.body(null, 204);
  })

  // ── DELETE /printing-sources/:id ──────────────────────────────────────────
  .delete("/printing-sources/:id", async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const { id } = c.req.param();

    const result = await mut.deletePrintingSource(id);

    if (!result || result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    return c.body(null, 204);
  })

  // ── POST /printing-sources/:id/copy ───────────────────────────────────────
  // Duplicate a printing_source and link the copy to a different printing
  .post("/printing-sources/:id/copy", zValidator("json", copyPrintingSourceSchema), async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const { id } = c.req.param();
    const { printingId } = c.req.valid("json");

    if (!printingId) {
      throw new AppError(400, "BAD_REQUEST", "printingId is required");
    }

    const ps = await mut.getPrintingSourceById(id);

    if (!ps) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    const target = await mut.getPrintingDifferentiatorsById(printingId);

    if (!target) {
      throw new AppError(404, "NOT_FOUND", "Target printing not found");
    }

    await mut.copyPrintingSource(ps, target);

    return c.body(null, 204);
  })

  // ── POST /printing-sources/link ───────────────────────────────────────────
  // Bulk-link (or unlink) printing sources to a printing
  .post("/printing-sources/link", zValidator("json", linkPrintingSourcesSchema), async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const { printingSourceIds, printingId } = c.req.valid("json");

    if (!Array.isArray(printingSourceIds) || printingSourceIds.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "printingSourceIds[] required");
    }

    await mut.linkPrintingSources(printingSourceIds, printingId);

    // Persist or remove link overrides so links survive delete + re-upload
    if (printingId) {
      const p = await mut.getPrintingSlugById(printingId);
      if (p) {
        await mut.upsertPrintingLinkOverrides(printingSourceIds, p.slug);
      }
    } else {
      await mut.removePrintingLinkOverrides(printingSourceIds);
    }

    return c.body(null, 204);
  })

  // ── POST /:cardId/rename ──────────────────────────────────────────────────
  .post("/:cardId/rename", zValidator("json", renameSchema), async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const cardSlug = c.req.param("cardId");
    const { newId } = c.req.valid("json");

    if (!newId?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "newId is required");
    }

    if (newId === cardSlug) {
      return c.body(null, 204);
    }

    // UUID PK is immutable — only the slug changes
    await mut.renameCardSlug(cardSlug, newId.trim());

    return c.body(null, 204);
  })

  // ── POST /:cardId/accept-field ────────────────────────────────────────────
  .post("/:cardId/accept-field", zValidator("json", acceptFieldSchema), async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
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

    const updates: Record<string, unknown> = { [field]: value };

    // Recompute keywords when rulesText or effectText changes
    if (field === "rulesText" || field === "effectText") {
      const card = await mut.getCardTexts(cardSlug);
      if (!card) {
        throw new AppError(404, "NOT_FOUND", "Card not found");
      }
      const rulesText = field === "rulesText" ? (value as string) : card.rulesText;
      const effectText = field === "effectText" ? (value as string) : card.effectText;
      updates.keywords = [
        ...extractKeywords(rulesText ?? ""),
        ...extractKeywords(effectText ?? ""),
      ].filter((v, i, a) => a.indexOf(v) === i);
    }

    await mut.updateCardBySlug(cardSlug, updates);

    return c.body(null, 204);
  })

  // ── POST /printing/:printingId/accept-field ──────────────────────────────
  .post("/printing/:printingId/accept-field", zValidator("json", acceptFieldSchema), async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
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
      "promoTypeId",
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

    // When promoTypeId changes, rebuild the printing slug and rename rehosted files
    if (field === "promoTypeId") {
      const { printingImages, promoTypes } = c.get("repos");
      await updatePrintingPromoType(
        c.get("db"),
        c.get("io"),
        { printingImages, promoTypes },
        printingSlug,
        (normalizedValue as string) || null,
      );
      return c.body(null, 204);
    }

    await mut.updatePrintingBySlug(printingSlug, field, normalizedValue);

    return c.body(null, 204);
  })

  // ── POST /printing/:printingId/rename ────────────────────────────────────
  .post("/printing/:printingId/rename", zValidator("json", renameSchema), async (c) => {
    const { cardSourceMutations, printingImages } = c.get("repos");
    const printingSlug = c.req.param("printingId");
    const { newId } = c.req.valid("json");

    if (!newId?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "newId is required");
    }

    if (newId === printingSlug) {
      return c.body(null, 204);
    }

    await renamePrinting(
      c.get("io"),
      { cardSourceMutations, printingImages },
      printingSlug,
      newId.trim(),
    );

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

    const { cardSourceMutations: mut } = c.get("repos");
    await db.transaction().execute(async (trx) => {
      await mut.acceptNewCardFromSources(trx, cardFields, normalizedName);
    });

    return c.body(null, 204);
  })

  // ── POST /new/:name/link ──────────────────────────────────────────────────
  // Link unmatched sources to an existing card
  .post("/new/:name/link", zValidator("json", linkUnmatchedSchema), async (c) => {
    const db = c.get("db");
    const { cardSourceMutations: mut } = c.get("repos");
    const normalizedName = decodeURIComponent(c.req.param("name"));
    const { cardId: cardSlug } = c.req.valid("json");

    if (!cardSlug) {
      throw new AppError(400, "BAD_REQUEST", "cardId required");
    }

    const card = await mut.getCardIdBySlug(cardSlug);

    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Target card not found");
    }

    await db.transaction().execute(async (trx) => {
      await mut.createNameAliases(trx, normalizedName, card.id);
    });

    return c.body(null, 204);
  })

  // ── POST /:cardId/accept-printing ─────────────────────────────────────────
  // Create a new printing from admin-selected fields, link all sources in the group
  .post("/:cardId/accept-printing", zValidator("json", acceptPrintingSchema), async (c) => {
    const { cardSourceMutations, printingImages, promoTypes } = c.get("repos");
    const cardSlug = c.req.param("cardId");
    const { printingFields, printingSourceIds } = c.req.valid("json");

    const printingId = await acceptPrinting(
      c.get("db"),
      { cardSourceMutations, printingImages, promoTypes },
      cardSlug,
      printingFields,
      printingSourceIds,
    );

    return c.json({ printingId });
  })

  // ── POST /upload ──────────────────────────────────────────────────────────
  .post("/upload", zValidator("json", uploadCardSourcesSchema), async (c) => {
    const db = c.get("db");
    const { source, candidates: cards } = c.req.valid("json");

    const { ingestCardSources } = c.get("services");
    const result = await ingestCardSources(db, source.trim(), cards);

    return c.json({
      newCards: result.newCards,
      updates: result.updates,
      unchanged: result.unchanged,
      errors: result.errors,
      updatedCards: result.updatedCards,
    } satisfies CardSourceUploadResponse);
  })

  // ── DELETE /by-source/:source ─────────────────────────────────────────────
  // Delete all card_sources (and cascaded printing_sources) for a given source name
  .delete("/by-source/:source", async (c) => {
    const { cardSourceMutations: mut } = c.get("repos");
    const source = decodeURIComponent(c.req.param("source"));
    if (!source.trim()) {
      throw new AppError(400, "BAD_REQUEST", "Source name is required");
    }

    const deleted = await mut.deleteBySource(source.trim());
    return c.json({ source, deleted });
  });
