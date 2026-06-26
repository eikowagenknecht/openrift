import { idParamSchema } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Cards";

const BANS = "/api/admin/v1/cards/{id}/bans";

const banResponseSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  formatId: z.string(),
  formatName: z.string(),
  bannedAt: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

const formatIdSchema = z.string().min(1);
const reasonSchema = z.string().min(1).nullable().optional();

/**
 * oRPC contract for the admin card-ban management (mounted under
 * `/api/admin/v1/cards/{id}/bans`, admin-gated by the mount). All four verbs
 * share the same path; create/update/remove carry their fields in the body
 * alongside the `{id}` path param (oRPC compact input). Conflict / not-found
 * states are thrown as `AppError` and bridged to ORPCErrors.
 */
export const adminCardBansContract = {
  list: oc
    .route({ method: "GET", path: BANS, tags: [TAG] })
    .input(idParamSchema)
    .output(z.object({ bans: z.array(banResponseSchema) })),
  create: oc
    .route({ method: "POST", path: BANS, tags: [TAG], successStatus: 201 })
    .input(
      idParamSchema.extend({
        formatId: formatIdSchema,
        bannedAt: z.string().date(),
        reason: reasonSchema,
      }),
    )
    .output(z.object({ ban: banResponseSchema })),
  update: oc
    .route({ method: "PATCH", path: BANS, tags: [TAG] })
    .input(
      idParamSchema.extend({
        formatId: formatIdSchema,
        bannedAt: z.string().date().optional(),
        reason: reasonSchema,
      }),
    )
    .output(z.object({ ban: banResponseSchema })),
  remove: oc
    .route({ method: "DELETE", path: BANS, tags: [TAG], successStatus: 204 })
    .input(idParamSchema.extend({ formatId: formatIdSchema })),
};

export type AdminCardBansContract = typeof adminCardBansContract;
export type CardBanResponse = z.infer<typeof banResponseSchema>;
