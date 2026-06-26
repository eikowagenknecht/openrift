import { isoDateTime } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Feature Flags";

const BASE = "/api/admin/v1";
const FF = `${BASE}/feature-flags`;

const flagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  description: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const overrideSchema = z.object({
  userId: z.string(),
  userName: z.string().nullable(),
  userEmail: z.string(),
  flagKey: z.string(),
  enabled: z.boolean(),
});

const userKeyParamSchema = z.object({ id: z.string().min(1), key: z.string().min(1) });

/**
 * oRPC contract for the admin feature-flags tooling (mounted under
 * `/api/admin/v1`, admin-gated by the mount). Covers global flag CRUD plus
 * per-user overrides. The static `feature-flags/overrides` path precedes
 * `feature-flags/{key}` internally, so both groups live in one handler.
 * Conflict / not-found states are thrown as `AppError` and bridged to
 * ORPCErrors in the implementation.
 */
export const adminFeatureFlagsContract = {
  // ── Global flags ──────────────────────────────────────────────────────────
  list: oc
    .route({ method: "GET", path: FF, tags: [TAG] })
    .output(z.object({ flags: z.array(flagSchema) })),
  create: oc.route({ method: "POST", path: FF, tags: [TAG], successStatus: 201 }).input(
    z.object({
      key: z
        .string()
        .regex(/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/u, "Key must be kebab-case (e.g. deck-builder)"),
      description: z.string().nullable().optional(),
      enabled: z.boolean().optional(),
    }),
  ),
  update: oc.route({ method: "PATCH", path: `${FF}/{key}`, tags: [TAG], successStatus: 204 }).input(
    z
      .object({
        key: z.string().min(1),
        enabled: z.boolean().optional(),
        description: z.string().nullable().optional(),
      })
      .refine((o) => o.enabled !== undefined || o.description !== undefined, {
        message: "At least one field (enabled, description) must be provided",
      }),
  ),
  remove: oc
    .route({ method: "DELETE", path: `${FF}/{key}`, tags: [TAG], successStatus: 204 })
    .input(z.object({ key: z.string().min(1) })),

  // ── Per-user overrides ────────────────────────────────────────────────────
  listOverrides: oc
    .route({ method: "GET", path: `${FF}/overrides`, tags: [TAG] })
    .output(z.object({ overrides: z.array(overrideSchema) })),
  upsertOverride: oc
    .route({ method: "PUT", path: `${BASE}/users/{id}/feature-flags/{key}`, tags: [TAG] })
    .input(userKeyParamSchema.extend({ enabled: z.boolean() }))
    .output(z.object({ flagKey: z.string(), enabled: z.boolean() })),
  removeOverride: oc
    .route({
      method: "DELETE",
      path: `${BASE}/users/{id}/feature-flags/{key}`,
      tags: [TAG],
      successStatus: 204,
    })
    .input(userKeyParamSchema),
};

export type AdminFeatureFlagsContract = typeof adminFeatureFlagsContract;
export interface AdminFeatureFlagsResponse {
  flags: z.infer<typeof flagSchema>[];
}
export interface AdminFeatureFlagOverridesResponse {
  overrides: z.infer<typeof overrideSchema>[];
}
