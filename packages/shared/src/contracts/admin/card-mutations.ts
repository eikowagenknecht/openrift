import {
  cardFieldRules,
  candidateCardFieldRules,
  candidatePrintingFieldRules,
  printingFieldRules,
} from "@openrift/shared/db-field-rules";
import { diffValueSchema } from "@openrift/shared/response-schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Cards";

const CARDS = "/api/admin/v1/cards";

const candidateCardIdParam = z.object({ candidateCardId: z.uuid() });
const cardIdParam = z.object({ cardId: z.uuid() });
const cpIdParam = z.object({ id: z.uuid() });
const printingIdParam = z.object({ printingId: z.uuid() });
const providerParam = z.object({ provider: z.string() });

const updatedCountOutput = z.object({ updated: z.number() });

// Mirrors the API-only `cardErrataFieldRules` (apps/api db/schemas) — the
// `card_errata` table lives outside `@openrift/shared/db-field-rules`.
const cardErrataFieldRules = {
  correctedRulesText: z.string().min(1).nullable(),
  correctedEffectText: z.string().min(1).nullable(),
  source: z.string().min(1),
  sourceUrl: z.string().min(1).nullable(),
  effectiveDate: z.string().nullable(),
};

const uploadErrataEntrySchema = z
  .object({
    cardSlug: cardFieldRules.slug,
    correctedRulesText: cardErrataFieldRules.correctedRulesText.optional().default(null),
    correctedEffectText: cardErrataFieldRules.correctedEffectText.optional().default(null),
    source: cardErrataFieldRules.source,
    sourceUrl: cardErrataFieldRules.sourceUrl.optional().default(null),
    effectiveDate: cardErrataFieldRules.effectiveDate.optional().default(null),
  })
  .refine((entry) => entry.correctedRulesText !== null || entry.correctedEffectText !== null, {
    message: "At least one of correctedRulesText or correctedEffectText must be provided",
  });

const entryRefSchema = z.object({ cardSlug: z.string(), cardName: z.string() });
const entryDiffSchema = z.object({
  cardSlug: z.string(),
  cardName: z.string(),
  fields: z.array(
    z.object({ field: z.string(), from: z.string().nullable(), to: z.string().nullable() }),
  ),
});

// Mirrors `patchCandidatePrintingSchema` (apps/api cards/schemas); the
// differentiator fields admins can correct on a candidate printing.
const patchCandidatePrintingFields = {
  artVariant: candidatePrintingFieldRules.artVariant.optional(),
  isSigned: z.boolean().optional(),
  finish: candidatePrintingFieldRules.finish.optional(),
  setId: candidatePrintingFieldRules.setId.optional(),
  shortCode: candidatePrintingFieldRules.shortCode.optional(),
  rarity: candidatePrintingFieldRules.rarity.optional(),
};

/** The PATCH body (differentiator fields, no path param) — consumed by the web admin editor. */
export type PatchCandidatePrintingBody = z.infer<z.ZodObject<typeof patchCandidatePrintingFields>>;

// accept-field bodies. `value` stays `unknown` on the wire; the API validates
// it per-field against {card,printing}FieldRules at runtime. The `field` enums
// ARE the allowlist of writable columns (mirrors apps/api cards/schemas).
const acceptCardFieldBodySchema = z.object({
  field: z.enum([
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
  ]),
  value: z.unknown(),
  source: z.enum(["provider", "manual"]).default("manual"),
});

const acceptPrintingFieldBodySchema = z.object({
  field: z.enum([
    "shortCode",
    "setId",
    "rarity",
    "artVariant",
    "isSigned",
    "markerSlugs",
    "distributionChannelSlugs",
    "finish",
    "size",
    "artist",
    "publicCode",
    "printedRulesText",
    "printedEffectText",
    "flavorText",
    "language",
    "printedName",
    "printedYear",
    "comment",
  ]),
  value: z.unknown(),
  source: z.enum(["provider", "manual"]).default("manual"),
});

