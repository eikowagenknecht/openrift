import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { CandidateCardUploadResponse, CardType, Domain, SuperType } from "@openrift/shared";
import { appendSetTotal, fixTypography } from "@openrift/shared";
import { extractKeywords } from "@openrift/shared/keywords";
import { normalizeNameForMatching } from "@openrift/shared/utils";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../../errors.js";
import { acceptFavoritePrintingsForCard } from "../../../services/accept-favorite-printings.js";
import { acceptFavoriteNewCard } from "../../../services/accept-gallery.js";
import {
  acceptPrinting,
  deletePrinting,
  updatePrintingDistributionChannels,
  updatePrintingMarkers,
} from "../../../services/printing-admin.js";
import { recordPrintingChangeEvent } from "../../../services/record-printing-event.js";
import type { Variables } from "../../../types.js";
import { assertDeleted, assertFound, assertUpdated } from "../../../utils/assertions.js";
import {
  acceptFieldSchema,
  acceptNewCardSchema,
  acceptPrintingSchema,
  cardFieldRules,
  checkAllCandidatePrintingsSchema,
  copyCandidatePrintingSchema,
  createCardSchema,
  createPrintingSchema,
  linkCandidatePrintingsSchema,
  linkUnmatchedSchema,
  patchCandidatePrintingSchema,
  printingFieldRules,
  renameSchema,
  uploadCandidatesSchema,
  uploadErrataSchema,
  upsertErrataSchema,
} from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const checkCandidateCard = createRoute({
  method: "post",
  path: "/{candidateCardId}/check",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ candidateCardId: z.string().uuid() }),
  },
  responses: {
    204: { description: "Candidate card checked" },
  },
});

const uncheckCandidateCard = createRoute({
  method: "post",
  path: "/{candidateCardId}/uncheck",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ candidateCardId: z.string().uuid() }),
  },
  responses: {
    204: { description: "Candidate card unchecked" },
  },
});

const checkAllCandidatePrintings = createRoute({
  method: "post",
  path: "/candidate-printings/check-all",
  tags: ["Admin - Cards"],
  request: {
    body: { content: { "application/json": { schema: checkAllCandidatePrintingsSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ updated: z.number().openapi({ example: 14 }) }),
        },
      },
      description: "All candidate printings checked",
    },
  },
});

const checkCandidatePrinting = createRoute({
  method: "post",
  path: "/candidate-printings/{id}/check",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: "Candidate printing checked" },
  },
});

const uncheckCandidatePrinting = createRoute({
  method: "post",
  path: "/candidate-printings/{id}/uncheck",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: "Candidate printing unchecked" },
  },
});

const checkAllForCard = createRoute({
  method: "post",
  path: "/{cardId}/check-all",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardId: z.string().uuid() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ updated: z.number().openapi({ example: 14 }) }),
        },
      },
      description: "All candidates for card checked",
    },
  },
});

const patchCandidatePrintingRoute = createRoute({
  method: "patch",
  path: "/candidate-printings/{id}",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: patchCandidatePrintingSchema } } },
  },
  responses: {
    204: { description: "Candidate printing updated" },
  },
});

const deleteCandidatePrinting = createRoute({
  method: "delete",
  path: "/candidate-printings/{id}",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: "Candidate printing deleted" },
  },
});

const copyCandidatePrintingRoute = createRoute({
  method: "post",
  path: "/candidate-printings/{id}/copy",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { "application/json": { schema: copyCandidatePrintingSchema } } },
  },
  responses: {
    204: { description: "Candidate printing copied" },
  },
});

const linkCandidatePrintingsRoute = createRoute({
  method: "post",
  path: "/candidate-printings/link",
  tags: ["Admin - Cards"],
  request: {
    body: { content: { "application/json": { schema: linkCandidatePrintingsSchema } } },
  },
  responses: {
    204: { description: "Candidate printings linked" },
  },
});

const renameCard = createRoute({
  method: "post",
  path: "/{cardId}/rename",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardId: z.string().uuid() }),
    body: { content: { "application/json": { schema: renameSchema } } },
  },
  responses: {
    204: { description: "Card renamed" },
  },
});

