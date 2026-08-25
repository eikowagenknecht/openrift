import { effectiveTournamentState } from "@openrift/shared";
import type {
  TournamentCoverLegend,
  TournamentDetailResponse,
  TournamentHostInfo,
  TournamentParticipantListResponse,
  TournamentParticipantPreview,
  TournamentStaffMemberResponse,
  TournamentSummaryResponse,
  TournamentViewerRole,
  TournamentWinner,
} from "@openrift/shared";
import {
  TOURNAMENT_COVER_LEGEND_COUNT,
  TOURNAMENT_PARTICIPANT_PREVIEW_COUNT,
} from "@openrift/shared/contracts/tournaments";

import type { Repos } from "../deps.js";
import type { Tournament, TournamentSummaryRow } from "../repositories/tournaments.js";
import { gravatarHashForEmail } from "./gravatar.js";
import { hasOrgRole } from "./org-access.js";
import { isHost, loadTournament } from "./tournament-access.js";
import { moduleFlags, toParticipant, toStaffMember } from "./tournament-presenters.js";

/**
 * Response assembly for the tournaments umbrella. Where
 * `tournament-presenters.ts` maps one row to one response, everything here
 * reads the repos to compose a whole payload. It sits outside the router so
 * the assembly is reachable from a test without mounting a route.
 */

async function resolveHost(repos: Repos, tournament: Tournament): Promise<TournamentHostInfo> {
  if (tournament.hostType === "user") {
    const names = tournament.hostUserId
      ? await repos.tournaments.getUserNames([tournament.hostUserId])
      : new Map<string, string | null>();
    return {
      type: "user",
      userId: tournament.hostUserId,
      orgId: null,
      displayName: (tournament.hostUserId && names.get(tournament.hostUserId)) || "User",
      orgSlug: null,
    };
  }
  const org = tournament.hostOrgId
    ? await repos.organizations.findById(tournament.hostOrgId)
    : undefined;
  return {
    type: "organization",
    userId: null,
    orgId: tournament.hostOrgId,
    displayName: org?.name ?? "Organization",
    orgSlug: org?.slug ?? null,
  };
}

interface SummaryExtras {
  participantPreview: TournamentParticipantPreview[];
  winner: TournamentWinner | null;
  coverLegends: TournamentCoverLegend[];
}

/**
 * Batch-loads the visual extras for a set of tournaments: the facepile
 * preview, the standings winner (completed paired tournaments only), and the
 * cover legends for the card fan (publishing-consented decks only). Every id
 * gets an entry, so callers can spread the result unconditionally.
 */
async function loadSummaryExtras(
  repos: Repos,
  rows: Pick<
    Tournament,
    | "id"
    | "status"
    | "pairingStyle"
    | "playMode"
    | "scoringScheme"
    | "byePoints"
    | "winPoints"
    | "drawPoints"
    | "startsAt"
    | "endsAt"
  >[],
): Promise<Map<string, SummaryExtras>> {
  const ids = rows.map((row) => row.id);
  // A winner only exists once the tournament is effectively over and rounds
  // were paired (pod or Swiss). Completion is date-derived (the stored status
  // stays `running` unless the host acts), so use the same shared rule the
  // web lists sort by.
  const completed = rows.filter(
    (row) =>
      row.pairingStyle !== "none" &&
      effectiveTournamentState(
        row.startsAt.toISOString(),
        row.endsAt ? row.endsAt.toISOString() : null,
        row.status,
      ) === "completed",
  );
  const [previewRows, coverRows, winners] = await Promise.all([
    repos.tournaments.participantPreviewAcross(ids, TOURNAMENT_PARTICIPANT_PREVIEW_COUNT),
    repos.deckCheck.coverLegendsAcross(ids, TOURNAMENT_COVER_LEGEND_COUNT),
    repos.podTournaments.winnersAcross(
      completed.map((row) => ({
        id: row.id,
        scoring: {
          scheme: row.scoringScheme,
          byePoints: row.byePoints,
          winPoints: row.winPoints,
          drawPoints: row.drawPoints,
          playMode: row.playMode,
        },
      })),
    ),
  ]);
  const winnerLegends = await repos.deckCheck.legendImagesForParticipants(
    [...winners.values()].map((winner) => winner.participantId),
  );
  const previews = Map.groupBy(previewRows, (row) => row.tournamentId);
  const covers = Map.groupBy(coverRows, (row) => row.tournamentId);
  return new Map(
    ids.map((id) => {
      const winner = winners.get(id);
      return [
        id,
        {
          participantPreview: (previews.get(id) ?? []).map((row) => ({
            name: row.displayName,
            image: row.image,
            gravatarHash: row.email ? gravatarHashForEmail(row.email) : null,
          })),
          winner: winner
            ? {
                name: winner.displayName,
                legendImageId: winnerLegends.get(winner.participantId) ?? null,
              }
            : null,
          coverLegends: (covers.get(id) ?? []).map((row) => ({
            printingId: row.printingId,
            imageId: row.imageId,
          })),
        },
      ];
    }),
  );
}

