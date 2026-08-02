import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Operations";

const TR = "/api/admin/v1/typography-review";

/**
 * The card-side columns `list` scans. `name` and `tags` live on the card row;
 * the two `corrected*` fields live on the card's errata row.
 */
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

/**
 * The entity/field pair addressed by one review row. Discriminated on `entity`
 * so a card field can never be submitted against a printing (or vice versa) —
 * `accept` writes the field into a SET clause, so the pairing is the allowlist.
 */
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

/**
 * oRPC contract for the admin typography-review (mounted under
 * `/api/admin/v1/typography-review`, admin-gated by the mount). `list` surfaces
 * card/printing typography mismatches; `accept` applies one proposed fix. All
 * procedures are session-gated (UNAUTHORIZED + FORBIDDEN from `authedRoute`).
 * Domain codes per route: `accept` → NOT_FOUND (target card or printing not
 * found).
 */
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
/** One review row's target: the entity, its id, and the field to rewrite. */
export type TypographyTarget = z.infer<typeof typographyTargetSchema>;
/** The `accept` request body — consumed by the web typography-review page. */
export type AcceptTypographyFixBody = z.infer<typeof acceptTypographyFixSchema>;
export interface TypographyReviewResponse {
  diffs: z.infer<typeof typographyDiffItemSchema>[];
}