const acceptField = createRoute({
  method: "post",
  path: "/{cardId}/accept-field",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardId: z.string().uuid() }),
    body: { content: { "application/json": { schema: acceptFieldSchema } } },
  },
  responses: {
    204: { description: "Field accepted" },
  },
});

const acceptPrintingField = createRoute({
  method: "post",
  path: "/printing/{printingId}/accept-field",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ printingId: z.string().uuid() }),
    body: { content: { "application/json": { schema: acceptFieldSchema } } },
  },
  responses: {
    204: { description: "Printing field accepted" },
  },
});

const deletePrintingRoute = createRoute({
  method: "delete",
  path: "/printing/{printingId}",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ printingId: z.string().uuid() }),
  },
  responses: {
    204: { description: "Printing deleted" },
  },
});

const acceptNewCard = createRoute({
  method: "post",
  path: "/new/{name}/accept",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ name: z.string() }),
    body: { content: { "application/json": { schema: acceptNewCardSchema } } },
  },
  responses: {
    204: { description: "New card accepted" },
  },
});

const acceptFavoriteNewCardRoute = createRoute({
  method: "post",
  path: "/new/{name}/accept-favorites",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ name: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardSlug: z.string().openapi({ example: "jinx-rebel" }),
            printingsCreated: z.number().openapi({ example: 3 }),
          }),
        },
      },
      description: "New card accepted from favorite providers",
    },
  },
});

const acceptFavoritePrintings = createRoute({
  method: "post",
  path: "/{cardSlug}/accept-favorite-printings",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardSlug: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            printingsCreated: z.number().openapi({ example: 3 }),
            skipped: z.array(
              z.object({
                shortCode: z.string().openapi({ example: "OGN-202" }),
                reason: z.string().openapi({ example: "Printing already exists" }),
              }),
            ),
          }),
        },
      },
      description: "Favorite printings accepted",
    },
  },
});

const linkUnmatched = createRoute({
  method: "post",
  path: "/new/{name}/link",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ name: z.string() }),
    body: { content: { "application/json": { schema: linkUnmatchedSchema } } },
  },
  responses: {
    204: { description: "Unmatched candidates linked" },
  },
});

const acceptPrintingRoute = createRoute({
  method: "post",
  path: "/{cardId}/accept-printing",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardId: z.string().uuid() }),
    body: { content: { "application/json": { schema: acceptPrintingSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            printingId: z.string().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
          }),
        },
      },
      description: "Printing accepted",
    },
  },
});

const createCard = createRoute({
  method: "post",
  path: "/create",
  tags: ["Admin - Cards"],
  request: {
    body: { content: { "application/json": { schema: createCardSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardSlug: z.string().openapi({ example: "jinx-rebel" }),
          }),
        },
      },
      description: "Card created",
    },
  },
});

const createPrintingRoute = createRoute({
  method: "post",
  path: "/{cardId}/printings",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardId: z.string().uuid() }),
    body: { content: { "application/json": { schema: createPrintingSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            printingId: z.string().openapi({ example: "019cfc3b-03d3-7dac-86c9-27900cd43727" }),
          }),
        },
      },
      description: "Printing created",
    },
  },
});