const EMPTY_EXTRAS: SummaryExtras = { participantPreview: [], winner: null, coverLegends: [] };

/**
 * The tournament's staff: explicit `tournament_staff` grants, plus — for an
 * org-hosted tournament — the host org's members as implicit staff.
 * Org membership supersedes a grant for the same user (their access can't be
 * revoked here), so a member with a redundant grant is listed once, from the
 * org. Org members come first; grant rows keep their `addedAt` order.
 */
async function resolveStaff(
  repos: Repos,
  tournament: Tournament,
): Promise<TournamentStaffMemberResponse[]> {
  const grants = await repos.tournaments.listStaffWithNames(tournament.id);
  if (tournament.hostType !== "organization" || !tournament.hostOrgId) {
    return grants.map((row) => toStaffMember(row));
  }
  const members = await repos.organizations.listMembers(tournament.hostOrgId);
  const memberIds = new Set(members.map((member) => member.userId));
  const orgRows: TournamentStaffMemberResponse[] = members.map((member) => ({
    userId: member.userId,
    name: member.name,
    // owner/manager are implicit organizers; an org judge is an implicit judge.
    role: hasOrgRole(member.role, "manager") ? "organizer" : "judge",
    source: "organization",
    orgRole: member.role,
    addedAt: member.joinedAt.toISOString(),
  }));
  const grantRows = grants
    .filter((row) => !memberIds.has(row.userId))
    .map((row) => toStaffMember(row));
  return [...orgRows, ...grantRows];
}

export async function buildStaffList(
  repos: Repos,
  tournament: Tournament,
): Promise<{ items: TournamentStaffMemberResponse[] }> {
  return { items: await resolveStaff(repos, tournament) };
}

export async function buildParticipantList(
  repos: Repos,
  tournamentId: string,
): Promise<TournamentParticipantListResponse> {
  const rows = await repos.tournaments.listParticipantsWithUser(tournamentId);
  return { items: rows.map((row) => toParticipant(row)) };
}

