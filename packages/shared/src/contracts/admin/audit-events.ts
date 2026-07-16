import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Audit";

// No admin-section matcher maps this prefix, so per-section grant holders
// always 403 here (the gate fails closed) — the audit log is full-admin only.
const BASE = "/api/admin/v1/audit-events";

export const adminAuditEventSchema = z.object({
  id: z.uuid(),
  actorUserId: z.string(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  entityLabel: z.string().nullable(),
  cardSlug: z.string().nullable(),
  oldValues: z.record(z.string(), z.unknown()).nullable(),
  newValues: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoDateTime,
});

const auditActorSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
});

/**
 * oRPC contract for the admin audit log (migration 201). Cursor-paginated,
 * newest first; `search` matches entity label/id/card slug.
 */
export const adminAuditEventsContract = {
  list: authedRoute
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .input(
      z.object({
        cursor: z.string().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        actorUserId: z.string().optional(),
        action: z.string().optional(),
        search: z.string().optional(),
      }),
    )
    .output(
      z.object({
        items: z.array(adminAuditEventSchema),
        nextCursor: z.string().nullable(),
      }),
    ),
  actors: authedRoute
    .route({ method: "GET", path: `${BASE}/actors`, tags: [TAG] })
    .output(z.object({ actors: z.array(auditActorSchema) })),
  actions: authedRoute
    .route({ method: "GET", path: `${BASE}/actions`, tags: [TAG] })
    .output(z.object({ actions: z.array(z.string()) })),
};

export type AdminAuditEventsContract = typeof adminAuditEventsContract;

/**
 * Concrete JSON type for audit payloads. The zod schema validates them as
 * `Record<string, unknown>`, but consumers (TanStack Start server functions)
 * need a provably-serializable type — audit payloads are plain JSON by
 * construction (they round-trip through a jsonb column).
 */
export type AuditPayloadValue =
  | string
  | number
  | boolean
  | null
  | AuditPayloadValue[]
  | { [key: string]: AuditPayloadValue };

export interface AdminAuditEventResponse extends Omit<
  z.infer<typeof adminAuditEventSchema>,
  "oldValues" | "newValues"
> {
  oldValues: Record<string, AuditPayloadValue> | null;
  newValues: Record<string, AuditPayloadValue> | null;
}
export interface AdminAuditEventsListResponse {
  items: AdminAuditEventResponse[];
  nextCursor: string | null;
}
export interface AdminAuditActorsResponse {
  actors: z.infer<typeof auditActorSchema>[];
}
export interface AdminAuditActionsResponse {
  actions: string[];
}
