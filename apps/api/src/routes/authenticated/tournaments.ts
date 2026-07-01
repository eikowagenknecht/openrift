import { ERROR_CODES } from "@openrift/shared";
import type {
  PodPlayerResponse,
  PodTournamentDetailResponse,
  PodTournamentResponse,
  TournamentDetailResponse,
  TournamentHostInfo,
  TournamentListResponse,
  TournamentParticipantListResponse,
  TournamentParticipantStatus,
  TournamentStaffMemberResponse,
  TournamentStatus,
  TournamentSummaryResponse,
  TournamentViewerRole,
} from "@openrift/shared";
import { tournamentsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { loadGroupForMember } from "../../lib/group-access.js";
import {
  moduleFlags,
  parseAllowedSets,
  toParticipant,
  toStaffMember,
} from "../../lib/tournament-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { PodPlayer, PodTournament } from "../../repositories/pod-tournaments.js";
import type {
  Tournament,
  TournamentParticipant,
  TournamentPatch,
  TournamentSummaryRow,
} from "../../repositories/tournaments.js";
import {
  finalizeRound as finalizeRoundEngine,
  pairNextRound,
  replaceRoundPairing,
  rerollRound as rerollRoundEngine,
  submitPodResult,
} from "../../services/pod-pairing.js";
import { generateShareToken } from "../../utils/share-token.js";

// ─── Invariants (mirror the DB CHECK constraints) ──────────────────────────

/**
 * Throws 422 when the schedule instants are out of order. Cross-field, so it
 * lives at the route (the update contract's fields are all optional and can't
 * see the existing row): callers pass the *effective* post-merge values.
 */
function assertDateOrder(
  startsAt: Date,
  endsAt: Date | null,
  submissionsCloseAt: Date | null,
): void {
  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new AppError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      "The end time can't be before the start time",
    );
  }
  if (submissionsCloseAt && endsAt && submissionsCloseAt.getTime() > endsAt.getTime()) {
    throw new AppError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      "Submissions must close on or before the tournament ends",
    );
  }
}

/**
 * Forward-only lifecycle (ADR-033). `cancelled` is terminal (and additionally
 * blocked upstream by the cannot-edit-cancelled guard); every state may stay
 * itself, so an unchanged status write is always a no-op. Reaching `cancelled`
 * is normally the dedicated `cancel` endpoint, but an explicit status write to
 * it is honored too.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<TournamentStatus, readonly TournamentStatus[]> = {
  setup: ["setup", "running", "completed", "cancelled"],
  running: ["running", "completed", "cancelled"],
  completed: ["completed", "cancelled"],
  cancelled: ["cancelled"],
};

// ─── Authorization ─────────────────────────────────────────────────────────

/**
 * Loads the tournament; 404 if missing.
 * @returns The tournament row.
 */
async function loadTournament(repos: Repos, id: string): Promise<Tournament> {
  const tournament = await repos.tournaments.findById(id);
  if (!tournament) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Tournament not found");
  }
  return tournament;
}

/** @returns Whether the user is the hosting user, or an owner/manager of the host org. */
async function isHost(repos: Repos, tournament: Tournament, userId: string): Promise<boolean> {
  if (tournament.hostType === "user") {
    return tournament.hostUserId === userId;
  }
  if (tournament.hostOrgId) {
    const membership = await repos.organizations.getMembership(tournament.hostOrgId, userId);
    // Org judges have no host authority; only owners/managers host for the org.
    return membership !== undefined && membership.role !== "judge";
  }
  return false;
}

/** Throws 403 unless the user is the host or an organizer (the manage gate). */
async function requireManage(repos: Repos, tournament: Tournament, userId: string): Promise<void> {
  const allowed = await repos.tournaments.isHostOrStaff(tournament.id, userId, ["organizer"]);
  if (!allowed) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Host or organizer only");
  }
}

/**
 * Throws 403 unless the user works the event (host, organizer, or judge). Looser
 * than `requireManage`: a judge can add a walk-in (ADR-033 decision 18 — a
 * judge/host manual add is a trusted, auto-active roster path) without gaining
 * the rest of the management surface.
 */