export async function buildDetail(
  repos: Repos,
  tournament: Tournament,
  userId: string,
): Promise<TournamentDetailResponse> {
  const [
    host,
    counts,
    staffMembers,
    staffRoles,
    participant,
    hostFlag,
    hasRounds,
    extrasMap,
    deckEntry,
  ] = await Promise.all([
    resolveHost(repos, tournament),
    repos.tournaments.getCounts(tournament.id),
    resolveStaff(repos, tournament),
    repos.tournaments.getStaffRoles(tournament.id, userId),
    repos.tournaments.findParticipantByUser(tournament.id, userId),
    isHost(repos, tournament, userId),
    repos.tournaments.hasRounds(tournament.id),
    loadSummaryExtras(repos, [tournament]),
    // The viewer's own deck, for the My deck tile and the deck route's guard.
    // Skipped entirely when the tournament takes no lists, so the common
    // no-decks case pays nothing.
    tournament.deckSubmission === "none"
      ? undefined
      : repos.deckCheck.getEntryForPlayerByTournament(tournament.id, userId),
  ]);
  const extras = extrasMap.get(tournament.id) ?? EMPTY_EXTRAS;
  let groupSlug: string | null = null;
  let groupName: string | null = null;
  if (tournament.groupId) {
    const info = await repos.tournaments.getGroupInfo([tournament.groupId]);
    const group = info.get(tournament.groupId);
    groupSlug = group?.slug ?? null;
    groupName = group?.name ?? null;
  }

  const myRoles: TournamentViewerRole[] = [];
  if (hostFlag) {
    myRoles.push("host");
  }
  for (const role of staffRoles) {
    myRoles.push(role);
  }
  // An org judge is an implicit judge on the org's tournaments (no host role).
  if (!hostFlag && tournament.hostType === "organization" && tournament.hostOrgId) {
    const membership = await repos.organizations.getMembership(tournament.hostOrgId, userId);
    if (membership?.role === "judge" && !myRoles.includes("judge")) {
      myRoles.push("judge");
    }
  }
  if (participant) {
    myRoles.push("participant");
  }

  // Token visibility, scoped to the least authority that legitimately needs each.
  // Without this gate any viewer who passes `hasRelationship` (a `requested`
  // participant, or any linked-group member) could harvest the staff-invite
  // tokens from the detail response and self-promote via `claimStaffInvite` —
  // a participant/group-member → judge → organizer privilege escalation.
  const isOrganizer = hostFlag || staffRoles.includes("organizer");
  const isStaff = isOrganizer || staffRoles.includes("judge");
  // Staff-invite links mint new staff, so only an organizer/host may see them.
  const organizerInviteToken = isOrganizer ? tournament.organizerInviteToken : null;
  const judgeInviteToken = isOrganizer ? tournament.judgeInviteToken : null;
  // Operational share links (result reporting, deck submission) are usable by
  // any staff member but must not leak to plain participants or group members.
  const reportToken = isStaff ? tournament.reportToken : null;
  const followToken = isStaff ? tournament.followToken : null;
  const submissionToken = isStaff ? tournament.submissionToken : null;
  // The staff roster (identities, names, org roles) is manage-gated on its own
  // `listStaff` route, so mirror that here: a plain participant or group member
  // must not enumerate the staff through the detail payload.
  const staff = isOrganizer ? staffMembers : [];

  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    host,
    groupId: tournament.groupId,
    groupSlug,
    groupName,
    pairingStyle: tournament.pairingStyle,
    playMode: tournament.playMode,
    deckSubmission: tournament.deckSubmission,
    startsAt: tournament.startsAt.toISOString(),
    endsAt: tournament.endsAt ? tournament.endsAt.toISOString() : null,
    modules: moduleFlags(tournament),
    participantCount: counts.participantCount,
    pendingRequestCount: counts.pendingRequestCount,
    myRoles,
    myDeckEntry: deckEntry
      ? {
          id: deckEntry.id,
          state: deckEntry.state,
          reviewOutcome: deckEntry.reviewOutcome,
          unlockRequested: deckEntry.unlockRequestedAt !== null,
          hasPlayerMessage: deckEntry.playerMessage !== null,
        }
      : null,
    participantPreview: extras.participantPreview,
    winner: extras.winner,
    coverLegends: extras.coverLegends,
    createdAt: tournament.createdAt.toISOString(),
    updatedAt: tournament.updatedAt.toISOString(),
    currentRound: tournament.currentRound,
    scoringScheme: tournament.scoringScheme,
    byePoints: tournament.byePoints,
    matchFormat: tournament.matchFormat,
    winPoints: tournament.winPoints,
    drawPoints: tournament.drawPoints,
    regionsEnabled: tournament.regionsEnabled,
    deckPhase: tournament.deckPhase,
    submissionsCloseAt: tournament.submissionsCloseAt
      ? tournament.submissionsCloseAt.toISOString()
      : null,
    listLockMode: tournament.listLockMode,
    deckFormat: tournament.deckFormat,
    allowedSets: tournament.allowedSets,
    selfRegistration: tournament.selfRegistration,
    reportToken,
    followToken,
    submissionToken,
    organizerInviteToken,
    judgeInviteToken,
    staff,
    hasRounds,
  };
}

