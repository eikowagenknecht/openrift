import { cardFieldRules, printingFieldRules } from "@openrift/shared/db-field-rules";
import { isoDate, isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Printing Desk";

const BASE = "/api/admin/v1/printing-desk";

const printingIdParam = z.object({ printingId: z.uuid() });
const cardSlugParam = z.object({ cardSlug: cardFieldRules.slug });

export const deskReleasePrecisionSchema = z.enum(["day", "month", "quarter", "year"]);

/**
 * `shortCode` and `artist` are optional on input only: the server derives the
 * code from `codeTba` and the artist from the base printing.
 */
export const deskPrintingFieldsSchema = z
  .object({
    setId: z.uuid(),
    distributionChannelSlugs: z.array(z.string().min(1)),
    markerSlugs: z.array(z.string().min(1)),
    codeTba: z.boolean(),
    shortCode: printingFieldRules.shortCode.optional(),
    finish: printingFieldRules.finish,
    language: printingFieldRules.language,
    size: printingFieldRules.size,
    artist: printingFieldRules.artist.optional(),
    announcedAt: isoDate.nullable(),
    releasedAt: isoDate.nullable(),
    releasePrecision: deskReleasePrecisionSchema.nullable(),
    comment: printingFieldRules.comment,
  })
  .strict();

export const deskPrintingRowSchema = z.object({
  printingId: z.string(),
  slug: z.string(),
  cardId: z.string(),
  cardSlug: z.string(),
  cardName: z.string(),
  cardType: z.string(),
  setId: z.string(),
  setName: z.string(),
  setSlug: z.string(),
  shortCode: z.string(),
  publicCode: z.string(),
  rarity: z.string(),
  finish: z.string(),
  language: z.string(),
  size: z.string(),
  artist: z.string(),
  markerSlugs: z.array(z.string()),
  distributionChannelSlugs: z.array(z.string()),
  announcedAt: z.string().nullable(),
  releasedAt: z.string().nullable(),
  releasePrecision: deskReleasePrecisionSchema.nullable(),
  comment: z.string().nullable(),
  imageCount: z.number(),
  activeImageFileId: z.string().nullable(),
  activeImageUrl: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  canEdit: z.boolean(),
});

/**
 * `url` is the rehosted file when there is one, else the original source URL.
 * `canDelete` is false for an image someone else uploaded, unless the caller is an admin.
 */
export const deskImageSchema = z.object({
  printingImageId: z.string(),
  imageFileId: z.string(),
  url: z.string(),
  isActive: z.boolean(),
  rotation: z.number(),
  face: z.enum(["front", "back"]),
  credit: z.string().nullable(),
  canDelete: z.boolean(),
});

const deskUpdateImageInputSchema = z
  .object({
    imageFileId: z.uuid(),
    credit: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict();

const deskSetImageFaceInputSchema = z
  .object({ printingImageId: z.uuid(), face: z.enum(["front", "back"]) })
  .strict();

export const deskCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  domains: z.array(z.string()),
});

const deskListInputSchema = z.object({ mode: z.enum(["mine", "all"]) });
const deskListOutputSchema = z.object({ printings: z.array(deskPrintingRowSchema) });

const deskCardPrintingsOutputSchema = z.object({
  card: deskCardSchema,
  printings: z.array(deskPrintingRowSchema),
});

const deskGetOutputSchema = z.object({
  printing: deskPrintingRowSchema,
  images: z.array(deskImageSchema),
});

const deskCreateInputSchema = deskPrintingFieldsSchema.extend({
  cardId: z.uuid(),
  basePrintingId: z.uuid().optional(),
});
const deskCreateOutputSchema = z.object({ printingId: z.string() });

const deskUpdateInputSchema = printingIdParam
  .extend(deskPrintingFieldsSchema.partial().shape)
  .strict();

export const adminPrintingDeskContract = {
  list: authedRoute
    .route({ method: "GET", path: `${BASE}/printings`, tags: [TAG] })
    .input(deskListInputSchema)
    .output(deskListOutputSchema),

  // Every printing of the card, in every language, not only the desk's own.
  cardPrintings: authedRoute
    .route({ method: "GET", path: `${BASE}/cards/{cardSlug}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Card not found" } })
    .input(cardSlugParam)
    .output(deskCardPrintingsOutputSchema),

  get: authedRoute
    .route({ method: "GET", path: `${BASE}/printings/{printingId}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Printing not found" } })
    .input(printingIdParam)
    .output(deskGetOutputSchema),

  create: authedRoute
    .route({ method: "POST", path: `${BASE}/printings`, tags: [TAG], successStatus: 201 })
    .errors({
      NOT_FOUND: { message: "Card or set not found" },
      BAD_REQUEST: { message: "Invalid printing fields" },
      CONFLICT: { message: "Printing already exists" },
    })
    .input(deskCreateInputSchema)
    .output(deskCreateOutputSchema),

  // Scoped like the image writes: any promo, plus whatever the caller added.
  // Omit a field to leave it unchanged.
  update: authedRoute
    .route({
      method: "PATCH",
      path: `${BASE}/printings/{printingId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Printing not found" },
      BAD_REQUEST: { message: "Invalid printing fields" },
      CONFLICT: { message: "Printing already exists" },
      FORBIDDEN: { message: "That printing is outside the desk" },
    })
    .input(deskUpdateInputSchema),

  // Not ownership-gated: the credit belongs to the file, and any grant holder
  // may correct it. Omit a field to leave it unchanged; `null` clears it.
  updateImage: authedRoute
    .route({
      method: "PATCH",
      path: `${BASE}/images/{imageFileId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Image file not found" },
      BAD_REQUEST: { message: "Invalid credit fields" },
    })
    .input(deskUpdateImageInputSchema),

  // Not ownership-gated, like `updateImage`. Moving a file to the other side
  // clears its active flag, so the side is picked again afterwards.
  setImageFace: authedRoute
    .route({
      method: "PATCH",
      path: `${BASE}/printing-images/{printingImageId}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Printing image not found" } })
    .input(deskSetImageFaceInputSchema),
};

export type AdminPrintingDeskContract = typeof adminPrintingDeskContract;

export type DeskReleasePrecision = z.infer<typeof deskReleasePrecisionSchema>;
export type DeskPrintingFields = z.infer<typeof deskPrintingFieldsSchema>;
export type DeskPrintingRow = z.infer<typeof deskPrintingRowSchema>;
export type DeskImage = z.infer<typeof deskImageSchema>;
export type DeskCard = z.infer<typeof deskCardSchema>;
export type DeskListInput = z.infer<typeof deskListInputSchema>;
export type DeskListOutput = z.infer<typeof deskListOutputSchema>;
export type DeskCardPrintingsInput = z.infer<typeof cardSlugParam>;
export type DeskCardPrintingsOutput = z.infer<typeof deskCardPrintingsOutputSchema>;
export type DeskGetInput = z.infer<typeof printingIdParam>;
export type DeskGetOutput = z.infer<typeof deskGetOutputSchema>;
export type DeskCreateInput = z.infer<typeof deskCreateInputSchema>;
export type DeskCreateOutput = z.infer<typeof deskCreateOutputSchema>;
export type DeskUpdateInput = z.infer<typeof deskUpdateInputSchema>;
export type DeskUpdateImageInput = z.infer<typeof deskUpdateImageInputSchema>;
export type DeskSetImageFaceInput = z.infer<typeof deskSetImageFaceInputSchema>;