async function requireStaff(repos: Repos, tournament: Tournament, userId: string): Promise<void> {
  const allowed = await repos.tournaments.isHostOrStaff(tournament.id, userId, [
    "organizer",
    "judge",
  ]);
  if (!allowed) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Host, organizer, or judge only");
  }
}

/** Throws 403 unless the user is the host (the host-only gate). */
async function requireHost(repos: Repos, tournament: Tournament, userId: string): Promise<void> {
  if (!(await isHost(repos, tournament, userId))) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Host only");
  }
}

/**
 * Throws 409 when the tournament can no longer accept new participants. A
 * `completed` or `cancelled` tournament is closed; `setup` and `running` stay
 * open so hosts can still add late walk-ins.
 */
function assertParticipantsOpen(tournament: Tournament): void {
  const status = tournament.status as TournamentStatus;
  if (status === "completed" || status === "cancelled") {
    throw new AppError(
      409,
      ERROR_CODES.CONFLICT,
      "Participants cannot be added to a completed or cancelled tournament",
    );
  }
}

/**
 * Loads a participant and asserts it belongs to the tournament; 404 otherwise.
 * @returns The participant row.
 */
async function loadParticipant(
  repos: Repos,
  tournamentId: string,
  participantId: string,
): Promise<TournamentParticipant> {
  const participant = await repos.tournaments.findParticipantById(participantId);
  if (!participant || participant.tournamentId !== tournamentId) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Participant not found");
  }
  return participant;
}

// ─── Builders ──────────────────────────────────────────────────────────────

/**
 * Resolves the host to a display name (and org slug for an org host).
 * @returns The resolved host info.
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

/**
 * Builds the full tournament detail, resolving host info, group slug, the
 * caller's roles, the counts, and the staff list.
 * @returns The tournament detail response.
 */
