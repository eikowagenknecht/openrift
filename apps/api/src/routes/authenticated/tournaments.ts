import { ERROR_CODES } from "@openrift/shared";
import type {
  PodTournamentDetailResponse,
  TournamentDetailResponse,
  TournamentListResponse,
  TournamentParticipantListResponse,
} from "@openrift/shared";
import { tournamentsContract } from "@openrift/shared/contracts/tournaments";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { loadGroupForMember } from "../../lib/group-access.js";
import { buildPodRunDetail, podRunDetailById } from "../../lib/pod-tournament-builders.js";
import { generateShareToken } from "../../lib/share-token.js";
import {
  loadParticipant,
  loadTournament,
  requireHost,
  requireManage,
  requireStaff,
  resolveOrgHost,
} from "../../lib/tournament-access.js";
import type { TournamentHostColumns } from "../../lib/tournament-access.js";
import {
  buildDetail,
  buildParticipantList,
  buildStaffList,
  buildSummaries,
  detailById,
} from "../../lib/tournament-builders.js";
import {
  assertDateOrder,
  assertParticipantsOpen,
  assertPlayModeCompatible,
  assertStatusTransition,
  assertValidRegion,
} from "../../lib/tournament-invariants.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { TournamentParticipant } from "../../repositories/tournaments.js";
import {
  finalizeRound as finalizeRoundEngine,
  pairNextRound,
  replaceRoundPairing,
  rerollRound as rerollRoundEngine,
  submitPodResult,
} from "../../services/pod-pairing.js";

/**
 * The active teammate of a teamed participant, or undefined (no team, or the
 * partner is not active). Handler-local: only the drop path needs it.
 * @returns The teammate's participant row, or undefined.
 */
async function findActiveTeammate(
  repos: Repos,
  tournamentId: string,
  participant: TournamentParticipant,
): Promise<TournamentParticipant | undefined> {
  if (participant.teamId === null) {
    return undefined;
  }
  const participants = await repos.tournaments.listParticipants(tournamentId);
  return participants.find(
    (row) =>
      row.teamId === participant.teamId && row.id !== participant.id && row.status === "active",
  );
}

