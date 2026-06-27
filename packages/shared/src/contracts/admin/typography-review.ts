import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Operations";

const TR = "/api/admin/v1/typography-review";

const typographyDiffItemSchema = z.object({
  entity: z.enum(["card", "printing"]),
  id: z.uuid(),
  name: z.string(),
  field: z.string(),
  current: z.string(),
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
    .input(
      z.object({
        entity: z.enum(["card", "printing"]),
        id: z.uuid(),
        field: z.string(),
        proposed: z.string(),
      }),
    ),
};

export type AdminTypographyReviewContract = typeof adminTypographyReviewContract;
export interface TypographyReviewResponse {
  diffs: z.infer<typeof typographyDiffItemSchema>[];
}