async function buildDetail(
  repos: Repos,
  tournament: Tournament,
  userId: string,
): Promise<TournamentDetailResponse> {
  const [host, counts, staffMembers, staffRoles, participant, hostFlag, hasRounds] =
    await Promise.all([
      resolveHost(repos, tournament),
      repos.tournaments.getCounts(tournament.id),
      resolveStaff(repos, tournament),
      repos.tournaments.getStaffRoles(tournament.id, userId),
      repos.tournaments.findParticipantByUser(tournament.id, userId),
      isHost(repos, tournament, userId),
      repos.tournaments.hasRounds(tournament.id),
    ]);
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
    deckSubmission: tournament.deckSubmission,
    startsAt: tournament.startsAt.toISOString(),
    endsAt: tournament.endsAt ? tournament.endsAt.toISOString() : null,
    modules: moduleFlags(tournament),
    participantCount: counts.participantCount,
    pendingRequestCount: counts.pendingRequestCount,
    myRoles,
    createdAt: tournament.createdAt.toISOString(),
    updatedAt: tournament.updatedAt.toISOString(),
    currentRound: tournament.currentRound,
    scoringScheme: tournament.scoringScheme,
    byePoints: tournament.byePoints,
    deckPhase: tournament.deckPhase,
    submissionsCloseAt: tournament.submissionsCloseAt
      ? tournament.submissionsCloseAt.toISOString()
      : null,
    listLockMode: tournament.listLockMode,
    deckFormat: tournament.deckFormat,
    allowedSets: parseAllowedSets(tournament.allowedSets),
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

/**
 * Reloads + builds the detail after a mutation.
 * @returns The fresh tournament detail response.
 */
async function detailById(
  repos: Repos,
  id: string,
  userId: string,
): Promise<TournamentDetailResponse> {
  const fresh = await loadTournament(repos, id);
  return buildDetail(repos, fresh, userId);
}

// ─── Pod-engine running surface (pairingStyle='pod') ────────────────────────
// The pod engine pairs players into 3/4-player pods and derives standings from
// finalized rounds. It is keyed by the same tournament id and reads/writes the
// shared `tournaments` / `tournament_participants` rows via `repos.podTournaments`.

/** @returns The pod-engine view of the tournament row. */
function toPodTournament(row: PodTournament): PodTournamentResponse {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    currentRound: row.currentRound,
    scoringScheme: row.scoringScheme,
    byePoints: row.byePoints,
    reportToken: row.reportToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** @returns The pod-engine view of a participant row. */
function toPodPlayer(row: PodPlayer): PodPlayerResponse {
  return {
    id: row.id,
    displayName: row.displayName,
    status: row.status,
    droppedAfterRound: row.droppedAfterRound,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Assembles the pod running payload (standings + rounds are derived). The
 * open-round snapshot (organizer warnings + manual editor) is only meaningful
 * while a round is open.
 * @returns The pod tournament detail response.
 */
async function buildPodRunDetail(
  repos: Repos,
  tournament: PodTournament,
): Promise<PodTournamentDetailResponse> {
  const [players, standings, rounds, openRound] = await Promise.all([
    repos.podTournaments.listPlayers(tournament.id),
    repos.podTournaments.computeStandings(
      tournament.id,
      tournament.scoringScheme,
      tournament.byePoints,
    ),
    repos.podTournaments.loadRounds(tournament.id, tournament.scoringScheme),
    repos.podTournaments.findOpenRound(tournament.id),
  ]);
  const openRoundSnapshot = openRound
    ? await repos.podTournaments.loadOpenRoundSnapshot(
        tournament.id,
        tournament.scoringScheme,
        tournament.byePoints,
      )
    : null;
  return {
    tournament: toPodTournament(tournament),
    players: players.map((player) => toPodPlayer(player)),
    standings,
    rounds,
    openRoundSnapshot,
  };
}

/**
 * Loads the pod tournament row (404 if missing). The engine functions and
 * `buildPodRunDetail` need the `PodTournament`-typed row from the pod repo, not
 * the unified `Tournament` row.
 * @returns The pod tournament row.
 */
async function loadPodTournament(repos: Repos, id: string): Promise<PodTournament> {
  const tournament = await repos.podTournaments.findById(id);
  if (!tournament) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Tournament not found");
  }
  return tournament;
}

/**
 * Reloads + assembles the pod running payload after a mutation.
 * @returns The fresh pod tournament detail response.
 */
async function podRunDetailById(repos: Repos, id: string): Promise<PodTournamentDetailResponse> {
  return buildPodRunDetail(repos, await loadPodTournament(repos, id));
}

/** @returns The tournament's participants as the list response. */
async function buildParticipantList(
  repos: Repos,
  tournamentId: string,
): Promise<TournamentParticipantListResponse> {
  const rows = await repos.tournaments.listParticipantsWithUser(tournamentId);
  return { items: rows.map((row) => toParticipant(row)) };
}

/**
 * Maps summary rows (with folded counts) to the list response, resolving host
 * display names, group slugs, and the caller's roles per row in batched lookups.
 * Shared by the user-scoped list and the group lens (ADR-033).
 * @param repos The repository bundle.
 * @param rows The summary rows to map.
 * @param userId The viewing user.
 * @param orgIdSet The orgs the viewer owns or manages (drives the host flag).
 * @param judgeOrgIdSet The orgs the viewer is a judge of (drives the judge role).
 * @returns The summary responses.
 */
async function buildSummaries(
  repos: Repos,
  rows: TournamentSummaryRow[],
  userId: string,
  orgIdSet: Set<string>,
  judgeOrgIdSet: Set<string>,
): Promise<TournamentSummaryResponse[]> {
  const ids = rows.map((row) => row.id);
  const [staffRows, participantTids, groupInfo] = await Promise.all([
    repos.tournaments.staffRolesAcross(ids, userId),
    repos.tournaments.participantTournamentIdsAcross(ids, userId),
    repos.tournaments.getGroupInfo(rows.flatMap((row) => (row.groupId ? [row.groupId] : []))),
  ]);
  // Resolve host display names: batch the user hosts and the org hosts.
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
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      host,
      groupId: row.groupId,
      groupSlug: row.groupId ? (groupInfo.get(row.groupId)?.slug ?? null) : null,
      groupName: row.groupId ? (groupInfo.get(row.groupId)?.name ?? null) : null,
      pairingStyle: row.pairingStyle,
      deckSubmission: row.deckSubmission,
      deckFormat: row.deckFormat,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      modules: moduleFlags(row),
      participantCount: row.participantCount,
      pendingRequestCount: row.pendingRequestCount,
      myRoles,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

/**
 * The tournament's staff: explicit `tournament_staff` grants, plus — for an
 * org-hosted tournament — the host org's members as implicit staff (owners and
 * managers as organizers, judges as judges).
 * Org membership supersedes a grant for the same user (their access can't be
 * revoked here), so a member with a redundant grant is listed once, from the
 * org. Org members come first; grant rows keep their `addedAt` order.
 * @returns The merged staff list.
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
    role: member.role === "judge" ? "judge" : "organizer",
    source: "organization",
    orgRole: member.role,
    addedAt: member.joinedAt.toISOString(),
  }));
  const grantRows = grants
    .filter((row) => !memberIds.has(row.userId))
    .map((row) => toStaffMember(row));
  return [...orgRows, ...grantRows];
}

/** @returns The tournament's staff (explicit grants + implicit org staff). */
async function buildStaffList(
  repos: Repos,
  tournament: Tournament,
): Promise<{ items: TournamentStaffMemberResponse[] }> {
  return { items: await resolveStaff(repos, tournament) };
}

const os = implement(tournamentsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The authenticated tournaments umbrella (ADR-033), mounted at
 * `/api/v1/tournaments`. Authorization composes host authority (the hosting
 * user, or an org owner/manager) with `tournament_staff` grants; the helpers
 * above enforce it. Cross-field CHECK invariants are re-validated as 422s.
 */
export const tournamentsRouter = {
  list: os.list.handler(async ({ context }): Promise<TournamentListResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    const [orgIds, judgeOrgIds] = await Promise.all([
      repos.organizations.listIdsForUser(userId),
      repos.organizations.listJudgeOrgIdsForUser(userId),
    ]);
    const rows = await repos.tournaments.listForUser(userId, [...orgIds, ...judgeOrgIds]);
    const items = await buildSummaries(repos, rows, userId, new Set(orgIds), new Set(judgeOrgIds));
    return { items };
  }),

  listForGroup: os.listForGroup.handler(
    async ({ input, context }): Promise<TournamentListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      // Group members only: 404 (not 403) when the slug is unknown or the viewer
      // is not a member, so membership is not leaked.
      const ctx = await loadGroupForMember(repos, input.slug, userId);
      const [orgIds, judgeOrgIds] = await Promise.all([
        repos.organizations.listIdsForUser(userId),
        repos.organizations.listJudgeOrgIdsForUser(userId),
      ]);
      const rows = await repos.tournaments.listForGroupWithCounts(ctx.group.id);
      const items = await buildSummaries(
        repos,
        rows,
        userId,
        new Set(orgIds),
        new Set(judgeOrgIds),
      );
      return { items };
    },
  ),

  create: os.create.handler(
    async ({ input, context, errors }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      assertDateOrder(
        new Date(input.startsAt),
        input.endsAt ? new Date(input.endsAt) : null,
        input.submissionsCloseAt ? new Date(input.submissionsCloseAt) : null,
      );

      let hostUserId: string | null = null;
      let hostOrgId: string | null = null;
      if (input.host.type === "user") {
        hostUserId = userId;
      } else {
        const org = await repos.organizations.findById(input.host.orgId);
        if (!org) {
          throw errors.NOT_FOUND({ message: "Host organization not found" });
        }
        const membership = await repos.organizations.getMembership(org.id, userId);
        if (!membership || membership.role === "judge") {
          throw new AppError(403, ERROR_CODES.FORBIDDEN, "Not an owner or manager of that org");
        }
        hostOrgId = org.id;
      }

      if (input.groupId) {
        const membership = await repos.friendGroups.getMembership(input.groupId, userId);
        if (!membership) {
          throw new AppError(403, ERROR_CODES.FORBIDDEN, "Not a member of that group");
        }
      }

      const created = await context.transact(async (txRepos) => {
        const tournament = await txRepos.tournaments.create({
          hostType: input.host.type,
          hostUserId,
          hostOrgId,
          groupId: input.groupId ?? null,
          name: input.name,
          pairingStyle: input.pairingStyle,
          scoringScheme: input.scoringScheme,
          byePoints: input.byePoints,
          deckSubmission: input.deckSubmission,
          submissionsCloseAt: input.submissionsCloseAt ? new Date(input.submissionsCloseAt) : null,
          listLockMode: input.listLockMode,
          deckFormat: input.deckFormat ?? null,
          allowedSets: input.allowedSets ?? null,
          selfRegistration: input.selfRegistration,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
        });
        // Seed the creator as organizer staff for clarity (org owner/manager are
        // implicit organizers too, but the row documents who set it up).
        await txRepos.tournaments.addStaff(tournament.id, userId, "organizer");
        // Mint the share link as soon as it's needed (open self-registration or
        // a tournament that expects decks); the host never generates it by hand.
        if ((input.selfRegistration ?? false) || input.deckSubmission !== "none") {
          await txRepos.tournaments.setSubmissionToken(tournament.id, generateShareToken());
        }
        return tournament;
      });
      return detailById(repos, created.id, userId);
    },
  ),

  get: os.get.handler(async ({ input, context }): Promise<TournamentDetailResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    const tournament = await loadTournament(repos, input.id);
    if (!(await repos.tournaments.hasRelationship(tournament.id, userId))) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Tournament not found");
    }
    return buildDetail(repos, tournament, userId);
  }),

  update: os.update.handler(
    async ({ input, context, errors }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const { id, ...patch } = input;
      const tournament = await loadTournament(repos, id);
      await requireManage(repos, tournament, userId);
      const currentStatus = tournament.status as TournamentStatus;
      if (currentStatus === "cancelled") {
        throw new AppError(409, ERROR_CODES.CONFLICT, "A cancelled tournament cannot be edited");
      }
      // Status moves follow the forward-only lifecycle; an unchanged value is a no-op.
      if (
        patch.status !== undefined &&
        patch.status !== currentStatus &&
        !ALLOWED_STATUS_TRANSITIONS[currentStatus].includes(patch.status)
      ) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          `A ${currentStatus} tournament can't move to ${patch.status}`,
        );
      }
      // The pairing engine can change only before any round exists (rounds/pods
      // depend on it).
      const pairingChanging =
        patch.pairingStyle !== undefined && patch.pairingStyle !== tournament.pairingStyle;
      if (pairingChanging && (await repos.tournaments.hasRounds(id))) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "The pairing engine can't change once a round has been generated",
        );
      }
      // Validate the merged schedule: a patch may touch only one of the three
      // instants, so the order check needs the existing row to fill the rest.
      assertDateOrder(
        patch.startsAt === undefined ? tournament.startsAt : new Date(patch.startsAt),
        patch.endsAt === undefined
          ? tournament.endsAt
          : patch.endsAt
            ? new Date(patch.endsAt)
            : null,
        patch.submissionsCloseAt === undefined
          ? tournament.submissionsCloseAt
          : patch.submissionsCloseAt
            ? new Date(patch.submissionsCloseAt)
            : null,
      );
      if (patch.groupId) {
        const membership = await repos.friendGroups.getMembership(patch.groupId, userId);
        if (!membership) {
          throw new AppError(403, ERROR_CODES.FORBIDDEN, "Not a member of that group");
        }
      }
      // Host reassignment is host-only, in any direction. The target binds to the
      // caller (personal = themselves; org = an org they belong to); the column
      // triple stays mutually exclusive so the host CHECK holds.
      let hostPatch: Pick<TournamentPatch, "hostType" | "hostUserId" | "hostOrgId"> = {};
      const hostChanging =
        patch.host !== undefined &&
        (patch.host.type !== tournament.hostType ||
          (patch.host.type === "organization" && patch.host.orgId !== tournament.hostOrgId));
      if (hostChanging && patch.host) {
        await requireHost(repos, tournament, userId);
        if (patch.host.type === "user") {
          hostPatch = { hostType: "user", hostUserId: userId, hostOrgId: null };
        } else {
          const org = await repos.organizations.findById(patch.host.orgId);
          if (!org) {
            throw errors.NOT_FOUND({ message: "Host organization not found" });
          }
          const membership = await repos.organizations.getMembership(org.id, userId);
          if (!membership || membership.role === "judge") {
            throw new AppError(403, ERROR_CODES.FORBIDDEN, "Not an owner or manager of that org");
          }
          hostPatch = { hostType: "organization", hostUserId: null, hostOrgId: org.id };
        }
      }
      await repos.tournaments.updateSettings(id, {
        ...hostPatch,
        name: patch.name,
        status: patch.status,
        pairingStyle: pairingChanging ? patch.pairingStyle : undefined,
        startsAt: patch.startsAt === undefined ? undefined : new Date(patch.startsAt),
        endsAt:
          patch.endsAt === undefined ? undefined : patch.endsAt ? new Date(patch.endsAt) : null,
        groupId: patch.groupId,
        scoringScheme: patch.scoringScheme,
        byePoints: patch.byePoints,
        deckSubmission: patch.deckSubmission,
        submissionsCloseAt:
          patch.submissionsCloseAt === undefined
            ? undefined
            : patch.submissionsCloseAt
              ? new Date(patch.submissionsCloseAt)
              : null,
        listLockMode: patch.listLockMode,
        deckFormat: patch.deckFormat,
        allowedSets: patch.allowedSets,
        selfRegistration: patch.selfRegistration,
      });
      // The follow-along report is a pod-engine surface. Leaving the pod engine
      // revokes its share token so the now-meaningless report link stops resolving
      // (the public report also gates on pairingStyle, but clearing the token keeps
      // the manage UI and any cached link honest).
      if (pairingChanging && patch.pairingStyle !== "pod") {
        if (tournament.reportToken) {
          await repos.podTournaments.setReportToken(id, null);
        }
        if (tournament.followToken) {
          await repos.podTournaments.setFollowToken(id, null);
        }
      }
      // Mint the share link the first time it's needed (self-registration opened
      // or decks now expected); turning self-registration off keeps the link.
      const willSelfRegister = patch.selfRegistration ?? tournament.selfRegistration;
      const willExpectDecks = (patch.deckSubmission ?? tournament.deckSubmission) !== "none";
      if (!tournament.submissionToken && (willSelfRegister || willExpectDecks)) {
        await repos.tournaments.setSubmissionToken(id, generateShareToken());
      }
      return detailById(repos, id, userId);
    },
  ),

  cancel: os.cancel.handler(async ({ input, context }): Promise<TournamentDetailResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    const tournament = await loadTournament(repos, input.id);
    await requireManage(repos, tournament, userId);
    await repos.tournaments.updateSettings(input.id, { status: "cancelled" });
    return detailById(repos, input.id, userId);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const userId = context.userId;
    const tournament = await loadTournament(repos, input.id);
    await requireHost(repos, tournament, userId);
    await repos.tournaments.deleteById(input.id);
  }),

  enableSubmissionToken: os.enableSubmissionToken.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.tournaments.setSubmissionToken(input.id, generateShareToken());
      return detailById(repos, input.id, userId);
    },
  ),

  disableSubmissionToken: os.disableSubmissionToken.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.tournaments.setSubmissionToken(input.id, null);
      return detailById(repos, input.id, userId);
    },
  ),

  // ── Staff ──────────────────────────────────────────────────────────────────
  listStaff: os.listStaff.handler(async ({ input, context }) => {
    const repos = context.repos;
    const userId = context.userId;
    const tournament = await loadTournament(repos, input.id);
    await requireManage(repos, tournament, userId);
    return buildStaffList(repos, tournament);
  }),

  listStaffCandidates: os.listStaffCandidates.handler(async ({ input, context }) => {
    const repos = context.repos;
    const userId = context.userId;
    const tournament = await loadTournament(repos, input.id);
    await requireManage(repos, tournament, userId);
    const items = await repos.tournaments.listStaffCandidates(tournament.id, tournament.groupId);
    return { items };
  }),

  addStaff: os.addStaff.handler(async ({ input, context }) => {
    const repos = context.repos;
    const userId = context.userId;
    const tournament = await loadTournament(repos, input.id);
    await requireManage(repos, tournament, userId);
    // Re-check eligibility server-side: only linked group members and
    // account-linked participants may be granted, so a forged id is rejected.
    const eligible = await repos.tournaments.isStaffCandidate(
      tournament.id,
      tournament.groupId,
      input.userId,
    );
    if (!eligible) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        "Only group members or participants can be added as staff",
      );
    }
    await repos.tournaments.addStaff(tournament.id, input.userId, input.role);
    return buildStaffList(repos, tournament);
  }),

  enableStaffInvite: os.enableStaffInvite.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.tournaments.setStaffInviteToken(input.id, input.role, generateShareToken());
      return detailById(repos, input.id, userId);
    },
  ),

  disableStaffInvite: os.disableStaffInvite.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.tournaments.setStaffInviteToken(input.id, input.role, null);
      return detailById(repos, input.id, userId);
    },
  ),

  removeStaff: os.removeStaff.handler(async ({ input, context }) => {
    const repos = context.repos;
    const userId = context.userId;
    const tournament = await loadTournament(repos, input.id);
    await requireManage(repos, tournament, userId);
    await repos.tournaments.removeStaff(input.id, input.userId, input.role);
    return buildStaffList(repos, tournament);
  }),

  // ── Participants ─────────────────────────────────────────────────────────
  listParticipants: os.listParticipants.handler(
    async ({ input, context }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      const allowed = await repos.tournaments.isHostOrStaff(tournament.id, userId, [
        "organizer",
        "judge",
      ]);
      if (!allowed) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Host or staff only");
      }
      return buildParticipantList(repos, input.id);
    },
  ),

  addParticipant: os.addParticipant.handler(
    async ({ input, context }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireStaff(repos, tournament, userId);
      assertParticipantsOpen(tournament);
      await repos.tournaments.createParticipant({
        tournamentId: input.id,
        displayName: input.displayName,
        status: "active",
      });
      return buildParticipantList(repos, input.id);
    },
  ),

  updateParticipant: os.updateParticipant.handler(
    async ({ input, context }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await loadParticipant(repos, input.id, input.participantId);
      await repos.tournaments.updateParticipant(input.participantId, {
        displayName: input.displayName,
        seed: input.seed,
      });
      return buildParticipantList(repos, input.id);
    },
  ),

  dropParticipant: os.dropParticipant.handler(
    async ({ input, context }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await loadParticipant(repos, input.id, input.participantId);
      await repos.tournaments.updateParticipant(input.participantId, {
        status: "dropped",
        droppedAfterRound: tournament.currentRound,
      });
      return buildParticipantList(repos, input.id);
    },
  ),

  reactivateParticipant: os.reactivateParticipant.handler(
    async ({ input, context }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await loadParticipant(repos, input.id, input.participantId);
      await repos.tournaments.updateParticipant(input.participantId, {
        status: "active",
        droppedAfterRound: null,
      });
      return buildParticipantList(repos, input.id);
    },
  ),

  approveParticipant: os.approveParticipant.handler(
    async ({ input, context, errors }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      assertParticipantsOpen(tournament);
      const participant = await loadParticipant(repos, input.id, input.participantId);
      if ((participant.status as TournamentParticipantStatus) !== "requested") {
        throw errors.CONFLICT({ message: "Only a pending request can be approved" });
      }
      await repos.tournaments.updateParticipant(input.participantId, { status: "active" });
      return buildParticipantList(repos, input.id);
    },
  ),

  denyParticipant: os.denyParticipant.handler(
    async ({ input, context, errors }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      const participant = await loadParticipant(repos, input.id, input.participantId);
      if ((participant.status as TournamentParticipantStatus) !== "requested") {
        throw errors.CONFLICT({ message: "Only a pending request can be denied" });
      }
      await repos.tournaments.deleteParticipant(input.participantId);
      return buildParticipantList(repos, input.id);
    },
  ),

  removeParticipant: os.removeParticipant.handler(
    async ({ input, context, errors }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await loadParticipant(repos, input.id, input.participantId);
      if (await repos.tournaments.participantHasMemberships(input.participantId)) {
        throw errors.CONFLICT({
          message:
            "This participant is in a paired round and cannot be removed. Drop them instead.",
        });
      }
      await repos.tournaments.deleteParticipant(input.participantId);
      return buildParticipantList(repos, input.id);
    },
  ),

  unlinkParticipant: os.unlinkParticipant.handler(
    async ({ input, context }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await loadParticipant(repos, input.id, input.participantId);
      await repos.tournaments.updateParticipant(input.participantId, {
        userId: null,
        claimedAt: null,
        claimBlockedAt: new Date(),
      });
      return buildParticipantList(repos, input.id);
    },
  ),

  reissueClaim: os.reissueClaim.handler(
    async ({ input, context }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await loadParticipant(repos, input.id, input.participantId);
      await repos.tournaments.reissueClaim(input.participantId);
      return buildParticipantList(repos, input.id);
    },
  ),

  // ── Running (pairingStyle='pod') ────────────────────────────────────────────
  // The pod pairings + standings surface, keyed by the same tournament id.
  // `runState` is readable by anyone with a relationship to the tournament (so
  // participants and judges can follow pairings/standings); the 404 mirrors the
  // `get` gate. Round-running mutations require manage authority (host, org
  // owner/manager, or organizer staff) — never owner-only.

  runState: os.runState.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadPodTournament(repos, input.id);
      if (!(await repos.tournaments.hasRelationship(input.id, userId))) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Tournament not found");
      }
      return buildPodRunDetail(repos, tournament);
    },
  ),

  generateRound: os.generateRound.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadPodTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await pairNextRound(repos, tournament, input.byes);
      return podRunDetailById(repos, input.id);
    },
  ),

  replacePairing: os.replacePairing.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadPodTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await replaceRoundPairing(repos, tournament, input.roundNumber, input.pods, input.byes);
      return podRunDetailById(repos, input.id);
    },
  ),

  rerollRound: os.rerollRound.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadPodTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await rerollRoundEngine(repos, tournament, input.roundNumber);
      return podRunDetailById(repos, input.id);
    },
  ),

  finalizeRound: os.finalizeRound.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadPodTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await finalizeRoundEngine(repos, tournament, input.roundNumber);
      return podRunDetailById(repos, input.id);
    },
  ),

  submitResult: os.submitResult.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadPodTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await submitPodResult(repos, tournament.id, input.podId, input.results, {
        allowFinalized: true,
      });
      return podRunDetailById(repos, input.id);
    },
  ),

  enableReportToken: os.enableReportToken.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.podTournaments.setReportToken(tournament.id, generateShareToken());
      return detailById(repos, input.id, userId);
    },
  ),

  disableReportToken: os.disableReportToken.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.podTournaments.setReportToken(tournament.id, null);
      return detailById(repos, input.id, userId);
    },
  ),

  enableFollowToken: os.enableFollowToken.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.podTournaments.setFollowToken(tournament.id, generateShareToken());
      return detailById(repos, input.id, userId);
    },
  ),

  disableFollowToken: os.disableFollowToken.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.podTournaments.setFollowToken(tournament.id, null);
      return detailById(repos, input.id, userId);
    },
  ),
};
