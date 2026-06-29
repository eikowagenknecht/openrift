import { ERROR_CODES } from "@openrift/shared";
import type { OrganizationListResponse, OrganizationResponse } from "@openrift/shared";
import { adminOrganizationsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { toOrganizationResponse, toOrganizationSummary } from "../../lib/tournament-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminOrganizationsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin organization provisioning (ADR-033 decision 4). Mounted under
 * `/api/admin/v1/organizations`, admin-gated by the `requireAdmin` middleware on
 * that prefix. Conflict / not-found states are thrown as `AppError` and mapped
 * by the handler's interceptor.
 */
export const adminOrganizationsRouter = {
  list: os.list.handler(async ({ context }): Promise<OrganizationListResponse> => {
    const rows = await context.repos.organizations.listAll();
    return { items: rows.map((row) => toOrganizationSummary(row)) };
  }),

  create: os.create.handler(async ({ input, context }): Promise<OrganizationResponse> => {
    const { organizations, users } = context.repos;
    const existing = await organizations.findBySlug(input.slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Organization "${input.slug}" already exists`);
    }
    const owner = await users.findById(input.ownerUserId);
    if (!owner) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Owner user not found");
    }
    const org = await organizations.create({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      ownerUserId: input.ownerUserId,
    });
    return toOrganizationResponse(org);
  }),

  update: os.update.handler(async ({ input, context }): Promise<OrganizationResponse> => {
    const { organizations } = context.repos;
    const { id, ...patch } = input;
    const org = await organizations.findById(id);
    if (!org) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Organization not found");
    }
    if (patch.slug && patch.slug !== org.slug) {
      const clash = await organizations.findBySlug(patch.slug);
      if (clash) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          `Organization "${patch.slug}" already exists`,
        );
      }
    }
    const updated = await organizations.update(id, patch);
    if (!updated) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Organization not found");
    }
    return toOrganizationResponse(updated);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const result = await context.repos.organizations.deleteById(input.id);
    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Organization not found");
    }
  }),
};
