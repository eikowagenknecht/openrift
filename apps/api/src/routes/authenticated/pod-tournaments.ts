import { ERROR_CODES } from "@openrift/shared";
import type {
  PodPlayerResponse,
  PodTournamentDetailResponse,
  PodTournamentListResponse,
  PodTournamentResponse,
} from "@openrift/shared";
import { podTournamentsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { requireUserId } from "../../middleware/get-user-id.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { PodPlayer, PodTournament } from "../../repositories/pod-tournaments.js";
import {
  finalizeRound,
  pairNextRound,
  replaceRoundPairing,
  rerollRound,
  submitPodResult,
} from "../../services/pod-pairing.js";
import { generateShareToken } from "../../utils/share-token.js";

// ─── Authz + mappers ─────────────────────────────────────────────────────────

/**
 * Loads the tournament by id; 404 if missing, 403 if the viewer is not the owner.
 * @returns The owned tournament row.
 */
async function loadOwnedTournament(
  repos: Repos,
  id: string,
  userId: string,
): Promise<PodTournament> {
  const tournament = await repos.podTournaments.findById(id);
  if (!tournament) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Tournament not found");
  }
  if (tournament.ownerUserId !== userId) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Owner only");
  }
  return tournament;
}

function toTournament(row: PodTournament): PodTournamentResponse {
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

function toPlayer(row: PodPlayer): PodPlayerResponse {
  return {
    id: row.id,
    displayName: row.displayName,
    status: row.status,
    droppedAfterRound: row.droppedAfterRound,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Assembles the full owner dashboard payload (standings + rounds are derived).
 * @returns The tournament detail response.
 */
async function buildDetail(
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
  // The snapshot (for open-round warnings + the manual editor) is only meaningful
  // while a round is open, and it stays organizer-only.
  const openRoundSnapshot = openRound
    ? await repos.podTournaments.loadOpenRoundSnapshot(
        tournament.id,
        tournament.scoringScheme,
        tournament.byePoints,
      )
    : null;
  return {
    tournament: toTournament(tournament),
    players: players.map((player) => toPlayer(player)),
    standings,
    rounds,
    openRoundSnapshot,
  };
}

/**
 * Reload + assemble the detail after a mutation.
 * @returns The fresh tournament detail response.
 */
async function detailById(
  repos: Repos,
  id: string,
  userId: string,
): Promise<PodTournamentDetailResponse> {
  const fresh = await loadOwnedTournament(repos, id, userId);
  return buildDetail(repos, fresh);
}

/** 404 if the player id does not belong to the tournament (defends cross-tournament ids). */
async function ensurePlayerInTournament(
  repos: Repos,
  tournamentId: string,
  playerId: string,
): Promise<void> {
  const player = await repos.podTournaments.findPlayer(playerId);
  if (!player || player.tournamentId !== tournamentId) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Player not found");
  }
}

const os = implement(podTournamentsContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the authenticated pod-tournament contract (ADR-022),
 * mounted at `/api/v1/pod-tournaments`. Owner-only; logic unchanged from the
 * previous `@hono/zod-openapi` handlers. Not-found / not-owner / conflict states
 * are thrown as `AppError` and mapped to ORPCErrors by the handler's appErrorInterceptor.
 * The `201` `Location` header on create is dropped — no consumer read it.
 */
export const podTournamentsRouter = {
  list: os.list.handler(async ({ context }): Promise<PodTournamentListResponse> => {
    const userId = requireUserId(context.user);
    const { podTournaments } = context.repos;
    const items = await podTournaments.listForOwner(userId);
    return {
      items: items.map((row) => ({
        ...toTournament(row),
        playerCount: row.playerCount,
        activePlayerCount: row.activePlayerCount,
        roundCount: row.roundCount,
      })),
    };
  }),

  create: os.create.handler(async ({ input, context }): Promise<PodTournamentResponse> => {
    const userId = requireUserId(context.user);
    const repos = context.repos;
    const tournament = await repos.podTournaments.create({
      ownerUserId: userId,
      name: input.name,
    });
    return toTournament(tournament);
  }),

  get: os.get.handler(async ({ input, context }): Promise<PodTournamentDetailResponse> => {
    const userId = requireUserId(context.user);
    const repos = context.repos;
    const tournament = await loadOwnedTournament(repos, input.id, userId);
    return buildDetail(repos, tournament);
  }),

  update: os.update.handler(async ({ input, context }): Promise<PodTournamentDetailResponse> => {
    const userId = requireUserId(context.user);
    const repos = context.repos;
    const tournament = await loadOwnedTournament(repos, input.id, userId);
    await repos.podTournaments.update(tournament.id, {
      name: input.name,
      status: input.status,
      scoringScheme: input.scoringScheme,
      byePoints: input.byePoints,
    });
    return detailById(repos, input.id, userId);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const userId = requireUserId(context.user);
    const repos = context.repos;
    const tournament = await loadOwnedTournament(repos, input.id, userId);
    await repos.podTournaments.deleteById(tournament.id);
  }),

  addPlayer: os.addPlayer.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await repos.podTournaments.addPlayer(tournament.id, input.displayName);
      return detailById(repos, input.id, userId);
    },
  ),

  renamePlayer: os.renamePlayer.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await ensurePlayerInTournament(repos, tournament.id, input.playerId);
      await repos.podTournaments.renamePlayer(input.playerId, input.displayName);
      return detailById(repos, input.id, userId);
    },
  ),

  dropPlayer: os.dropPlayer.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await ensurePlayerInTournament(repos, tournament.id, input.playerId);
      await repos.podTournaments.dropPlayer(input.playerId, tournament.currentRound);
      return detailById(repos, input.id, userId);
    },
  ),

  reactivatePlayer: os.reactivatePlayer.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await ensurePlayerInTournament(repos, tournament.id, input.playerId);
      await repos.podTournaments.reactivatePlayer(input.playerId);
      return detailById(repos, input.id, userId);
    },
  ),

  removePlayer: os.removePlayer.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await ensurePlayerInTournament(repos, tournament.id, input.playerId);
      if (await repos.podTournaments.playerHasMemberships(input.playerId)) {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "This player is in a paired round and cannot be removed; drop them instead.",
        );
      }
      await repos.podTournaments.deletePlayer(input.playerId);
      return detailById(repos, input.id, userId);
    },
  ),

  generateRound: os.generateRound.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await pairNextRound(repos, tournament, input.byes);
      return detailById(repos, input.id, userId);
    },
  ),

  replacePairing: os.replacePairing.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await replaceRoundPairing(repos, tournament, input.roundNumber, input.pods, input.byes);
      return detailById(repos, input.id, userId);
    },
  ),

  rerollRound: os.rerollRound.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await rerollRound(repos, tournament, input.roundNumber);
      return detailById(repos, input.id, userId);
    },
  ),

  finalizeRound: os.finalizeRound.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await finalizeRound(repos, tournament, input.roundNumber);
      return detailById(repos, input.id, userId);
    },
  ),

  submitResult: os.submitResult.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await submitPodResult(repos, tournament.id, input.podId, input.results, {
        allowFinalized: true,
      });
      return detailById(repos, input.id, userId);
    },
  ),

  enableReportToken: os.enableReportToken.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await repos.podTournaments.setReportToken(tournament.id, generateShareToken());
      return detailById(repos, input.id, userId);
    },
  ),

  disableReportToken: os.disableReportToken.handler(
    async ({ input, context }): Promise<PodTournamentDetailResponse> => {
      const userId = requireUserId(context.user);
      const repos = context.repos;
      const tournament = await loadOwnedTournament(repos, input.id, userId);
      await repos.podTournaments.setReportToken(tournament.id, null);
      return detailById(repos, input.id, userId);
    },
  ),
};