export async function detailById(
  repos: Repos,
  id: string,
  userId: string,
): Promise<TournamentDetailResponse> {
  const fresh = await loadTournament(repos, id);
  return buildDetail(repos, fresh, userId);
}

/**
 * Maps summary rows to the list response. `orgIdSet` is the orgs the viewer
 * owns or manages (drives the host flag); `judgeOrgIdSet` the orgs the viewer
 * is a judge of (drives the judge role).
 */
export async function buildSummaries(
  repos: Repos,
  rows: TournamentSummaryRow[],
  userId: string,
  orgIdSet: Set<string>,
  judgeOrgIdSet: Set<string>,
): Promise<TournamentSummaryResponse[]> {
  const ids = rows.map((row) => row.id);
  const [staffRows, participantTids, groupInfo, extrasMap] = await Promise.all([
    repos.tournaments.staffRolesAcross(ids, userId),
    repos.tournaments.participantTournamentIdsAcross(ids, userId),
    repos.tournaments.getGroupInfo(rows.flatMap((row) => (row.groupId ? [row.groupId] : []))),
    loadSummaryExtras(repos, rows),
  ]);
  const hostUserIds = rows.flatMap((row) =>
    row.hostType === "user" && row.hostUserId ? [row.hostUserId] : [],
  );
  const hostOrgIds = rows.flatMap((row) => (row.hostOrgId ? [row.hostOrgId] : []));
  const [hostNames, hostOrgs] = await Promise.all([
    repos.tournaments.getUserNames(hostUserIds),
    repos.organizations.findByIds(hostOrgIds),
  ]);
  const orgsById = new Map(hostOrgs.map((org) => [org.id, org]));
  const staffByTournament = new Map<string, TournamentViewerRole[]>();
  for (const row of staffRows) {
    const list = staffByTournament.get(row.tournamentId) ?? [];
    list.push(row.role);
    staffByTournament.set(row.tournamentId, list);
  }
  const participantSet = new Set(participantTids);

  return rows.map((row) => {
    const host: TournamentHostInfo =
      row.hostType === "user"
        ? {
            type: "user",
            userId: row.hostUserId,
            orgId: null,
            displayName: (row.hostUserId && hostNames.get(row.hostUserId)) || "User",
            orgSlug: null,
          }
        : {
            type: "organization",
            userId: null,
            orgId: row.hostOrgId,
            displayName: (row.hostOrgId && orgsById.get(row.hostOrgId)?.name) || "Organization",
            orgSlug: (row.hostOrgId && orgsById.get(row.hostOrgId)?.slug) ?? null,
          };
    const myRoles: TournamentViewerRole[] = [];
    const hostFlag =
      (row.hostType === "user" && row.hostUserId === userId) ||
      (row.hostType === "organization" && row.hostOrgId !== null && orgIdSet.has(row.hostOrgId));
    if (hostFlag) {
      myRoles.push("host");
    }
    for (const role of staffByTournament.get(row.id) ?? []) {
      myRoles.push(role);
    }
    // An org judge is an implicit judge on the org's tournaments (no host role).
    if (
      !hostFlag &&
      row.hostType === "organization" &&
      row.hostOrgId !== null &&
      judgeOrgIdSet.has(row.hostOrgId) &&
      !myRoles.includes("judge")
    ) {
      myRoles.push("judge");
    }
    if (participantSet.has(row.id)) {
      myRoles.push("participant");
    }
    const extras = extrasMap.get(row.id) ?? EMPTY_EXTRAS;
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      host,
      groupId: row.groupId,
      groupSlug: row.groupId ? (groupInfo.get(row.groupId)?.slug ?? null) : null,
      groupName: row.groupId ? (groupInfo.get(row.groupId)?.name ?? null) : null,
      pairingStyle: row.pairingStyle,
      playMode: row.playMode,
      deckSubmission: row.deckSubmission,
      deckFormat: row.deckFormat,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      modules: moduleFlags(row),
      participantCount: row.participantCount,
      pendingRequestCount: row.pendingRequestCount,
      myRoles,
      participantPreview: extras.participantPreview,
      winner: extras.winner,
      coverLegends: extras.coverLegends,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
