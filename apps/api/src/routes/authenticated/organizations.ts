import { ERROR_CODES } from "@openrift/shared";
import type { OrganizationDetailResponse, OrganizationListResponse } from "@openrift/shared";
import { organizationsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import {
  toOrganizationMember,
  toOrganizationResponse,
  toOrganizationSummary,
} from "../../lib/tournament-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { Organization } from "../../repositories/organizations.js";

const os = implement(organizationsContract).$context<ApiContext>().use(requireAuthedUser);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Loads the organization by id or slug; 404 if missing. The `id` column is a
 * uuid, so a non-uuid value (a slug) must never be passed to `findById` — that
 * throws Postgres `22P02` and 500s. We branch on the value's shape instead.
 * @returns The organization row.
 */
async function loadOrg(repos: Repos, idOrSlug: string): Promise<Organization> {
  const org = UUID_PATTERN.test(idOrSlug)
    ? await repos.organizations.findById(idOrSlug)
    : await repos.organizations.findBySlug(idOrSlug);
  if (!org) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Organization not found");
  }
  return org;
}

/**
 * Builds the org detail with its members and the viewer's role.
 * @returns The organization detail response.
 */
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

/**
 * Authenticated organization surfaces (ADR-033): the host picker, the org page,
 * and member management. Only an owner may grant or remove an `owner`; managers
 * may manage managers; the last owner cannot be removed.
 */
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
      const membership = await repos.organizations.getMembership(org.id, context.userId);
      if (!membership || membership.role === "judge") {
        throw new AppError(
          403,
          ERROR_CODES.FORBIDDEN,
          "Only org owners or managers can manage members",
        );
      }
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
      const membership = await repos.organizations.getMembership(org.id, context.userId);
      if (!membership || membership.role === "judge") {
        throw new AppError(
          403,
          ERROR_CODES.FORBIDDEN,
          "Only org owners or managers can manage members",
        );
      }
      const target = await repos.organizations.getMembership(org.id, input.userId);
      if (!target) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
      }
      if (target.role === input.role) {
        return buildDetail(repos, org, context.userId);
      }
      // Granting or revoking the owner role is owner-only.
      if ((input.role === "owner" || target.role === "owner") && membership.role !== "owner") {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only an owner can change the owner role");
      }
      // Demoting the last remaining owner would leave the org ownerless. Lock the
      // org row first so two concurrent demotions/removals can't both pass the
      // count guard and race the org down to zero owners (TOCTOU).
      await context.transact(async (trxRepos) => {
        if (target.role === "owner") {
          await trxRepos.organizations.lockForUpdate(org.id);
          const owners = await trxRepos.organizations.countOwners(org.id);
          if (owners <= 1) {
            throw new AppError(
              400,
              ERROR_CODES.BAD_REQUEST,
              "An organization must keep at least one owner",
            );
          }
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
      const membership = await repos.organizations.getMembership(org.id, context.userId);
      if (!membership || membership.role === "judge") {
        throw new AppError(
          403,
          ERROR_CODES.FORBIDDEN,
          "Only org owners or managers can manage members",
        );
      }
      const target = await repos.organizations.getMembership(org.id, input.userId);
      if (!target) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Member not found");
      }
      if (target.role === "owner" && membership.role !== "owner") {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Only an owner can remove another owner");
      }
      // Lock the org row first so a concurrent removal/demotion can't race the
      // last-owner count guard and leave the org ownerless (TOCTOU).
      await context.transact(async (trxRepos) => {
        if (target.role === "owner") {
          await trxRepos.organizations.lockForUpdate(org.id);
          const owners = await trxRepos.organizations.countOwners(org.id);
          if (owners <= 1) {
            throw new AppError(
              400,
              ERROR_CODES.BAD_REQUEST,
              "An organization must keep at least one owner",
            );
          }
        }
        await trxRepos.organizations.removeMember(org.id, input.userId);
      });
      return buildDetail(repos, org, context.userId);
    },
  ),
};
