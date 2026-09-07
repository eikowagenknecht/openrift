import { organizationsContract } from "@openrift/shared/contracts/organizations";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  OrganizationDetailResponse,
  OrganizationListResponse,
} from "@openrift/shared/types/api/tournament";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { assertNotLastOwner, loadOrg, requireOrgRole } from "../../lib/org-access.js";
import {
  toOrganizationMember,
  toOrganizationResponse,
  toOrganizationSummary,
} from "../../lib/tournament-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { Organization } from "../../repositories/organizations.js";

const os = implement(organizationsContract).$context<ApiContext>().use(requireAuthedUser);

async function buildDetail(
  repos: Repos,
  org: Organization,
  viewerId: string,
): Promise<OrganizationDetailResponse> {
  const [members, membership] = await Promise.all([
    repos.organizations.listMembers(org.id),
    repos.organizations.getMembership(org.id, viewerId),
  ]);
  return {
    ...toOrganizationResponse(org),
    members: members.map((row) => toOrganizationMember(row)),
    viewerRole: membership?.role ?? null,
  };
}

/** Only an owner may grant or remove an `owner`; the last owner cannot be removed. */
export const organizationsRouter = {
  list: os.list.handler(async ({ context }): Promise<OrganizationListResponse> => {
    const rows = await context.repos.organizations.listForUser(context.userId);
    return { items: rows.map((row) => toOrganizationSummary(row)) };
  }),

  get: os.get.handler(async ({ input, context }): Promise<OrganizationDetailResponse> => {
    const repos = context.repos;
    const org = await loadOrg(repos, input.id);
    const membership = await repos.organizations.getMembership(org.id, context.userId);
    if (!membership) {
      // Hide orgs the caller has no relationship to.
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Organization not found");
    }
    return buildDetail(repos, org, context.userId);
  }),

  addMember: os.addMember.handler(
    async ({ input, context }): Promise<OrganizationDetailResponse> => {
      const repos = context.repos;
      const org = await loadOrg(repos, input.id);
      const membership = await requireOrgRole(repos, org.id, context.userId, "manager");
      if (input.role === "owner" && membership.role !== "owner") {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only an owner can add another owner");
      }
      const targetUser = await repos.users.findIdByEmail(input.email);
      if (!targetUser) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "No account found for that email");
      }
      const existing = await repos.organizations.getMembership(org.id, targetUser.id);
      if (existing) {
        throw new AppError(409, ERROR_CODES.CONFLICT, "User is already a member");
      }
      await repos.organizations.addMember(org.id, targetUser.id, input.role);
      return buildDetail(repos, org, context.userId);
    },
  ),

  updateMemberRole: os.updateMemberRole.handler(
    async ({ input, context }): Promise<OrganizationDetailResponse> => {
      const repos = context.repos;
      const org = await loadOrg(repos, input.id);
      const membership = await requireOrgRole(repos, org.id, context.userId, "manager");
      const target = await repos.organizations.getMembership(org.id, input.userId);
      if (!target) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
      }
      if (target.role === input.role) {
        return buildDetail(repos, org, context.userId);
      }
      if ((input.role === "owner" || target.role === "owner") && membership.role !== "owner") {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only an owner can change the owner role");
      }
      await context.transact(async (trxRepos) => {
        // Re-checks the role under the org lock: the snapshot above may be stale.
        await trxRepos.organizations.lockForUpdate(org.id);
        const lockedTarget = await trxRepos.organizations.getMembership(org.id, input.userId);
        if (!lockedTarget || lockedTarget.role === input.role) {
          return;
        }
        if (lockedTarget.role === "owner" && membership.role !== "owner") {
          throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only an owner can change the owner role");
        }
        if (lockedTarget.role === "owner") {
          await assertNotLastOwner(trxRepos, org.id);
        }
        await trxRepos.organizations.updateMemberRole(org.id, input.userId, input.role);
      });
      return buildDetail(repos, org, context.userId);
    },
  ),

  removeMember: os.removeMember.handler(
    async ({ input, context }): Promise<OrganizationDetailResponse> => {
      const repos = context.repos;
      const org = await loadOrg(repos, input.id);
      const membership = await requireOrgRole(repos, org.id, context.userId, "manager");
      const target = await repos.organizations.getMembership(org.id, input.userId);
      if (!target) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
      }
      if (target.role === "owner" && membership.role !== "owner") {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only an owner can remove another owner");
      }
      await context.transact(async (trxRepos) => {
        // Re-checks the role under the org lock, as updateMemberRole does.
        await trxRepos.organizations.lockForUpdate(org.id);
        const lockedTarget = await trxRepos.organizations.getMembership(org.id, input.userId);
        if (!lockedTarget) {
          return;
        }
        if (lockedTarget.role === "owner") {
          if (membership.role !== "owner") {
            throw new AppError(
              403,
              ERROR_CODES.FORBIDDEN,
              "Only an owner can remove another owner",
            );
          }
          await assertNotLastOwner(trxRepos, org.id);
        }
        await trxRepos.organizations.removeMember(org.id, input.userId);
      });
      return buildDetail(repos, org, context.userId);
    },
  ),
};