/** accept-field request bodies (no path param) — consumed by the web admin field editor. */
export type AcceptCardFieldBody = z.infer<typeof acceptCardFieldBodySchema>;
export type AcceptPrintingFieldBody = z.infer<typeof acceptPrintingFieldBodySchema>;

// ── Create / accept composite schemas (mirror apps/api cards/schemas) ────────
// `setFieldRules` lives in apps/api (only the API touches the `sets` table);
// the two fields these schemas reference are mirrored inline.
const setSlug = z.string().min(1);
const setName = z.string().min(1);

const cardFieldsSchema = z.object({
  id: cardFieldRules.slug,
  name: cardFieldRules.name,
  type: cardFieldRules.type,
  superTypes: cardFieldRules.superTypes.optional(),
  domains: cardFieldRules.domains,
  might: cardFieldRules.might.optional(),
  energy: cardFieldRules.energy.optional(),
  power: cardFieldRules.power.optional(),
  mightBonus: cardFieldRules.mightBonus.optional(),
  tags: cardFieldRules.tags.optional(),
});

// Flat printing fields for `createPrinting` (setId required, no `id`).
const createPrintingFieldsSchema = z.object({
  shortCode: printingFieldRules.shortCode,
  setId: setSlug,
  setName: setName.optional().nullable(),
  rarity: printingFieldRules.rarity.optional().nullable(),
  artVariant: printingFieldRules.artVariant.optional(),
  isSigned: z.boolean().optional(),
  markerSlugs: z.array(z.string().min(1)).optional().default([]),
  distributionChannelSlugs: z.array(z.string().min(1)).optional().default([]),
  finish: printingFieldRules.finish.optional(),
  size: printingFieldRules.size.optional(),
  artist: printingFieldRules.artist,
  publicCode: printingFieldRules.publicCode,
  printedRulesText: printingFieldRules.printedRulesText.optional(),
  printedEffectText: printingFieldRules.printedEffectText.optional(),
  flavorText: printingFieldRules.flavorText.optional(),
  imageUrl: candidatePrintingFieldRules.imageUrl.optional(),
  language: z.string().min(1).max(5).optional(),
  printedName: z.string().min(1).optional().nullable(),
  printedYear: printingFieldRules.printedYear.optional(),
});

// `acceptPrinting` adds an optional `id` and relaxes setId to optional.
const acceptPrintingFieldsSchema = createPrintingFieldsSchema.extend({
  id: z.string().optional(),
  setId: setSlug.optional(),
});

const skippedPrintingSchema = z.object({ shortCode: z.string(), reason: z.string() });

// ── Candidate upload (ingest) schemas (mirror apps/api cards/schemas) ────────
// Coerce incoming JSON into typed shapes; value constraints are checked per-card
// in the ingest service so individual bad cards skip gracefully.
const nullStr = z.string().nullable().optional().default(null);

const ingestPrintingSchema = z.object({
  short_code: z.string(),
  set_id: nullStr,
  set_name: nullStr,
  rarity: nullStr,
  art_variant: nullStr,
  is_signed: z.boolean().optional().default(false),
  marker_slugs: z.array(z.string().min(1)).optional().default([]),
  distribution_channel_slugs: z.array(z.string().min(1)).optional().default([]),
  finish: nullStr,
  artist: nullStr,
  public_code: nullStr,
  printed_rules_text: nullStr,
  printed_effect_text: nullStr,
  image_url: nullStr,
  flavor_text: nullStr,
  external_id: z.string(),
  extra_data: z.unknown().nullable().optional().default(null),
  language: nullStr,
  printed_name: nullStr,
});

