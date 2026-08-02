import type {
  OrganizationMemberResponse,
  OrganizationResponse,
  OrganizationSummaryResponse,
  TournamentModuleFlags,
  TournamentParticipantResponse,
  TournamentParticipantStatus,
  TournamentStaffMemberResponse,
} from "@openrift/shared";

import type {
  Organization,
  OrganizationMemberWithName,
  OrganizationSummary,
} from "../repositories/organizations.js";
import type {
  Tournament,
  TournamentParticipantWithUser,
  TournamentStaffWithName,
} from "../repositories/tournaments.js";

/** @returns The organization row mapped to its API response shape. */
export function toOrganizationResponse(org: Organization): OrganizationResponse {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    description: org.description,
    ownerUserId: org.ownerUserId,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

/** @returns The admin-list summary (org + owner name + member count). */
export function toOrganizationSummary(row: OrganizationSummary): OrganizationSummaryResponse {
  return {
    ...toOrganizationResponse(row),
    ownerName: row.ownerName,
    memberCount: row.memberCount,
  };
}

/** @returns A member row joined to its display name. */
export function toOrganizationMember(row: OrganizationMemberWithName): OrganizationMemberResponse {
  return {
    userId: row.userId,
    name: row.name,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
  };
}

/** @returns A staff grant joined to its display name. */
export function toStaffMember(row: TournamentStaffWithName): TournamentStaffMemberResponse {
  return {
    userId: row.userId,
    name: row.name,
    role: row.role,
    source: "grant",
    orgRole: null,
    addedAt: row.addedAt.toISOString(),
  };
}

/** @returns A participant joined to its linked account name. */
export function toParticipant(row: TournamentParticipantWithUser): TournamentParticipantResponse {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    displayName: row.displayName,
    riotId: row.riotId,
    status: row.status as TournamentParticipantStatus,
    seed: row.seed,
    teamId: row.teamId,
    region: row.region,
    fixedTable: row.fixedTable,
    droppedAfterRound: row.droppedAfterRound,
    // Only an unclaimed, unblocked spot has a live claim link. An already-linked
    // participant (userId set) or a blocked spot's token is dead (the claim flow
    // refuses it), so don't surface it as a copyable link.
    claimToken: row.userId === null && row.claimBlockedAt === null ? row.claimToken : null,
    claimBlocked: row.claimBlockedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** @returns The capability-module flags derived from a tournament's columns. */
export function moduleFlags(tournament: Tournament): TournamentModuleFlags {
  return {
    pairing: tournament.pairingStyle !== "none",
    deckSubmission: tournament.deckSubmission !== "none",
  };
}