const uploadCandidates = createRoute({
  method: "post",
  path: "/upload",
  tags: ["Admin - Cards"],
  request: {
    body: { content: { "application/json": { schema: uploadCandidatesSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            provider: z.string().openapi({ example: "riftcore" }),
            newCards: z.number().openapi({ example: 3 }),
            removedCards: z.number().openapi({ example: 0 }),
            updates: z.number().openapi({ example: 12 }),
            unchanged: z.number().openapi({ example: 297 }),
            newPrintings: z.number().openapi({ example: 5 }),
            removedPrintings: z.number().openapi({ example: 0 }),
            printingUpdates: z.number().openapi({ example: 18 }),
            printingsUnchanged: z.number().openapi({ example: 445 }),
            errors: z.array(z.string()).openapi({ example: [] }),
            newCardDetails: z.array(
              z.object({
                name: z.string().openapi({ example: "Jinx, Rebel" }),
                shortCode: z.string().nullable().openapi({ example: "OGN-202" }),
              }),
            ),
            removedCardDetails: z.array(
              z.object({
                name: z.string().openapi({ example: "Jinx, Rebel" }),
                shortCode: z.string().nullable().openapi({ example: "OGN-202" }),
              }),
            ),
            updatedCards: z.array(
              z.object({
                name: z.string().openapi({ example: "Jinx, Rebel" }),
                shortCode: z.string().nullable().openapi({ example: "OGN-202" }),
                fields: z.array(
                  z.object({
                    field: z.string().openapi({ example: "might" }),
                    from: z.unknown().openapi({ example: 4 }),
                    to: z.unknown().openapi({ example: 5 }),
                  }),
                ),
              }),
            ),
            newPrintingDetails: z.array(
              z.object({
                name: z.string().openapi({ example: "Jinx, Rebel" }),
                shortCode: z.string().nullable().openapi({ example: "OGN-202" }),
              }),
            ),
            removedPrintingDetails: z.array(
              z.object({
                name: z.string().openapi({ example: "Jinx, Rebel" }),
                shortCode: z.string().nullable().openapi({ example: "OGN-202" }),
              }),
            ),
            updatedPrintings: z.array(
              z.object({
                name: z.string().openapi({ example: "Jinx, Rebel" }),
                shortCode: z.string().nullable().openapi({ example: "OGN-202" }),
                fields: z.array(
                  z.object({
                    field: z.string().openapi({ example: "artist" }),
                    from: z.unknown().openapi({ example: "Unknown" }),
                    to: z.unknown().openapi({ example: "Kudos Productions" }),
                  }),
                ),
              }),
            ),
          }),
        },
      },
      description: "Candidates uploaded",
    },
  },
});

const checkByProvider = createRoute({
  method: "post",
  path: "/by-provider/{provider}/check",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ provider: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            cardsChecked: z.number().openapi({ example: 312 }),
            printingsChecked: z.number().openapi({ example: 468 }),
          }),
        },
      },
      description: "Provider candidates checked",
    },
  },
});

const deleteByProvider = createRoute({
  method: "delete",
  path: "/by-provider/{provider}",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ provider: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            provider: z.string().openapi({ example: "riftcore" }),
            deleted: z.number().openapi({ example: 312 }),
          }),
        },
      },
      description: "Provider candidates deleted",
    },
  },
});

const upsertErrata = createRoute({
  method: "post",
  path: "/{cardId}/errata",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardId: z.string().uuid() }),
    body: { content: { "application/json": { schema: upsertErrataSchema } } },
  },
  responses: {
    204: { description: "Errata upserted" },
  },
});

const deleteErrata = createRoute({
  method: "delete",
  path: "/{cardId}/errata",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ cardId: z.string().uuid() }),
  },
  responses: {
    204: { description: "Errata deleted" },
  },
});

const entryRefSchema = z.object({
  cardSlug: z.string().openapi({ example: "jinx-rebel" }),
  cardName: z.string().openapi({ example: "Jinx, Rebel" }),
});

const entryDiffSchema = entryRefSchema.extend({
  fields: z.array(
    z.object({
      field: z.string().openapi({ example: "correctedRulesText" }),
      from: z.unknown().openapi({ example: "Deal 3 damage." }),
      to: z.unknown().openapi({ example: "Deal 4 damage." }),
    }),
  ),
});