const ingestCardFieldsSchema = z.object({
  name: candidateCardFieldRules.name,
  type: candidateCardFieldRules.type.optional().default(null),
  super_types: z.array(z.string()).optional().default([]),
  domains: z.array(z.string()).optional().default([]),
  might: candidateCardFieldRules.might.optional().default(null),
  energy: candidateCardFieldRules.energy.optional().default(null),
  power: candidateCardFieldRules.power.optional().default(null),
  might_bonus: candidateCardFieldRules.mightBonus.optional().default(null),
  rules_text: candidateCardFieldRules.rulesText.optional().default(null),
  effect_text: candidateCardFieldRules.effectText.optional().default(null),
  tags: z.array(z.string()).optional().default([]),
  short_code: candidateCardFieldRules.shortCode.optional().default(null),
  external_id: candidateCardFieldRules.externalId,
  extra_data: candidateCardFieldRules.extraData.optional().default(null),
});

const uploadCandidatesSchema = z.object({
  provider: z.string().min(1),
  candidates: z
    .array(
      z
        .object({ card: ingestCardFieldsSchema, printings: z.array(ingestPrintingSchema) })
        .transform(({ card, printings }) => ({ ...card, printings })),
    )
    .min(1),
});

/** Pre-transform upload body (the raw `{ card, printings }[]` shape the web uploads). */
export type UploadCandidatesBody = z.input<typeof uploadCandidatesSchema>;

const uploadDetailSchema = z.object({ name: z.string(), shortCode: z.string().nullable() });
const uploadDiffSchema = uploadDetailSchema.extend({
  fields: z.array(z.object({ field: z.string(), from: diffValueSchema, to: diffValueSchema })),
});
const uploadCandidatesResponseSchema = z.object({
  provider: z.string(),
  newCards: z.number(),
  removedCards: z.number(),
  updates: z.number(),
  unchanged: z.number(),
  newPrintings: z.number(),
  removedPrintings: z.number(),
  printingUpdates: z.number(),
  printingsUnchanged: z.number(),
  errors: z.array(z.string()),
  newCardDetails: z.array(uploadDetailSchema),
  removedCardDetails: z.array(uploadDetailSchema),
  updatedCards: z.array(uploadDiffSchema),
  newPrintingDetails: z.array(uploadDetailSchema),
  removedPrintingDetails: z.array(uploadDetailSchema),
  updatedPrintings: z.array(uploadDiffSchema),
});

/** Upload ingest summary. */
export type UploadCandidatesResponse = z.infer<typeof uploadCandidatesResponseSchema>;

/** Create / accept request bodies — consumed by the web admin card editor. */
export type CreateCardBody = z.infer<typeof cardFieldsSchema>;
export type CreatePrintingBody = z.infer<typeof createPrintingFieldsSchema>;
export interface AcceptNewCardBody {
  cardFields: CreateCardBody;
}
export interface AcceptPrintingBody {
  printingFields: z.infer<typeof acceptPrintingFieldsSchema>;
  candidatePrintingIds: string[];
}

/**
 * oRPC contract for the bespoke admin card mutations (mounted under
 * `/api/admin/v1/cards`, admin-gated by the mount). Migrated incrementally off
 * the chained `@hono/zod-openapi` `mutationsRoute`; this first slice covers the
 * candidate check/uncheck verbs and the candidate-printing operations. Body
 * fields ride alongside any `{...}` path param (oRPC compact input). Domain
 * codes per route: check/uncheck/delete verbs → NOT_FOUND; patch/copy/link/
 * rename/checkByProvider/deleteByProvider/deletePrinting verbs → BAD_REQUEST
 * (and NOT_FOUND for entity lookups); `acceptPrinting` / `createPrinting` →
 * BAD_REQUEST + NOT_FOUND + CONFLICT; `acceptPrintingField` → NOT_FOUND;
 * `acceptFavoritePrintings` → NOT_FOUND.
 */
