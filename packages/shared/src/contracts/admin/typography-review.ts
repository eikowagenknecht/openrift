import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Operations";

const TR = "/api/admin/v1/typography-review";

/** `name` and `tags` live on the card row; the two `corrected*` fields on its errata row. */
export const CARD_TYPOGRAPHY_FIELDS = [
  "name",
  "tags",
  "correctedRulesText",
  "correctedEffectText",
] as const;

/** The printing columns `list` scans. Every entry must be a `printings` column. */
export const PRINTING_TYPOGRAPHY_FIELDS = [
  "printedRulesText",
  "printedEffectText",
  "flavorText",
  "printedName",
] as const;

/** `accept` writes `field` into a SET clause; this union is the allowlist pairing entity to field. */
const typographyTargetSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("card"),
    id: z.uuid(),
    field: z.enum(CARD_TYPOGRAPHY_FIELDS),
  }),
  z.object({
    entity: z.literal("printing"),
    id: z.uuid(),
    field: z.enum(PRINTING_TYPOGRAPHY_FIELDS),
  }),
]);

const typographyDiffItemSchema = z.object({
  target: typographyTargetSchema,
  name: z.string(),
  current: z.string(),
  proposed: z.string(),
});

const acceptTypographyFixSchema = z.object({
  target: typographyTargetSchema,
  proposed: z.string(),
});

export const adminTypographyReviewContract = {
  list: authedRoute
    .route({ method: "GET", path: TR, tags: [TAG] })
    .output(z.object({ diffs: z.array(typographyDiffItemSchema) })),
  accept: authedRoute
    .route({ method: "POST", path: `${TR}/accept`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Target card or printing not found" } })
    .input(acceptTypographyFixSchema),
};

export type AdminTypographyReviewContract = typeof adminTypographyReviewContract;
export type TypographyTarget = z.infer<typeof typographyTargetSchema>;
export type AcceptTypographyFixBody = z.infer<typeof acceptTypographyFixSchema>;
export interface TypographyReviewResponse {
  diffs: z.infer<typeof typographyDiffItemSchema>[];
}