const os = implement(tournamentsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The authenticated tournaments umbrella (ADR-033), mounted at
 * `/api/v1/tournaments`. The handlers here own request shape and ordering only;
 * the three concerns they compose live in `lib/`, where each is reachable from
 * a test without mounting a route:
 * - `tournament-access.ts` — the loaders, the host/organizer/judge gates, and
 *   org-host resolution.
 * - `tournament-invariants.ts` — the cross-field CHECK mirrors, re-validated
 *   as 422s (and the status lifecycle as a 409).
 * - `tournament-builders.ts` / `pod-tournament-builders.ts` — response assembly.
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

  create: os.create.handler(async ({ input, context }): Promise<TournamentDetailResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    assertDateOrder(
      new Date(input.startsAt),
      input.endsAt ? new Date(input.endsAt) : null,
      input.submissionsCloseAt ? new Date(input.submissionsCloseAt) : null,
    );
    assertPlayModeCompatible(
      input.playMode ?? "1v1",
      input.pairingStyle,
      input.regionsEnabled ?? false,
    );

    const host: TournamentHostColumns =
      input.host.type === "user"
        ? { hostType: "user", hostUserId: userId, hostOrgId: null }
        : await resolveOrgHost(repos, input.host.orgId, userId);

    if (input.groupId) {
      const membership = await repos.friendGroups.getMembership(input.groupId, userId);
      if (!membership) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, "Not a member of that group");
      }
    }

    const created = await context.transact(async (txRepos) => {
      const tournament = await txRepos.tournaments.create({
        ...host,
        groupId: input.groupId ?? null,
        name: input.name,
        pairingStyle: input.pairingStyle,
        playMode: input.playMode,
        scoringScheme: input.scoringScheme,
        byePoints: input.byePoints,
        matchFormat: input.matchFormat,
        winPoints: input.winPoints,
        drawPoints: input.drawPoints,
        regionsEnabled: input.regionsEnabled,
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
  }),

  get: os.get.handler(async ({ input, context }): Promise<TournamentDetailResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    const tournament = await loadTournament(repos, input.id);
    if (!(await repos.tournaments.hasRelationship(tournament.id, userId))) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Tournament not found");
    }
    return buildDetail(repos, tournament, userId);
  }),

  update: os.update.handler(async ({ input, context }): Promise<TournamentDetailResponse> => {
    const repos = context.repos;
    const userId = context.userId;
    const { id, ...patch } = input;
    const tournament = await loadTournament(repos, id);
    await requireManage(repos, tournament, userId);
    const currentStatus = tournament.status;
    if (currentStatus === "cancelled") {
      throw new AppError(409, ERROR_CODES.CONFLICT, "A cancelled tournament cannot be edited");
    }
    // Status moves follow the forward-only lifecycle; an unchanged value is a no-op.
    assertStatusTransition(currentStatus, patch.status);
    // The pairing engine can change only before any round exists (rounds/pods
    // depend on it).
    const pairingChanging =
      patch.pairingStyle !== undefined && patch.pairingStyle !== tournament.pairingStyle;
    // The match format shapes result entry, so it is frozen alongside the
    // pairing engine once rounds exist. The play mode shapes both, so it
    // freezes with them.
    const matchFormatChanging =
      patch.matchFormat !== undefined && patch.matchFormat !== tournament.matchFormat;
    const playModeChanging = patch.playMode !== undefined && patch.playMode !== tournament.playMode;
    if (
      (pairingChanging || matchFormatChanging || playModeChanging) &&
      (await repos.tournaments.hasRounds(id))
    ) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "The pairing engine can't change once a round has been generated",
      );
    }
    assertPlayModeCompatible(
      patch.playMode ?? tournament.playMode,
      patch.pairingStyle ?? tournament.pairingStyle,
      patch.regionsEnabled ?? tournament.regionsEnabled,
    );
    // Validate the merged schedule: a patch may touch only one of the three
    // instants, so the order check needs the existing row to fill the rest.
    assertDateOrder(
      patch.startsAt === undefined ? tournament.startsAt : new Date(patch.startsAt),
      patch.endsAt === undefined ? tournament.endsAt : patch.endsAt ? new Date(patch.endsAt) : null,
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
    // caller (personal = themselves; org = an org they belong to).
    let hostPatch: Partial<TournamentHostColumns> = {};
    const hostChanging =
      patch.host !== undefined &&
      (patch.host.type !== tournament.hostType ||
        (patch.host.type === "organization" && patch.host.orgId !== tournament.hostOrgId));
    if (hostChanging && patch.host) {
      await requireHost(repos, tournament, userId);
      hostPatch =
        patch.host.type === "user"
          ? { hostType: "user", hostUserId: userId, hostOrgId: null }
          : await resolveOrgHost(repos, patch.host.orgId, userId);
    }
    await repos.tournaments.updateSettings(id, {
      ...hostPatch,
      name: patch.name,
      status: patch.status,
      pairingStyle: pairingChanging ? patch.pairingStyle : undefined,
      playMode: playModeChanging ? patch.playMode : undefined,
      startsAt: patch.startsAt === undefined ? undefined : new Date(patch.startsAt),
      endsAt: patch.endsAt === undefined ? undefined : patch.endsAt ? new Date(patch.endsAt) : null,
      groupId: patch.groupId,
      scoringScheme: patch.scoringScheme,
      byePoints: patch.byePoints,
      matchFormat: matchFormatChanging ? patch.matchFormat : undefined,
      winPoints: patch.winPoints,
      drawPoints: patch.drawPoints,
      regionsEnabled: patch.regionsEnabled,
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
    // Leaving 2v2 dissolves the (never-played — the rounds guard above)
    // teams, so no stale team ids survive into 1v1 responses.
    if (playModeChanging && patch.playMode === "1v1") {
      await repos.podTournaments.dissolveAllTeams(id);
    }
    // The follow-along report is a pod-engine surface. Leaving the pod engine
    // revokes its share token so the now-meaningless report link stops resolving
    // (the public report also gates on pairingStyle, but clearing the token keeps
    // the manage UI and any cached link honest).
    if (pairingChanging && patch.pairingStyle !== "pod" && patch.pairingStyle !== "swiss") {
      if (tournament.reportToken) {
        await repos.tournaments.setReportToken(id, null);
      }
      if (tournament.followToken) {
        await repos.tournaments.setFollowToken(id, null);
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
  }),

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
      await assertValidRegion(repos, input.region);
      await repos.tournaments.createParticipant({
        tournamentId: input.id,
        displayName: input.displayName,
        region: input.region ?? null,
        fixedTable: input.fixedTable ?? null,
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
      // Region assignment is judge work (checking decks against the entered
      // region is part of deck check), so a region-only patch needs staff, not
      // manage. Name/seed/fixed-table edits stay organizer/host-only.
      const touchesManagedFields =
        input.displayName !== undefined ||
        input.seed !== undefined ||
        input.fixedTable !== undefined;
      await (touchesManagedFields
        ? requireManage(repos, tournament, userId)
        : requireStaff(repos, tournament, userId));
      await loadParticipant(repos, input.id, input.participantId);
      await assertValidRegion(repos, input.region);
      await repos.tournaments.updateParticipant(input.participantId, {
        displayName: input.displayName,
        seed: input.seed,
        region: input.region,
        fixedTable: input.fixedTable,
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
      const participant = await loadParticipant(repos, input.id, input.participantId);
      await repos.tournaments.updateParticipant(input.participantId, {
        status: "dropped",
        droppedAfterRound: tournament.currentRound,
      });
      // Dropping half a fixed team drops the whole team: 2v2 has no
      // substitutes and a lone partner can never be paired.
      if (tournament.playMode === "2v2" && participant.teamId !== null) {
        const teammate = await findActiveTeammate(repos, input.id, participant);
        if (teammate) {
          await repos.tournaments.updateParticipant(teammate.id, {
            status: "dropped",
            droppedAfterRound: tournament.currentRound,
          });
        }
      }
      return buildParticipantList(repos, input.id);
    },
  ),

  reactivateParticipant: os.reactivateParticipant.handler(
    async ({ input, context }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      const participant = await loadParticipant(repos, input.id, input.participantId);
      await repos.tournaments.updateParticipant(input.participantId, {
        status: "active",
        droppedAfterRound: null,
      });
      // Team drops are symmetric (see dropParticipant), so a team returns
      // whole too: bring the dropped teammate back with them.
      if (tournament.playMode === "2v2" && participant.teamId !== null) {
        const participants = await repos.tournaments.listParticipants(input.id);
        const teammate = participants.find(
          (row) =>
            row.teamId === participant.teamId &&
            row.id !== participant.id &&
            row.status === "dropped",
        );
        if (teammate) {
          await repos.tournaments.updateParticipant(teammate.id, {
            status: "active",
            droppedAfterRound: null,
          });
        }
      }
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
      if (participant.status !== "requested") {
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
      if (participant.status !== "requested") {
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

  // ── Teams (2v2 play mode) ───────────────────────────────────────────────
  createTeam: os.createTeam.handler(
    async ({ input, context, errors }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      if (tournament.playMode !== "2v2") {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Teams exist only in 2v2 tournaments.");
      }
      const [firstId, secondId] = input.participantIds;
      if (firstId === secondId || firstId === undefined || secondId === undefined) {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, "A team needs two different players.");
      }
      const members = await Promise.all([
        loadParticipant(repos, input.id, firstId),
        loadParticipant(repos, input.id, secondId),
      ]);
      for (const member of members) {
        if (member.status !== "active") {
          throw new AppError(
            400,
            ERROR_CODES.BAD_REQUEST,
            "Only active participants can join a team.",
          );
        }
        if (member.teamId !== null) {
          throw errors.CONFLICT({ message: `${member.displayName} is already on a team` });
        }
      }
      await repos.podTournaments.createTeam(input.id, [firstId, secondId]);
      return buildParticipantList(repos, input.id);
    },
  ),

  dissolveTeam: os.dissolveTeam.handler(
    async ({ input, context, errors }): Promise<TournamentParticipantListResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      const team = await repos.podTournaments.findTeam(input.teamId);
      if (!team || team.tournamentId !== input.id) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Team not found");
      }
      // A team that has played is part of the recorded rounds; standings and
      // rematch history would silently degrade if it fell apart.
      if (await repos.podTournaments.teamHasMemberships(input.teamId)) {
        throw errors.CONFLICT({ message: "A team that has played a round cannot be dissolved" });
      }
      await repos.podTournaments.dissolveTeam(input.teamId);
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
      const tournament = await loadTournament(repos, input.id);
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
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await pairNextRound(repos, tournament, input.byes);
      return podRunDetailById(repos, input.id);
    },
  ),

  replacePairing: os.replacePairing.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await replaceRoundPairing(repos, tournament, input.roundNumber, input.pods, input.byes);
      return podRunDetailById(repos, input.id);
    },
  ),

  rerollRound: os.rerollRound.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await rerollRoundEngine(repos, tournament, input.roundNumber);
      return podRunDetailById(repos, input.id);
    },
  ),

  finalizeRound: os.finalizeRound.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await finalizeRoundEngine(repos, tournament, input.roundNumber);
      return podRunDetailById(repos, input.id);
    },
  ),

  submitResult: os.submitResult.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
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
      await repos.tournaments.setReportToken(tournament.id, generateShareToken());
      return detailById(repos, input.id, userId);
    },
  ),

  disableReportToken: os.disableReportToken.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.tournaments.setReportToken(tournament.id, null);
      return detailById(repos, input.id, userId);
    },
  ),

  enableFollowToken: os.enableFollowToken.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.tournaments.setFollowToken(tournament.id, generateShareToken());
      return detailById(repos, input.id, userId);
    },
  ),

  disableFollowToken: os.disableFollowToken.handler(
    async ({ input, context }): Promise<TournamentDetailResponse> => {
      const repos = context.repos;
      const userId = context.userId;
      const tournament = await loadTournament(repos, input.id);
      await requireManage(repos, tournament, userId);
      await repos.tournaments.setFollowToken(tournament.id, null);
      return detailById(repos, input.id, userId);
    },
  ),
};
