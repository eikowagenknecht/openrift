import { idParamSchema, isoDate, isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Cards";

const BANS = "/api/admin/v1/cards/{id}/bans";

const banResponseSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  formatId: z.string(),
  formatName: z.string(),
  bannedAt: isoDate,
  reason: z.string().nullable(),
  createdAt: isoDateTime,
});

const formatIdSchema = z.string().min(1);
const reasonSchema = z.string().min(1).nullable().optional();

/**
 * oRPC contract for the admin card-ban management (mounted under
 * `/api/admin/v1/cards/{id}/bans`, admin-gated by the mount). All four verbs
 * share the same path; create/update/remove carry their fields in the body
 * alongside the `{id}` path param (oRPC compact input). Domain codes per
 * route: `create` → NOT_FOUND (card not found) + CONFLICT (duplicate ban);
 * `update` → NOT_FOUND (ban not found); `remove` → NOT_FOUND (ban not found).
 */
export const adminCardBansContract = {
  list: authedRoute
    .route({ method: "GET", path: BANS, tags: [TAG] })
    .input(idParamSchema)
    .output(z.object({ bans: z.array(banResponseSchema) })),
  create: authedRoute
    .route({ method: "POST", path: BANS, tags: [TAG], successStatus: 201 })
    .errors({
      NOT_FOUND: { message: "Card not found" },
      CONFLICT: { message: "Card is already banned in this format" },
    })
    .input(
      withParams(idParamSchema, {
        formatId: formatIdSchema,
        bannedAt: isoDate,
        reason: reasonSchema,
      }),
    )
    .output(z.object({ ban: banResponseSchema })),
  update: authedRoute
    .route({ method: "PATCH", path: BANS, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Ban not found" } })
    .input(
      withParams(idParamSchema, {
        formatId: formatIdSchema,
        bannedAt: isoDate.optional(),
        reason: reasonSchema,
      }),
    )
    .output(z.object({ ban: banResponseSchema })),
  remove: authedRoute
    .route({ method: "DELETE", path: BANS, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Ban not found" } })
    .input(withParams(idParamSchema, { formatId: formatIdSchema })),
};

export type AdminCardBansContract = typeof adminCardBansContract;
export type CardBanResponse = z.infer<typeof banResponseSchema>;
