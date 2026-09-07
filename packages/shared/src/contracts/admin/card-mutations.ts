import {
  cardErrataFieldRules,
  cardFieldRules,
  candidateCardFieldRules,
  candidatePrintingFieldRules,
  printingFieldRules,
  setFieldRules,
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

export const uploadErrataEntrySchema = z
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

export type UploadErrataEntry = z.infer<typeof uploadErrataEntrySchema>;

const entryRefSchema = z.object({ cardSlug: z.string(), cardName: z.string() });
export type ErrataEntryRef = z.infer<typeof entryRefSchema>;

const entryDiffSchema = z.object({
  cardSlug: z.string(),
  cardName: z.string(),
  fields: z.array(
    z.object({ field: z.string(), from: z.string().nullable(), to: z.string().nullable() }),
  ),
});
export type ErrataEntryDiff = z.infer<typeof entryDiffSchema>;

export const uploadErrataResponseSchema = z.object({
  dryRun: z.boolean(),
  newCount: z.number(),
  updatedCount: z.number(),
  unchangedCount: z.number(),
  matchesPrintedCount: z.number(),
  errors: z.array(z.string()),
  newEntries: z.array(entryRefSchema),
  updatedEntries: z.array(entryDiffSchema),
  skippedMatchesPrinted: z.array(entryRefSchema),
});
export type UploadErrataResponse = z.infer<typeof uploadErrataResponseSchema>;

const patchCandidatePrintingFields = {
  artVariant: candidatePrintingFieldRules.artVariant.optional(),
  isSigned: z.boolean().optional(),
  isOvernumbered: z.boolean().optional(),
  finish: candidatePrintingFieldRules.finish.optional(),
  setId: candidatePrintingFieldRules.setId.optional(),
  shortCode: candidatePrintingFieldRules.shortCode.optional(),
  rarity: candidatePrintingFieldRules.rarity.optional(),
};

export type PatchCandidatePrintingBody = z.infer<z.ZodObject<typeof patchCandidatePrintingFields>>;

// `value` stays `unknown` on the wire; the API validates it per-field against
// {card,printing}FieldRules at runtime.
export const ACCEPT_CARD_FIELDS = [
  "name",
  "types",
  "superTypes",
  "domains",
  "might",
  "energy",
  "power",
  "mightBonus",
  "tags",
  "maxCopiesOverride",
  "comment",
] as const;

export const ACCEPT_PRINTING_FIELDS = [
  "shortCode",
  "setId",
  "rarity",
  "artVariant",
  "isSigned",
  "isOvernumbered",
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
] as const;

const acceptCardFieldBodySchema = z.object({
  field: z.enum(ACCEPT_CARD_FIELDS),
  value: z.unknown(),
  source: z.enum(["provider", "manual"]).default("manual"),
});

const acceptPrintingFieldBodySchema = z.object({
  field: z.enum(ACCEPT_PRINTING_FIELDS),
  value: z.unknown(),
  source: z.enum(["provider", "manual"]).default("manual"),
});

export type AcceptCardFieldBody = z.infer<typeof acceptCardFieldBodySchema>;
export type AcceptPrintingFieldBody = z.infer<typeof acceptPrintingFieldBodySchema>;

export type AcceptCardField = AcceptCardFieldBody["field"];
export type AcceptPrintingField = AcceptPrintingFieldBody["field"];

const acceptCardFieldSet: ReadonlySet<string> = new Set(ACCEPT_CARD_FIELDS);
const acceptPrintingFieldSet: ReadonlySet<string> = new Set(ACCEPT_PRINTING_FIELDS);

export function isAcceptCardField(key: string): key is AcceptCardField {
  return acceptCardFieldSet.has(key);
}

export function isAcceptPrintingField(key: string): key is AcceptPrintingField {
  return acceptPrintingFieldSet.has(key);
}

export const cardFieldsSchema = z.object({
  id: cardFieldRules.slug,
  name: cardFieldRules.name,
  types: cardFieldRules.types,
  superTypes: cardFieldRules.superTypes.optional(),
  domains: cardFieldRules.domains,
  might: cardFieldRules.might.optional(),
  energy: cardFieldRules.energy.optional(),
  power: cardFieldRules.power.optional(),
  mightBonus: cardFieldRules.mightBonus.optional(),
  tags: cardFieldRules.tags.optional(),
});

const createPrintingFieldsSchema = z.object({
  shortCode: printingFieldRules.shortCode,
  setId: setFieldRules.slug,
  setName: setFieldRules.name.optional().nullable(),
  rarity: printingFieldRules.rarity.optional().nullable(),
  artVariant: printingFieldRules.artVariant.optional(),
  isSigned: z.boolean().optional(),
  isOvernumbered: z.boolean().optional(),
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
  language: printingFieldRules.language.optional(),
  printedName: z.string().min(1).optional().nullable(),
  printedYear: printingFieldRules.printedYear.optional(),
});

const acceptPrintingFieldsSchema = createPrintingFieldsSchema.extend({
  id: z.string().optional(),
  setId: setFieldRules.slug.optional(),
});

const skippedPrintingSchema = z.object({ shortCode: z.string(), reason: z.string() });

// Value constraints are checked per-card in the ingest service so individual
// bad cards skip gracefully.
const nullStr = z.string().nullable().optional().default(null);

export const ingestPrintingSchema = z.object({
  short_code: z.string(),
  set_id: nullStr,
  set_name: nullStr,
  rarity: nullStr,
  art_variant: nullStr,
  is_signed: z.boolean().optional().default(false),
  is_overnumbered: z.boolean().optional().default(false),
  marker_slugs: z.array(z.string().min(1)).optional().default([]),
  distribution_channel_slugs: z.array(z.string().min(1)).optional().default([]),
  finish: nullStr,
  size: nullStr,
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
  // `printings.printed_year` is a smallint; an out-of-range value would
  // otherwise only surface as an opaque insert error.
  printed_year: printingFieldRules.printedYear.optional().default(null),
});

const ingestCardFieldsObject = z.object({
  name: candidateCardFieldRules.name,
  types: candidateCardFieldRules.types.optional().default([]),
  // Legacy single-type wire field from older scraper exports; folded into
  // `types` by the transform below.
  type: z.string().min(1).nullable().optional().default(null),
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

export const ingestCardFieldsSchema = ingestCardFieldsObject.transform(({ type, ...rest }) => ({
  ...rest,
  types: rest.types.length > 0 ? rest.types : type === null ? [] : [type],
}));

/** Snake_case wire shape. */
export type IngestPrinting = z.infer<typeof ingestPrintingSchema>;
export type IngestCard = z.infer<typeof ingestCardFieldsSchema> & {
  printings: IngestPrinting[];
};

export const uploadCandidatesSchema = z.object({
  provider: z.string().min(1),
  candidates: z
    .array(
      z
        .object({ card: ingestCardFieldsSchema, printings: z.array(ingestPrintingSchema) })
        .transform(({ card, printings }) => ({ ...card, printings })),
    )
    .min(1),
});

export type UploadCandidatesBody = z.input<typeof uploadCandidatesSchema>;

// Kept in sync with `uploadCandidatesSchema` by a round-trip integration test.
// `comment` is a curator note and deliberately does not round-trip.
const candidateExportCardSchema = z.object({
  name: z.string(),
  types: z.array(z.string()),
  super_types: z.array(z.string()),
  domains: z.array(z.string()),
  might: z.number().nullable(),
  energy: z.number().nullable(),
  power: z.number().nullable(),
  might_bonus: z.number().nullable(),
  rules_text: z.string().nullable(),
  effect_text: z.string().nullable(),
  tags: z.array(z.string()),
  short_code: z.string().nullable(),
  external_id: z.string(),
  extra_data: z.unknown().nullable(),
  comment: z.string().nullable(),
});

const candidateExportPrintingSchema = z.object({
  short_code: z.string(),
  set_id: z.string().nullable(),
  set_name: z.string().nullable(),
  rarity: z.string().nullable(),
  art_variant: z.string().nullable(),
  is_signed: z.boolean(),
  is_overnumbered: z.boolean(),
  finish: z.string().nullable(),
  artist: z.string().nullable(),
  public_code: z.string().nullable(),
  printed_rules_text: z.string().nullable(),
  printed_effect_text: z.string().nullable(),
  image_url: z.string().nullable(),
  flavor_text: z.string().nullable(),
  external_id: z.string(),
  extra_data: z.unknown().nullable(),
  language: z.string().nullable(),
  printed_name: z.string().nullable(),
  printed_year: z.number().nullable(),
  marker_slugs: z.array(z.string()).optional(),
  distribution_channel_slugs: z.array(z.string()).optional(),
  size: z.string().optional(),
  comment: z.string().nullable(),
});

export const candidateExportDocumentSchema = z.array(
  z.object({
    card: candidateExportCardSchema,
    printings: z.array(candidateExportPrintingSchema),
  }),
);

const uploadDetailSchema = z.object({ name: z.string(), shortCode: z.string().nullable() });
const uploadDiffSchema = uploadDetailSchema.extend({
  fields: z.array(z.object({ field: z.string(), from: diffValueSchema, to: diffValueSchema })),
});
export const uploadCandidatesResponseSchema = z.object({
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

export type UploadCandidatesResponse = z.infer<typeof uploadCandidatesResponseSchema>;

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
 * oRPC contract for the admin card mutations (mounted under
 * `/api/admin/v1/cards`, admin-gated by the mount). Body fields ride alongside
 * any `{...}` path param (oRPC compact input).
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
  relinkCandidatePrintings: authedRoute
    .route({
      method: "POST",
      path: `${CARDS}/candidate-printings/relink`,
      tags: [TAG],
    })
    .output(z.object({ examined: z.number(), linked: z.number() })),
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
  deleteCard: authedRoute
    .route({
      method: "DELETE",
      path: `${CARDS}/{cardId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Card not found" },
      CONFLICT: { message: "Card is still referenced and cannot be deleted" },
    })
    .input(cardIdParam),
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
    .output(uploadErrataResponseSchema),
  acceptNewCard: authedRoute
    .route({ method: "POST", path: `${CARDS}/new/{name}/accept`, tags: [TAG], successStatus: 204 })
    .input(z.object({ name: z.string(), cardFields: cardFieldsSchema })),
  acceptFavoriteNewCard: authedRoute
    .route({ method: "POST", path: `${CARDS}/new/{name}/accept-favorites`, tags: [TAG] })
    .input(z.object({ name: z.string() }))
    .output(
      z.object({
        cardSlug: z.string(),
        printingsCreated: z.number(),
        skipped: z.array(skippedPrintingSchema),
      }),
    ),
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