const uploadErrata = createRoute({
  method: "post",
  path: "/errata/upload",
  tags: ["Admin - Cards"],
  request: {
    body: { content: { "application/json": { schema: uploadErrataSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            dryRun: z.boolean().openapi({ example: true }),
            newCount: z.number().openapi({ example: 2 }),
            updatedCount: z.number().openapi({ example: 1 }),
            unchangedCount: z.number().openapi({ example: 0 }),
            matchesPrintedCount: z.number().openapi({ example: 0 }),
            errors: z.array(z.string()).openapi({ example: [] }),
            newEntries: z.array(entryRefSchema),
            updatedEntries: z.array(entryDiffSchema),
            skippedMatchesPrinted: z.array(entryRefSchema),
          }),
        },
      },
      description: "Errata imported (or previewed, if dryRun)",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const mutationsRoute = new OpenAPIHono<{ Variables: Variables }>()
  // ── POST /:candidateCardId/check ──────────────────────────────────────────────
  .openapi(checkCandidateCard, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { candidateCardId } = c.req.valid("param");

    const result = await mut.checkCandidateCard(candidateCardId);
    assertUpdated(result, "Candidate card not found");

    return c.body(null, 204);
  })

  // ── POST /:candidateCardId/uncheck ────────────────────────────────────────────
  .openapi(uncheckCandidateCard, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { candidateCardId } = c.req.valid("param");

    const result = await mut.uncheckCandidateCard(candidateCardId);
    assertUpdated(result, "Candidate card not found");

    return c.body(null, 204);
  })

  // ── POST /candidate-printings/check-all ─────────────────────────────────────
  // Mark all candidate_printings for a given printing as checked
  // NOTE: Must be registered before /:cardId/check-all to avoid
  // the :cardId wildcard matching "candidate-printings" as a card ID.
  .openapi(checkAllCandidatePrintings, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { printingId, extraIds } = c.req.valid("json");

    const updated = await mut.checkAllCandidatePrintings(printingId, extraIds);
    return c.json({ updated });
  })

  // ── POST /candidate-printings/:id/check ─────────────────────────────────────
  .openapi(checkCandidatePrinting, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { id } = c.req.valid("param");

    const result = await mut.checkCandidatePrinting(id);
    assertUpdated(result, "Candidate printing not found");

    return c.body(null, 204);
  })

  // ── POST /candidate-printings/:id/uncheck ─────────────────────────────────────
  .openapi(uncheckCandidatePrinting, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { id } = c.req.valid("param");

    const result = await mut.uncheckCandidatePrinting(id);
    assertUpdated(result, "Candidate printing not found");

    return c.body(null, 204);
  })

  // ── POST /:cardId/check-all ──────────────────────────────────────────────
  // Mark all candidate_cards for a given card as checked
  .openapi(checkAllForCard, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const cardId = c.req.valid("param").cardId;

    const card = await mut.getCardById(cardId);
    assertFound(card, "Card not found");

    const cardNormName = normalizeNameForMatching(card.name);
    const aliasRows = await mut.getCardAliases(card.id);
    const uniqueVariants = [...new Set([cardNormName, ...aliasRows.map((a) => a.normName)])];

    const updated = await mut.checkAllCandidateCards(uniqueVariants, card.id);
    return c.json({ updated });
  })

  // ── PATCH /candidate-printings/:id ───────────────────────────────────────────
  // Update differentiator fields on a candidate_printing (e.g. fix wrong art_variant)
  .openapi(patchCandidatePrintingRoute, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const allowedFields = [
      "artVariant",
      "isSigned",
      "markerSlugs",
      "finish",
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
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "No valid fields to update");
    }

    const result = await mut.patchCandidatePrinting(id, updates);
    assertUpdated(result, "Candidate printing not found");

    return c.body(null, 204);
  })

  // ── DELETE /candidate-printings/:id ──────────────────────────────────────
  .openapi(deleteCandidatePrinting, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { id } = c.req.valid("param");

    const result = await mut.deleteCandidatePrinting(id);
    assertDeleted(result, "Candidate printing not found");

    return c.body(null, 204);
  })

  // ── POST /candidate-printings/:id/copy ───────────────────────────────────
  // Duplicate a candidate_printing and link the copy to a different printing
  .openapi(copyCandidatePrintingRoute, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { id } = c.req.valid("param");
    const { printingId } = c.req.valid("json");

    if (!printingId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "printingId is required");
    }

    const ps = await mut.getCandidatePrintingById(id);
    assertFound(ps, "Candidate printing not found");

    const target = await mut.getPrintingDifferentiatorsById(printingId);
    assertFound(target, "Target printing not found");

    await mut.copyCandidatePrinting(ps, target);

    return c.body(null, 204);
  })

  // ── POST /candidate-printings/link ───────────────────────────────────────
  // Bulk-link (or unlink) candidate printings to a printing
  .openapi(linkCandidatePrintingsRoute, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const { candidatePrintingIds, printingId } = c.req.valid("json");

    if (!Array.isArray(candidatePrintingIds) || candidatePrintingIds.length === 0) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "candidatePrintingIds[] required");
    }

    await mut.linkCandidatePrintings(candidatePrintingIds, printingId);

    // Persist or remove link overrides so links survive delete + re-upload
    await (printingId
      ? mut.upsertPrintingLinkOverrides(candidatePrintingIds, printingId)
      : mut.removePrintingLinkOverrides(candidatePrintingIds));

    return c.body(null, 204);
  })

  // ── POST /:cardId/rename ──────────────────────────────────────────────────
  .openapi(renameCard, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const cardId = c.req.valid("param").cardId;
    const { newId } = c.req.valid("json");

    if (!newId?.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "newId is required");
    }

    const card = await mut.getCardById(cardId);
    assertFound(card, "Card not found");

    if (newId === card.slug) {
      return c.body(null, 204);
    }

    // UUID PK is immutable -- only the slug changes
    await mut.renameCardSlugById(card.id, newId.trim());

    return c.body(null, 204);
  })

  // ── POST /:cardId/accept-field ────────────────────────────────────────────
  .openapi(acceptField, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const cardId = c.req.valid("param").cardId;
    const { field, value } = c.req.valid("json");

    if (!field) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "field is required");
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
      "tags",
      "comment",
    ]);

    if (!allowedFields.has(field)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Invalid field: ${field}`);
    }

    // Normalize null to empty array for array-typed fields
    const arrayFields = new Set(["superTypes", "domains", "tags"]);
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

    const finalValue = normalized;

    // Domains and superTypes are stored in junction tables, not on the cards row
    if (field === "domains") {
      await mut.replaceCardDomainsById(cardId, finalValue as string[]);
      await c.get("repos").catalog.refreshCardAggregates();
      return c.body(null, 204);
    }
    if (field === "superTypes") {
      await mut.replaceCardSuperTypesById(cardId, finalValue as string[]);
      await c.get("repos").catalog.refreshCardAggregates();
      return c.body(null, 204);
    }

    const updates: Record<string, unknown> = { [field]: finalValue };

    try {
      await mut.updateCardById(cardId, updates);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "23503") {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Invalid value for ${field}: ${String(finalValue)}`,
        );
      }
      throw error;
    }

    return c.body(null, 204);
  })

  // ── POST /printing/:printingId/accept-field ──────────────────────────────
  .openapi(acceptPrintingField, async (c) => {
    const { candidateMutations: mut, printingEvents, rarities } = c.get("repos");
    const printingId = c.req.valid("param").printingId;
    const { field, value, source } = c.req.valid("json");

    if (!field) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "field is required");
    }

    const allowedFields = new Set([
      "shortCode",
      "setId",
      "rarity",
      "artVariant",
      "isSigned",
      "markerSlugs",
      "distributionChannelSlugs",
      "finish",
      "artist",
      "publicCode",
      "printedRulesText",
      "printedEffectText",
      "flavorText",
      "language",
      "printedName",
      "printedYear",
      "comment",
    ]);

    if (!allowedFields.has(field)) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, `Invalid field: ${field}`);
    }

    // Normalize enum fields that have DB check constraints (before validation
    // so that case-insensitive input like "common" is accepted)
    let normalizedValue = value;
    if (field === "rarity" && typeof value === "string") {
      const rarityRows = await rarities.listAll();
      const raritySlugs = rarityRows.map((row) => row.slug);
      normalizedValue =
        raritySlugs.find((slug) => slug.toLowerCase() === value.toLowerCase()) || value;
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
      normalizedValue = parsed.data;
    }

    // Read the printing before mutation so we can capture old values for change tracking
    const printingBefore = await mut.getFullPrintingById(printingId);
    assertFound(printingBefore, "Printing not found");

    // When markerSlugs changes, update via dedicated function (printing_markers
    // join is the source of truth; the trigger keeps printings.marker_slugs in sync).
    if (field === "markerSlugs") {
      const newSlugs = Array.isArray(normalizedValue)
        ? (normalizedValue as string[]).filter((s) => typeof s === "string")
        : [];
      await updatePrintingMarkers(c.get("transact"), printingId, newSlugs);

      const oldValue = [...printingBefore.markerSlugs].sort();
      const newValue = [...newSlugs].sort();
      if (oldValue.join(",") !== newValue.join(",")) {
        await recordPrintingChangeEvent(printingEvents, printingId, [
          { field: "markerSlugs", from: oldValue, to: newValue },
        ]);
      }

      return c.body(null, 204);
    }

    // Same pattern for distribution channels (rows in printing_distribution_channels).
    if (field === "distributionChannelSlugs") {
      const { candidateMutations, distributionChannels: channelsRepo } = c.get("repos");
      const newSlugs = Array.isArray(normalizedValue)
        ? (normalizedValue as string[]).filter((s) => typeof s === "string")
        : [];
      await updatePrintingDistributionChannels(
        { candidateMutations, distributionChannels: channelsRepo },
        printingId,
        newSlugs,
      );
      return c.body(null, 204);
    }

    // Apply typography fixes to text fields only when accepting from a provider
    if (source === "provider") {
      const printingTextFields = new Set(["printedRulesText", "printedEffectText"]);
      if (printingTextFields.has(field) && typeof normalizedValue === "string") {
        normalizedValue = fixTypography(normalizedValue);
      }
      if (field === "flavorText" && typeof normalizedValue === "string") {
        normalizedValue = fixTypography(normalizedValue, {
          italicParens: false,
          keywordGlyphs: false,
        });
      }
    }

    // Append set total to publicCode when accepting from a provider
    if (source === "provider" && field === "publicCode" && typeof normalizedValue === "string") {
      const setTotal = await mut.getSetPrintedTotalForPrinting(printingId);
      normalizedValue = appendSetTotal(normalizedValue, setTotal?.printedTotal);
    }

    // Candidate printings store setId as a slug; printings store it as a UUID FK
    if (field === "setId" && normalizedValue) {
      const { sets } = c.get("repos");
      const setRow = await sets.getBySlug(normalizedValue as string);
      assertFound(setRow, `Set not found: ${normalizedValue}`);
      normalizedValue = setRow.id;
    }

    try {
      await mut.updatePrintingFieldById(printingId, field, normalizedValue);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "23503") {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `Invalid value for ${field}: ${String(normalizedValue)}`,
        );
      }
      throw error;
    }

    // Recompute card-level keywords when printing text changes
    if (field === "printedRulesText" || field === "printedEffectText") {
      await mut.recomputeKeywordsForPrintingCard(printingId);
    }

    // Record change event
    const oldValue = printingBefore[field as keyof typeof printingBefore] ?? null;
    if (oldValue !== normalizedValue) {
      await recordPrintingChangeEvent(printingEvents, printingId, [
        { field, from: oldValue, to: normalizedValue },
      ]);
    }

    return c.body(null, 204);
  })

  // ── DELETE /printing/:printingId ─────────────────────────────────────────
  // Delete a printing and clean up all related data
  .openapi(deletePrintingRoute, async (c) => {
    const { candidateMutations } = c.get("repos");
    const printingId = c.req.valid("param").printingId;

    await deletePrinting(c.get("transact"), c.get("io"), { candidateMutations }, printingId);

    return c.body(null, 204);
  })

  // ── POST /new/:name/accept ────────────────────────────────────────────────
  // Create new card from candidate data and link candidate_cards
  .openapi(acceptNewCard, async (c) => {
    const normalizedName = decodeURIComponent(c.req.valid("param").name);
    const { cardFields } = c.req.valid("json");

    if (!cardFields) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "cardFields required");
    }

    await c.get("transact")(async (trxRepos) => {
      // FK constraints validate values at DB level — safe to cast from z.string()
      await trxRepos.candidateMutations.acceptNewCardFromSources(
        cardFields as typeof cardFields & {
          type: CardType;
          domains: Domain[];
          superTypes?: SuperType[];
        },
        normalizedName,
      );
    });

    await c.get("repos").catalog.refreshCardAggregates();

    return c.body(null, 204);
  })

  // ── POST /new/:name/accept-favorites ─────────────────────────────────────
  // Create card + printings from favorite-provider sources
  .openapi(acceptFavoriteNewCardRoute, async (c) => {
    const {
      candidateCards,
      candidateMutations,
      printingImages,
      markers,
      distributionChannels,
      providerSettings,
      printingEvents,
    } = c.get("repos");
    const normalizedName = decodeURIComponent(c.req.valid("param").name);
    const favoriteProviders = await providerSettings.favoriteProviders();

    const result = await acceptFavoriteNewCard(
      c.get("transact"),
      c.get("io"),
      {
        candidateCards,
        candidateMutations,
        printingImages,
        markers,
        distributionChannels,
        printingEvents,
      },
      normalizedName,
      favoriteProviders,
    );

    await c.get("repos").catalog.refreshCardAggregates();

    return c.json(result);
  })

  // ── POST /:cardSlug/accept-favorite-printings ─────────────────────────────
  // Accept all unlinked candidate printings from favorite providers for an existing card
  .openapi(acceptFavoritePrintings, async (c) => {
    const {
      candidateCards,
      candidateMutations,
      printingImages,
      markers,
      distributionChannels,
      providerSettings,
      printingEvents,
    } = c.get("repos");
    const cardSlug = c.req.valid("param").cardSlug;

    const favoriteProviders = await providerSettings.favoriteProviders();

    const result = await acceptFavoritePrintingsForCard(
      c.get("transact"),
      c.get("io"),
      {
        candidateCards,
        candidateMutations,
        printingImages,
        markers,
        distributionChannels,
        printingEvents,
      },
      cardSlug,
      favoriteProviders,
    );

    return c.json(result);
  })

  // ── POST /new/:name/link ──────────────────────────────────────────────────
  // Link unmatched candidates to an existing card
  .openapi(linkUnmatched, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const normalizedName = decodeURIComponent(c.req.valid("param").name);
    const { cardId } = c.req.valid("json");

    if (!cardId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "cardId required");
    }

    const card = await mut.getCardById(cardId);
    assertFound(card, "Target card not found");

    await c.get("transact")(async (trxRepos) => {
      await trxRepos.candidateMutations.createNameAliases(normalizedName, card.id);
    });

    return c.body(null, 204);
  })

  // ── POST /:cardId/accept-printing ─────────────────────────────────────────
  // Create a new printing from admin-selected fields, link all candidates in the group
  .openapi(acceptPrintingRoute, async (c) => {
    const { candidateMutations, printingImages, markers, distributionChannels, printingEvents } =
      c.get("repos");
    const cardId = c.req.valid("param").cardId;
    const { printingFields, candidatePrintingIds } = c.req.valid("json");

    const printingId = await acceptPrinting(
      c.get("transact"),
      { candidateMutations, printingImages, markers, distributionChannels, printingEvents },
      cardId,
      printingFields,
      candidatePrintingIds,
    );

    return c.json({ printingId });
  })

  // ── POST / ────────────────────────────────────────────────────────────────
  // Create a new card from scratch (no candidate sources)
  .openapi(createCard, async (c) => {
    const cardFields = c.req.valid("json");

    await c.get("transact")(async (trxRepos) => {
      await trxRepos.candidateMutations.acceptNewCardFromSources(
        cardFields as typeof cardFields & {
          type: CardType;
          domains: Domain[];
          superTypes?: SuperType[];
        },
        normalizeNameForMatching(cardFields.name),
      );
    });

    await c.get("repos").catalog.refreshCardAggregates();

    return c.json({ cardSlug: cardFields.id });
  })

  // ── POST /:cardId/printings ───────────────────────────────────────────────
  // Create a new printing from scratch (no candidate sources) for an existing card
  .openapi(createPrintingRoute, async (c) => {
    const { candidateMutations, printingImages, markers, distributionChannels, printingEvents } =
      c.get("repos");
    const cardId = c.req.valid("param").cardId;
    const printingFields = c.req.valid("json");

    const printingId = await acceptPrinting(
      c.get("transact"),
      { candidateMutations, printingImages, markers, distributionChannels, printingEvents },
      cardId,
      printingFields,
      [],
    );

    return c.json({ printingId });
  })

  // ── POST /upload ──────────────────────────────────────────────────────────
  .openapi(uploadCandidates, async (c) => {
    const { provider, candidates: cards } = c.req.valid("json");

    const { ingestCandidates } = c.get("services");
    const result = await ingestCandidates(c.get("transact"), provider.trim(), cards);

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
  .openapi(checkByProvider, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const provider = decodeURIComponent(c.req.valid("param").provider);
    if (!provider.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Provider name is required");
    }

    const result = await mut.checkByProvider(provider.trim(), new Date());
    return c.json(result);
  })

  // ── DELETE /by-provider/:provider ─────────────────────────────────────────
  // Delete all candidate_cards (and cascaded candidate_printings) for a given provider name
  .openapi(deleteByProvider, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const provider = decodeURIComponent(c.req.valid("param").provider);
    if (!provider.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Provider name is required");
    }

    const deleted = await mut.deleteByProvider(provider.trim());
    return c.json({ provider, deleted });
  })

  // ── POST /:cardId/errata ─────────────────────────────────────────────────
  // Upsert card errata (corrected rules/effect text from official errata)
  .openapi(upsertErrata, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const cardId = c.req.valid("param").cardId;
    const body = c.req.valid("json");

    await mut.upsertCardErrata(cardId, {
      correctedRulesText: body.correctedRulesText,
      correctedEffectText: body.correctedEffectText,
      source: body.source,
      sourceUrl: body.sourceUrl,
      effectiveDate: body.effectiveDate,
    });

    // Recompute keywords to include errata text
    const printingTexts = await mut.getPrintingTextsForCardId(cardId);
    const keywords = [
      ...extractKeywords(body.correctedRulesText ?? ""),
      ...extractKeywords(body.correctedEffectText ?? ""),
      ...printingTexts.flatMap((pt) => [
        ...extractKeywords(pt.printedRulesText ?? ""),
        ...extractKeywords(pt.printedEffectText ?? ""),
      ]),
    ].filter((v, i, a) => a.indexOf(v) === i);

    await mut.updateCardById(cardId, { keywords });

    return c.body(null, 204);
  })

  // ── DELETE /:cardId/errata ────────────────────────────────────────────────
  // Delete card errata and recompute keywords
  .openapi(deleteErrata, async (c) => {
    const { candidateMutations: mut } = c.get("repos");
    const cardId = c.req.valid("param").cardId;

    await mut.deleteCardErrata(cardId);

    // Recompute keywords from printing text only (no errata anymore)
    const printingTexts = await mut.getPrintingTextsForCardId(cardId);
    const keywords = printingTexts
      .flatMap((pt) => [
        ...extractKeywords(pt.printedRulesText ?? ""),
        ...extractKeywords(pt.printedEffectText ?? ""),
      ])
      .filter((v, i, a) => a.indexOf(v) === i);

    await mut.updateCardById(cardId, { keywords });

    return c.body(null, 204);
  })

  // ── POST /errata/upload ────────────────────────────────────────────────────
  // Bulk upsert card errata from a JSON payload. Set dryRun=true to preview.
  .openapi(uploadErrata, async (c) => {
    const { dryRun, entries } = c.req.valid("json");
    const { importErrata } = c.get("services");
    const result = await importErrata(c.get("transact"), { entries, dryRun });
    return c.json(result);
  });
