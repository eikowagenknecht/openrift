import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

// ─── Shared shapes ─────────────────────────────────────────────────────────

const orgSlugSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{2,49}$/u,
    "Slug must be 3-50 chars: lowercase letters, digits, dashes",
  );
const orgNameSchema = z.string().min(1).max(120);
const orgDescriptionSchema = z.string().max(4000).nullable();
const organizationRoleSchema = z.enum(["owner", "manager", "judge"]);

export const organizationResponseSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    ownerUserId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("OrganizationResponse");

export const organizationMemberResponseSchema = z
  .object({
    userId: z.string(),
    name: z.string().nullable(),
    role: organizationRoleSchema,
    joinedAt: z.string(),
  })
  .openapi("OrganizationMemberResponse");

export const organizationSummaryResponseSchema = organizationResponseSchema
  .extend({
    ownerName: z.string().nullable(),
    memberCount: z.number().int().nonnegative(),
  })
  .openapi("OrganizationSummaryResponse");

export const organizationListResponseSchema = z
  .object({ items: z.array(organizationSummaryResponseSchema) })
  .openapi("OrganizationListResponse");

export const organizationDetailResponseSchema = organizationResponseSchema
  .extend({
    members: z.array(organizationMemberResponseSchema),
    viewerRole: organizationRoleSchema.nullable(),
  })
  .openapi("OrganizationDetailResponse");

const ADMIN_BASE = "/api/admin/v1/organizations";
const ADMIN_TAG = "Admin - Organizations";
const TAG = "Organizations";

const orgIdParamSchema = z.object({ id: z.string().min(1) });

/**
 * Admin oRPC contract for provisioning event organizations (ADR-033 decision 4,
 * ADR-032). Mounted under `/api/admin/v1`, admin-gated by the prefix. `create`
 * inserts the org and an owner membership in one transaction. Domain codes:
 * `create` → CONFLICT (slug taken) / NOT_FOUND (owner user); `update` →
 * NOT_FOUND / CONFLICT; `remove` → NOT_FOUND.
 */
export const adminOrganizationsContract = {
  list: authedRoute
    .route({ method: "GET", path: ADMIN_BASE, tags: [ADMIN_TAG] })
    .output(organizationListResponseSchema),
  create: authedRoute
    .route({ method: "POST", path: ADMIN_BASE, tags: [ADMIN_TAG], successStatus: 201 })
    .errors({
      CONFLICT: { message: "An organization with that slug already exists" },
      NOT_FOUND: { message: "Owner user not found" },
    })
    .input(
      z.object({
        slug: orgSlugSchema,
        name: orgNameSchema,
        description: orgDescriptionSchema.optional(),
        ownerUserId: z.string().min(1),
      }),
    )
    .output(organizationResponseSchema),
  update: authedRoute
    .route({ method: "PATCH", path: `${ADMIN_BASE}/{id}`, tags: [ADMIN_TAG] })
    .errors({
      NOT_FOUND: { message: "Organization not found" },
      CONFLICT: { message: "An organization with that slug already exists" },
    })
    .input(
      withParams(orgIdParamSchema, {
        slug: orgSlugSchema.optional(),
        name: orgNameSchema.optional(),
        description: orgDescriptionSchema.optional(),
      }),
    )
    .output(organizationResponseSchema),
  remove: authedRoute
    .route({ method: "DELETE", path: `${ADMIN_BASE}/{id}`, tags: [ADMIN_TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Organization not found" } })
    .input(orgIdParamSchema),
};

export type AdminOrganizationsContract = typeof adminOrganizationsContract;

/**
 * Authenticated oRPC contract for the organization surfaces a member touches:
 * the host picker (`list` — orgs the caller owns or manages), the org page
 * (`get` by id or slug, with members), and member management. Only an owner may
 * add or remove an `owner`; a manager may add/remove managers; the last owner
 * cannot be removed. Mounted at `/api/v1/organizations`.
 */
export const organizationsContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/organizations", tags: [TAG] })
    .output(organizationListResponseSchema),
  get: authedRoute
    .route({ method: "GET", path: "/api/v1/organizations/{id}", tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Organization not found" } })
    .input(orgIdParamSchema)
    .output(organizationDetailResponseSchema),
  addMember: authedRoute
    .route({ method: "POST", path: "/api/v1/organizations/{id}/members", tags: [TAG] })
    .errors({
      NOT_FOUND: { message: "Organization or user not found" },
      CONFLICT: { message: "User is already a member" },
    })
    .input(
      withParams(orgIdParamSchema, {
        // Members are added by their exact account email — no user search/enumeration.
        email: z.email().max(254),
        role: organizationRoleSchema,
      }),
    )
    .output(organizationDetailResponseSchema),
  updateMemberRole: authedRoute
    .route({
      method: "PATCH",
      path: "/api/v1/organizations/{id}/members/{userId}",
      tags: [TAG],
    })
    .errors({
      NOT_FOUND: { message: "Organization or member not found" },
      BAD_REQUEST: { message: "An organization must keep at least one owner" },
    })
    .input(
      withParams(z.object({ id: z.string().min(1), userId: z.string().min(1) }), {
        role: organizationRoleSchema,
      }),
    )
    .output(organizationDetailResponseSchema),
  removeMember: authedRoute
    .route({
      method: "DELETE",
      path: "/api/v1/organizations/{id}/members/{userId}",
      tags: [TAG],
    })
    .errors({
      NOT_FOUND: { message: "Organization or member not found" },
      BAD_REQUEST: { message: "An organization must keep at least one owner" },
    })
    .input(z.object({ id: z.string().min(1), userId: z.string().min(1) }))
    .output(organizationDetailResponseSchema),
};

export type OrganizationsContract = typeof organizationsContract;
