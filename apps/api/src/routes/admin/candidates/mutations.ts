import { zValidator } from "@hono/zod-validator";
import type { CandidateCardUploadResponse } from "@openrift/shared";
import { extractKeywords } from "@openrift/shared/keywords";
import { RARITY_ORDER } from "@openrift/shared/types";
import { normalizeNameForMatching } from "@openrift/shared/utils";
import { Hono } from "hono";

import { AppError } from "../../../errors.js";
import { acceptGalleryForNewCard } from "../../../services/accept-gallery.js";
import {
  acceptPrinting,
  deletePrinting,
  renamePrinting,
  updatePrintingPromoType,
} from "../../../services/printing-admin.js";
import type { Variables } from "../../../types.js";
import {
  acceptFieldSchema,
  acceptNewCardSchema,
  acceptPrintingSchema,
  cardFieldRules,
  checkAllCandidatePrintingsSchema,
  copyCandidatePrintingSchema,
  linkCandidatePrintingsSchema,
  linkUnmatchedSchema,
  patchCandidatePrintingSchema,
  printingFieldRules,
  renameSchema,
  uploadCandidatesSchema,
} from "./schemas.js";

// ── POST /auto-check ───────────────────────────────────────────────────────
// Bulk-mark candidates as checked when every acceptable field matches the active
// card or printing.  Must be registered before /:candidateCardId/check so the
// wildcard doesn't swallow "auto-check".
export const mutationsRoute = new Hono<{ Variables: Variables }>()
  .post("/auto-check", async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const now = new Date();

    const [cardResult, printingResult] = await Promise.all([
      mut.autoCheckCandidateCards(now),
      mut.autoCheckCandidatePrintings(now),
    ]);

    return c.json({
      candidateCardsChecked: Number(cardResult.numAffectedRows),
      candidatePrintingsChecked: Number(printingResult.numAffectedRows),
    });
  })

  // ── POST /:candidateCardId/check ──────────────────────────────────────────────
  .post("/:candidateCardId/check", async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { candidateCardId } = c.req.param();

    const result = await mut.checkCandidateCard(candidateCardId);

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Candidate card not found");
    }

    return c.body(null, 204);
  })

  // ── POST /:candidateCardId/uncheck ────────────────────────────────────────────
  .post("/:candidateCardId/uncheck", async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { candidateCardId } = c.req.param();

    const result = await mut.uncheckCandidateCard(candidateCardId);

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Candidate card not found");
    }

    return c.body(null, 204);
  })

  // ── POST /candidate-printings/check-all ─────────────────────────────────────
  // Mark all candidate_printings for a given printing as checked
  // NOTE: Must be registered before /:cardId/check-all to avoid
  // the :cardId wildcard matching "candidate-printings" as a card ID.
  .post(
    "/candidate-printings/check-all",
    zValidator("json", checkAllCandidatePrintingsSchema),
    async (c) => {
      const { candidateMutations: mut } = c.get("repos");
      const { printingId, extraIds } = c.req.valid("json");

      const updated = await mut.checkAllCandidatePrintings(printingId, extraIds);
      return c.json({ updated });
    },
  )

  // ── POST /candidate-printings/:id/check ─────────────────────────────────────
  .post("/candidate-printings/:id/check", async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { id } = c.req.param();

    const result = await mut.checkCandidatePrinting(id);

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Candidate printing not found");
    }

    return c.body(null, 204);
  })

  // ── POST /candidate-printings/:id/uncheck ─────────────────────────────────────
  .post("/candidate-printings/:id/uncheck", async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { id } = c.req.param();

    const result = await mut.uncheckCandidatePrinting(id);

    if (!result || result.numUpdatedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Candidate printing not found");
    }

    return c.body(null, 204);
  })

  // ── POST /:cardId/check-all ──────────────────────────────────────────────
  // Mark all candidate_cards for a given card as checked
  .post("/:cardId/check-all", async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const cardSlug = c.req.param("cardId");

    // Resolve slug → card, then find candidates by name/alias
    const card = await mut.getCardBySlug(cardSlug);
    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Card not found");
    }

    const cardNormName = normalizeNameForMatching(card.name);
    const aliasRows = await mut.getCardAliases(card.id);
    const uniqueVariants = [...new Set([cardNormName, ...aliasRows.map((a) => a.normName)])];

    const updated = await mut.checkAllCandidateCards(uniqueVariants, card.id);
    return c.json({ updated });
  })

  // ── PATCH /candidate-printings/:id ───────────────────────────────────────────
  // Update differentiator fields on a candidate_printing (e.g. fix wrong art_variant)
  .patch(
    "/candidate-printings/:id",
    zValidator("json", patchCandidatePrintingSchema),
    async (c) => {
      const { candidateMutations: mut } = c.get("repos");
      const { id } = c.req.param();
      const body = c.req.valid("json");

      const allowedFields = [
        "artVariant",
        "isSigned",
        "promoTypeId",
        "finish",
        "collectorNumber",
        "setId",
        "shortCode",
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

      const result = await mut.patchCandidatePrinting(id, updates);

      if (!result || result.numUpdatedRows === 0n) {
        throw new AppError(404, "NOT_FOUND", "Candidate printing not found");
      }

      return c.body(null, 204);
    },
  )

  // ── DELETE /candidate-printings/:id ──────────────────────────────────────
  .delete("/candidate-printings/:id", async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { id } = c.req.param();

    const result = await mut.deleteCandidatePrinting(id);

    if (!result || result.numDeletedRows === 0n) {
      throw new AppError(404, "NOT_FOUND", "Candidate printing not found");
    }

    return c.body(null, 204);
  })

  // ── POST /candidate-printings/:id/copy ───────────────────────────────────
  // Duplicate a candidate_printing and link the copy to a different printing
  .post(
    "/candidate-printings/:id/copy",
    zValidator("json", copyCandidatePrintingSchema),
    async (c) => {
      const { candidateMutations: mut } = c.get("repos");
      const { id } = c.req.param();
      const { printingId } = c.req.valid("json");

      if (!printingId) {
        throw new AppError(400, "BAD_REQUEST", "printingId is required");
      }

      const ps = await mut.getCandidatePrintingById(id);

      if (!ps) {
        throw new AppError(404, "NOT_FOUND", "Candidate printing not found");
      }

      const target = await mut.getPrintingDifferentiatorsById(printingId);

      if (!target) {
        throw new AppError(404, "NOT_FOUND", "Target printing not found");
      }

      await mut.copyCandidatePrinting(ps, target);

      return c.body(null, 204);
    },
  )

  // ── POST /candidate-printings/link ───────────────────────────────────────
  // Bulk-link (or unlink) candidate printings to a printing
  .post(
    "/candidate-printings/link",
    zValidator("json", linkCandidatePrintingsSchema),
    async (c) => {
      const { candidateMutations: mut } = c.get("repos");
      const { candidatePrintingIds, printingId } = c.req.valid("json");

      if (!Array.isArray(candidatePrintingIds) || candidatePrintingIds.length === 0) {
        throw new AppError(400, "BAD_REQUEST", "candidatePrintingIds[] required");
      }

      await mut.linkCandidatePrintings(candidatePrintingIds, printingId);

      // Persist or remove link overrides so links survive delete + re-upload
      if (printingId) {
        const p = await mut.getPrintingSlugById(printingId);
        if (p) {
          await mut.upsertPrintingLinkOverrides(candidatePrintingIds, p.slug);
        }
      } else {
        await mut.removePrintingLinkOverrides(candidatePrintingIds);
      }

      return c.body(null, 204);
    },
  )

  // ── POST /:cardId/rename ──────────────────────────────────────────────────
  .post("/:cardId/rename", zValidator("json", renameSchema), async (c) => {
    const { candidateMutations: mut } = c.get("repos");
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
    const { candidateMutations: mut } = c.get("repos");
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
      "comment",
    ]);

    if (!allowedFields.has(field)) {
      throw new AppError(400, "BAD_REQUEST", `Invalid field: ${field}`);
    }

    // Normalize null to empty array for array-typed fields (DB stores NOT NULL DEFAULT '{}')
    const arrayFields = new Set(["superTypes", "tags"]);
    const normalized = value === null && arrayFields.has(field) ? [] : value;

    const validator = cardFieldRules[field as keyof typeof cardFieldRules];
    if (validator) {
      const parsed = validator.safeParse(normalized);
      if (!parsed.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Invalid value for ${field}: ${parsed.error.issues[0].message}`,
        );
      }
    }

    const updates: Record<string, unknown> = { [field]: normalized };

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
    const { candidateMutations: mut } = c.get("repos");
    const printingSlug = c.req.param("printingId");
    const { field, value } = c.req.valid("json");

    if (!field) {
      throw new AppError(400, "BAD_REQUEST", "field is required");
    }

    const allowedFields = new Set([
      "shortCode",
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

    // When promoTypeId changes, rebuild the printing slug
    if (field === "promoTypeId") {
      const { candidateMutations, promoTypes } = c.get("repos");
      await updatePrintingPromoType(
        { candidateMutations, promoTypes },
        printingSlug,
        (normalizedValue as string) || null,
      );
      return c.body(null, 204);
    }

    // Candidate printings store setId as a slug; printings store it as a UUID FK
    if (field === "setId" && normalizedValue) {
      const { sets } = c.get("repos");
      const setRow = await sets.getBySlug(normalizedValue as string);
      if (!setRow) {
        throw new AppError(404, "NOT_FOUND", `Set not found: ${normalizedValue}`);
      }
      normalizedValue = setRow.id;
    }

    await mut.updatePrintingBySlug(printingSlug, field, normalizedValue);

    return c.body(null, 204);
  })

  // ── POST /printing/:printingId/rename ────────────────────────────────────
  .post("/printing/:printingId/rename", zValidator("json", renameSchema), async (c) => {
    const { candidateMutations } = c.get("repos");
    const printingSlug = c.req.param("printingId");
    const { newId } = c.req.valid("json");

    if (!newId?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "newId is required");
    }

    if (newId === printingSlug) {
      return c.body(null, 204);
    }

    await renamePrinting({ candidateMutations }, printingSlug, newId.trim());

    return c.body(null, 204);
  })

  // ── DELETE /printing/:printingId ─────────────────────────────────────────
  // Delete a printing and clean up all related data
  .delete("/printing/:printingId", async (c) => {
    const { candidateMutations } = c.get("repos");
    const printingSlug = c.req.param("printingId");

    await deletePrinting(c.get("db"), c.get("io"), { candidateMutations }, printingSlug);

    return c.body(null, 204);
  })

  // ── POST /new/:name/accept ────────────────────────────────────────────────
  // Create new card from candidate data and link candidate_cards
  .post("/new/:name/accept", zValidator("json", acceptNewCardSchema), async (c) => {
    const db = c.get("db");
    const normalizedName = decodeURIComponent(c.req.param("name"));
    const { cardFields } = c.req.valid("json");

    if (!cardFields) {
      throw new AppError(400, "BAD_REQUEST", "cardFields required");
    }

    const { candidateMutations: mut } = c.get("repos");
    await db.transaction().execute(async (trx) => {
      await mut.acceptNewCardFromSources(trx, cardFields, normalizedName);
    });

    return c.body(null, 204);
  })

  // ── POST /new/:name/accept-gallery ───────────────────────────────────────
  // Create card + printings from gallery source, set images, and rehost
  .post("/new/:name/accept-gallery", async (c) => {
    const { candidateCards, candidateMutations, printingImages, promoTypes } = c.get("repos");
    const normalizedName = decodeURIComponent(c.req.param("name"));

    const result = await acceptGalleryForNewCard(
      c.get("db"),
      c.get("io"),
      { candidateCards, candidateMutations, printingImages, promoTypes },
      normalizedName,
    );

    return c.json(result);
  })

  // ── POST /new/:name/link ──────────────────────────────────────────────────
  // Link unmatched candidates to an existing card
  .post("/new/:name/link", zValidator("json", linkUnmatchedSchema), async (c) => {
    const db = c.get("db");
    const { candidateMutations: mut } = c.get("repos");
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
  // Create a new printing from admin-selected fields, link all candidates in the group
  .post("/:cardId/accept-printing", zValidator("json", acceptPrintingSchema), async (c) => {
    const { candidateMutations, printingImages, promoTypes } = c.get("repos");
    const cardSlug = c.req.param("cardId");
    const { printingFields, candidatePrintingIds } = c.req.valid("json");

    const printingId = await acceptPrinting(
      c.get("db"),
      { candidateMutations, printingImages, promoTypes },
      cardSlug,
      printingFields,
      candidatePrintingIds,
    );

    return c.json({ printingId });
  })

  // ── POST /upload ──────────────────────────────────────────────────────────
  .post("/upload", zValidator("json", uploadCandidatesSchema), async (c) => {
    const db = c.get("db");
    const { provider, candidates: cards } = c.req.valid("json");

    const { ingestCandidates } = c.get("services");
    const result = await ingestCandidates(db, provider.trim(), cards);

    return c.json({
      provider: result.provider,
      newCards: result.newCards,
      removedCards: result.removedCards,
      updates: result.updates,
      unchanged: result.unchanged,
      newPrintings: result.newPrintings,
      removedPrintings: result.removedPrintings,
      printingUpdates: result.printingUpdates,
      printingsUnchanged: result.printingsUnchanged,
      errors: result.errors,
      newCardDetails: result.newCardDetails,
      removedCardDetails: result.removedCardDetails,
      updatedCards: result.updatedCards,
      newPrintingDetails: result.newPrintingDetails,
      removedPrintingDetails: result.removedPrintingDetails,
      updatedPrintings: result.updatedPrintings,
    } satisfies CandidateCardUploadResponse);
  })

  // ── POST /by-provider/:provider/check ────────────────────────────────────
  // Mark all candidate_cards and candidate_printings for a given provider as checked
  .post("/by-provider/:provider/check", async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const provider = decodeURIComponent(c.req.param("provider"));
    if (!provider.trim()) {
      throw new AppError(400, "BAD_REQUEST", "Provider name is required");
    }

    const result = await mut.checkByProvider(provider.trim(), new Date());
    return c.json(result);
  })

  // ── DELETE /by-provider/:provider ─────────────────────────────────────────
  // Delete all candidate_cards (and cascaded candidate_printings) for a given provider name
  .delete("/by-provider/:provider", async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const provider = decodeURIComponent(c.req.param("provider"));
    if (!provider.trim()) {
      throw new AppError(400, "BAD_REQUEST", "Provider name is required");
    }

    const deleted = await mut.deleteByProvider(provider.trim());
    return c.json({ provider, deleted });
  });
