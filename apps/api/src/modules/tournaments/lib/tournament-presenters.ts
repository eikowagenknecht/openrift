import type {
  PodPlayerResponse,
  PodTournamentResponse,
} from "@openrift/shared/types/api/pod-tournament";
import type {
  OrganizationMemberResponse,
  OrganizationResponse,
  OrganizationSummaryResponse,
  TournamentModuleFlags,
  TournamentParticipantResponse,
  TournamentParticipantStatus,
  TournamentStaffMemberResponse,
} from "@openrift/shared/types/api/tournament";

import type {
  Organization,
  OrganizationMemberWithName,
  OrganizationSummary,
} from "../repositories/organizations.js";
import type { PodRosterPlayer } from "../repositories/pod-tournaments-shared.js";
import type { TournamentParticipantWithUser } from "../repositories/tournaments-participants.js";
import type { Tournament } from "../repositories/tournaments-shared.js";
import type { TournamentStaffWithName } from "../repositories/tournaments-staff.js";

/**
 * Pure row → response mappers for the tournaments umbrella and its
 * organizations. Everything here is a total function of its argument;
 * anything that has to read the repos to assemble a payload lives in the
 * sibling `*-builders.ts` modules instead.
 */

export function toOrganizationResponse(org: Organization): OrganizationResponse {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    description: org.description,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

export function toOrganizationSummary(row: OrganizationSummary): OrganizationSummaryResponse {
  return {
    ...toOrganizationResponse(row),
    ownerName: row.ownerName,
    memberCount: row.memberCount,
  };
}

export function toOrganizationMember(row: OrganizationMemberWithName): OrganizationMemberResponse {
  return {
    userId: row.userId,
    name: row.name,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
  };
}

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
    // Null once the spot is linked (userId set) or judge-blocked; the claim
    // flow refuses the token in both cases.
    claimToken: row.userId === null && row.claimBlockedAt === null ? row.claimToken : null,
    claimBlocked: row.claimBlockedAt !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function moduleFlags(tournament: Tournament): TournamentModuleFlags {
  return {
    pairing: tournament.pairingStyle !== "none",
    deckSubmission: tournament.deckSubmission !== "none",
  };
}

export function toPodTournament(row: Tournament): PodTournamentResponse {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    currentRound: row.currentRound,
    pairingStyle: row.pairingStyle,
    playMode: row.playMode,
    scoringScheme: row.scoringScheme,
    byePoints: row.byePoints,
    matchFormat: row.matchFormat,
    winPoints: row.winPoints,
    drawPoints: row.drawPoints,
    regionsEnabled: row.regionsEnabled,
    reportToken: row.reportToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPodPlayer(row: PodRosterPlayer): PodPlayerResponse {
  return {
    id: row.id,
    displayName: row.displayName,
    status: row.status,
    droppedAfterRound: row.droppedAfterRound,
    teamId: row.teamId,
    createdAt: row.createdAt.toISOString(),
  };
}