export const adminCardMutationsContract = {
  checkCandidateCard: authedRoute
    .route({
      method: "POST",
      path: `${CARDS}/{candidateCardId}/check`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Candidate card not found" } })
    .input(candidateCardIdParam),
  uncheckCandidateCard: authedRoute
    .route({
      method: "POST",
      path: `${CARDS}/{candidateCardId}/uncheck`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Candidate card not found" } })
    .input(candidateCardIdParam),
  checkAllCandidatePrintings: authedRoute
    .route({ method: "POST", path: `${CARDS}/candidate-printings/check-all`, tags: [TAG] })
    .input(
      z.object({
        printingId: z.string().optional(),
        extraIds: z.array(z.string()).optional(),
      }),
    )
    .output(updatedCountOutput),
  checkCandidatePrinting: authedRoute
    .route({
      method: "POST",
      path: `${CARDS}/candidate-printings/{id}/check`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Candidate printing not found" } })
    .input(cpIdParam),
  uncheckCandidatePrinting: authedRoute
    .route({
      method: "POST",
      path: `${CARDS}/candidate-printings/{id}/uncheck`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Candidate printing not found" } })
    .input(cpIdParam),
  checkAllForCard: authedRoute
    .route({ method: "POST", path: `${CARDS}/{cardId}/check-all`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Card not found" } })
    .input(cardIdParam)
    .output(updatedCountOutput),
  patchCandidatePrinting: authedRoute
    .route({
      method: "PATCH",
      path: `${CARDS}/candidate-printings/{id}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Candidate printing not found" },
      BAD_REQUEST: { message: "No valid fields to update" },
    })
    .input(cpIdParam.extend(patchCandidatePrintingFields)),
  deleteCandidatePrinting: authedRoute
    .route({
      method: "DELETE",
      path: `${CARDS}/candidate-printings/{id}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Candidate printing not found" } })
    .input(cpIdParam),
  copyCandidatePrinting: authedRoute
    .route({
      method: "POST",
      path: `${CARDS}/candidate-printings/{id}/copy`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Candidate printing or target printing not found" },
      BAD_REQUEST: { message: "Target printing ID is required" },
    })
    .input(cpIdParam.extend({ printingId: z.string() })),
  linkCandidatePrintings: authedRoute
    .route({
      method: "POST",
      path: `${CARDS}/candidate-printings/link`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ BAD_REQUEST: { message: "At least one candidate printing ID is required" } })
    .input(
      z.object({
        candidatePrintingIds: z.array(z.string()),
        printingId: z.string().nullable(),
      }),
    ),
  renameCard: authedRoute
    .route({ method: "POST", path: `${CARDS}/{cardId}/rename`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Card not found" },
      BAD_REQUEST: { message: "New card ID is required" },
    })
    .input(cardIdParam.extend({ newId: z.string() })),
  deletePrinting: authedRoute
    .route({
      method: "DELETE",
      path: `${CARDS}/printing/{printingId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Printing not found" },
      BAD_REQUEST: { message: "Printing cannot be deleted" },
    })
    .input(printingIdParam),
  checkByProvider: authedRoute
    .route({ method: "POST", path: `${CARDS}/by-provider/{provider}/check`, tags: [TAG] })
    .errors({ BAD_REQUEST: { message: "Provider name is required" } })
    .input(providerParam)
    .output(z.object({ cardsChecked: z.number(), printingsChecked: z.number() })),
  deleteByProvider: authedRoute
    .route({ method: "DELETE", path: `${CARDS}/by-provider/{provider}`, tags: [TAG] })
    .errors({ BAD_REQUEST: { message: "Provider name is required" } })
    .input(providerParam)
    .output(z.object({ provider: z.string(), deleted: z.number() })),
  upsertErrata: authedRoute
    .route({ method: "POST", path: `${CARDS}/{cardId}/errata`, tags: [TAG], successStatus: 204 })
    .input(
      cardIdParam.extend({
        correctedRulesText: cardErrataFieldRules.correctedRulesText,
        correctedEffectText: cardErrataFieldRules.correctedEffectText,
        source: cardErrataFieldRules.source,
        sourceUrl: cardErrataFieldRules.sourceUrl.optional().default(null),
        effectiveDate: cardErrataFieldRules.effectiveDate.optional().default(null),
      }),
    ),
  deleteErrata: authedRoute
    .route({ method: "DELETE", path: `${CARDS}/{cardId}/errata`, tags: [TAG], successStatus: 204 })
    .input(cardIdParam),
  acceptField: authedRoute
    .route({
      method: "POST",
      path: `${CARDS}/{cardId}/accept-field`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(cardIdParam.extend(acceptCardFieldBodySchema.shape)),
  acceptPrintingField: authedRoute
    .route({
      method: "POST",
      path: `${CARDS}/printing/{printingId}/accept-field`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Printing or set not found" } })
    .input(printingIdParam.extend(acceptPrintingFieldBodySchema.shape)),
  uploadErrata: authedRoute
    .route({ method: "POST", path: `${CARDS}/errata/upload`, tags: [TAG] })
    .input(
      z.object({
        dryRun: z.boolean().optional().default(false),
        entries: z.array(uploadErrataEntrySchema).min(1),
      }),
    )
    .output(
      z.object({
        dryRun: z.boolean(),
        newCount: z.number(),
        updatedCount: z.number(),
        unchangedCount: z.number(),
        matchesPrintedCount: z.number(),
        errors: z.array(z.string()),
        newEntries: z.array(entryRefSchema),
        updatedEntries: z.array(entryDiffSchema),
        skippedMatchesPrinted: z.array(entryRefSchema),
      }),
    ),
  acceptNewCard: authedRoute
    .route({ method: "POST", path: `${CARDS}/new/{name}/accept`, tags: [TAG], successStatus: 204 })
    .input(z.object({ name: z.string(), cardFields: cardFieldsSchema })),
  acceptFavoriteNewCard: authedRoute
    .route({ method: "POST", path: `${CARDS}/new/{name}/accept-favorites`, tags: [TAG] })
    .input(z.object({ name: z.string() }))
    .output(z.object({ cardSlug: z.string(), printingsCreated: z.number() })),
  acceptFavoritePrintings: authedRoute
    .route({ method: "POST", path: `${CARDS}/{cardSlug}/accept-favorite-printings`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Card not found" } })
    .input(z.object({ cardSlug: z.string() }))
    .output(z.object({ printingsCreated: z.number(), skipped: z.array(skippedPrintingSchema) })),
  linkUnmatched: authedRoute
    .route({ method: "POST", path: `${CARDS}/new/{name}/link`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Target card not found" },
      BAD_REQUEST: { message: "Card ID is required" },
    })
    .input(z.object({ name: z.string(), cardId: z.string() })),
  acceptPrinting: authedRoute
    .route({ method: "POST", path: `${CARDS}/{cardId}/accept-printing`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Card or printing not found" },
      BAD_REQUEST: { message: "Invalid printing fields" },
      CONFLICT: { message: "Printing already exists" },
    })
    .input(
      cardIdParam.extend({
        printingFields: acceptPrintingFieldsSchema,
        candidatePrintingIds: z.array(z.string()),
      }),
    )
    .output(z.object({ printingId: z.string() })),
  createCard: authedRoute
    .route({ method: "POST", path: `${CARDS}/create`, tags: [TAG] })
    .input(cardFieldsSchema)
    .output(z.object({ cardSlug: z.string() })),
  createPrinting: authedRoute
    .route({ method: "POST", path: `${CARDS}/{cardId}/printings`, tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Card or set not found" },
      BAD_REQUEST: { message: "Invalid printing fields" },
      CONFLICT: { message: "Printing already exists" },
    })
    .input(cardIdParam.extend(createPrintingFieldsSchema.shape))
    .output(z.object({ printingId: z.string() })),
  upload: authedRoute
    .route({ method: "POST", path: `${CARDS}/upload`, tags: [TAG] })
    .input(uploadCandidatesSchema)
    .output(uploadCandidatesResponseSchema),
};

export type AdminCardMutationsContract = typeof adminCardMutationsContract;
