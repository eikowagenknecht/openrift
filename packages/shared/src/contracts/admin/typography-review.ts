import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Operations";

const TR = "/api/admin/v1/typography-review";

const typographyDiffItemSchema = z.object({
  entity: z.enum(["card", "printing"]),
  id: z.string().uuid(),
  name: z.string(),
  field: z.string(),
  current: z.string(),
  proposed: z.string(),
});

/**
 * oRPC contract for the admin typography-review (mounted under
 * `/api/admin/v1/typography-review`, admin-gated by the mount). `list` surfaces
 * card/printing typography mismatches; `accept` applies one proposed fix.
 * Not-found targets are thrown as `AppError` and bridged to ORPCErrors in the
 * implementation.
 */
export const adminTypographyReviewContract = {
  list: oc
    .route({ method: "GET", path: TR, tags: [TAG] })
    .output(z.object({ diffs: z.array(typographyDiffItemSchema) })),
  accept: oc.route({ method: "POST", path: `${TR}/accept`, tags: [TAG], successStatus: 204 }).input(
    z.object({
      entity: z.enum(["card", "printing"]),
      id: z.string().uuid(),
      field: z.string(),
      proposed: z.string(),
    }),
  ),
};

export type AdminTypographyReviewContract = typeof adminTypographyReviewContract;
export interface TypographyReviewResponse {
  diffs: z.infer<typeof typographyDiffItemSchema>[];
}
