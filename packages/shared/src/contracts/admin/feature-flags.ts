import { isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

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
 * `/api/admin/v1`, admin-gated by the mount). All procedures share the
 * `authedRoute` base (UNAUTHORIZED + FORBIDDEN). Covers global flag CRUD plus
 * per-user overrides. Domain codes per route: `create` → CONFLICT (key taken);
 * `update` → NOT_FOUND; `remove` → NOT_FOUND; `removeOverride` → NOT_FOUND.
 * The static `feature-flags/overrides` path precedes `feature-flags/{key}`.
 */
export const adminFeatureFlagsContract = {
  // ── Global flags ──────────────────────────────────────────────────────────
  list: authedRoute
    .route({ method: "GET", path: FF, tags: [TAG] })
    .output(z.object({ flags: z.array(flagSchema) })),
  create: authedRoute
    .route({ method: "POST", path: FF, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "A flag with that key already exists" } })
    .input(
      z.object({
        key: z
          .string()
          .regex(/^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/u, "Key must be kebab-case (e.g. deck-builder)"),
        description: z.string().nullable().optional(),
        enabled: z.boolean().optional(),
      }),
    ),
  update: authedRoute
    .route({ method: "PATCH", path: `${FF}/{key}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Flag not found" } })
    .input(
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
  remove: authedRoute
    .route({ method: "DELETE", path: `${FF}/{key}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Flag not found" } })
    .input(z.object({ key: z.string().min(1) })),

  // ── Per-user overrides ────────────────────────────────────────────────────
  listOverrides: authedRoute
    .route({ method: "GET", path: `${FF}/overrides`, tags: [TAG] })
    .output(z.object({ overrides: z.array(overrideSchema) })),
  upsertOverride: authedRoute
    .route({ method: "PUT", path: `${BASE}/users/{id}/feature-flags/{key}`, tags: [TAG] })
    .input(withParams(userKeyParamSchema, { enabled: z.boolean() }))
    .output(z.object({ flagKey: z.string(), enabled: z.boolean() })),
  removeOverride: authedRoute
    .route({
      method: "DELETE",
      path: `${BASE}/users/{id}/feature-flags/{key}`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Override not found for this user and flag" } })
    .input(userKeyParamSchema),
};

export type AdminFeatureFlagsContract = typeof adminFeatureFlagsContract;
export interface AdminFeatureFlagsResponse {
  flags: z.infer<typeof flagSchema>[];
}
export interface AdminFeatureFlagOverridesResponse {
  overrides: z.infer<typeof overrideSchema>[];
}
