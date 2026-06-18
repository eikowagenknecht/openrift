import { createRoute, z } from "@hono/zod-openapi";
import { ERROR_CODES } from "@openrift/shared";
import type {
  PodPlayerResponse,
  PodTournamentDetailResponse,
  PodTournamentListResponse,
  PodTournamentResponse,
} from "@openrift/shared";
import {
  podTournamentDetailResponseSchema,
  podTournamentListResponseSchema,
  podTournamentResponseSchema,
} from "@openrift/shared/response-schemas";
import {
  addPodPlayerSchema,
  createPodTournamentSchema,
  generatePodRoundSchema,
  podResultSchema,
  podTournamentIdParamSchema,
  replacePodPairingSchema,
  updatePodPlayerSchema,
  updatePodTournamentSchema,
} from "@openrift/shared/schemas";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { cookieAuth, errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";
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

const detailContent = {
  200: {
    content: { "application/json": { schema: podTournamentDetailResponseSchema } },
    description: "Tournament detail",
  },
};

const idParam = podTournamentIdParamSchema;
const playerParam = z.object({ id: z.uuid(), playerId: z.uuid() });
const podParam = z.object({ id: z.uuid(), podId: z.uuid() });
const roundParam = z.object({ id: z.uuid(), roundNumber: z.coerce.number().int().positive() });

// ─── Route definitions ───────────────────────────────────────────────────────

const listTournaments = createRoute({
  method: "get",
  path: "/pod-tournaments",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  responses: {
    200: {
      content: { "application/json": { schema: podTournamentListResponseSchema } },
      description: "Your tournaments",
    },
    ...errorResponses(401),
  },
});

const createTournament = createRoute({
  method: "post",
  path: "/pod-tournaments",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: {
    body: {
      content: { "application/json": { schema: createPodTournamentSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      headers: z.object({ Location: z.string() }),
      content: { "application/json": { schema: podTournamentResponseSchema } },
      description: "Created",
    },
    ...errorResponses(400, 401),
  },
});

const getTournament = createRoute({
  method: "get",
  path: "/pod-tournaments/{id}",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: { params: idParam },
  responses: { ...detailContent, ...errorResponses(401, 403, 404) },
});

const updateTournament = createRoute({
  method: "patch",
  path: "/pod-tournaments/{id}",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: updatePodTournamentSchema } },
      required: true,
    },
  },
  responses: { ...detailContent, ...errorResponses(400, 401, 403, 404) },
});

const deleteTournament = createRoute({
  method: "delete",
  path: "/pod-tournaments/{id}",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: { params: idParam },
  responses: { 204: { description: "No Content" }, ...errorResponses(401, 403, 404) },
});

const addPlayer = createRoute({
  method: "post",
  path: "/pod-tournaments/{id}/players",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: addPodPlayerSchema } }, required: true },
  },
  responses: { ...detailContent, ...errorResponses(400, 401, 403, 404) },
});

const renamePlayer = createRoute({
  method: "patch",
  path: "/pod-tournaments/{id}/players/{playerId}",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: {
    params: playerParam,
    body: { content: { "application/json": { schema: updatePodPlayerSchema } }, required: true },
  },
  responses: { ...detailContent, ...errorResponses(400, 401, 403, 404) },
});

const dropPlayer = createRoute({
  method: "post",
  path: "/pod-tournaments/{id}/players/{playerId}/drop",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: { params: playerParam },
  responses: { ...detailContent, ...errorResponses(401, 403, 404) },
});

const reactivatePlayer = createRoute({
  method: "post",
  path: "/pod-tournaments/{id}/players/{playerId}/reactivate",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: { params: playerParam },
  responses: { ...detailContent, ...errorResponses(401, 403, 404) },
});

const removePlayer = createRoute({
  method: "delete",
  path: "/pod-tournaments/{id}/players/{playerId}",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: { params: playerParam },
  responses: { ...detailContent, ...errorResponses(401, 403, 404, 409) },
});

const generateRound = createRoute({
  method: "post",
  path: "/pod-tournaments/{id}/rounds",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: generatePodRoundSchema } }, required: true },
  },
  responses: { ...detailContent, ...errorResponses(400, 401, 403, 404, 409) },
});

const replacePairingRoute = createRoute({
  method: "put",
  path: "/pod-tournaments/{id}/rounds/{roundNumber}/pairing",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: {
    params: roundParam,
    body: { content: { "application/json": { schema: replacePodPairingSchema } }, required: true },
  },
  responses: { ...detailContent, ...errorResponses(400, 401, 403, 404, 409) },
});

const rerollRoundRoute = createRoute({
  method: "post",
  path: "/pod-tournaments/{id}/rounds/{roundNumber}/reroll",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: { params: roundParam },
  responses: { ...detailContent, ...errorResponses(400, 401, 403, 404) },
});

const finalizeRoundRoute = createRoute({
  method: "post",
  path: "/pod-tournaments/{id}/rounds/{roundNumber}/finalize",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: { params: roundParam },
  responses: { ...detailContent, ...errorResponses(400, 401, 403, 404, 409) },
});

const submitResult = createRoute({
  method: "put",
  path: "/pod-tournaments/{id}/pods/{podId}/result",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: {
    params: podParam,
    body: { content: { "application/json": { schema: podResultSchema } }, required: true },
  },
  responses: { ...detailContent, ...errorResponses(400, 401, 403, 404, 409) },
});

const enableReportToken = createRoute({
  method: "post",
  path: "/pod-tournaments/{id}/report-token",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: { params: idParam },
  responses: { ...detailContent, ...errorResponses(401, 403, 404) },
});

const disableReportToken = createRoute({
  method: "delete",
  path: "/pod-tournaments/{id}/report-token",
  tags: ["Pod Tournaments"],
  security: cookieAuth,
  request: { params: idParam },
  responses: { ...detailContent, ...errorResponses(401, 403, 404) },
});

// ─── App ─────────────────────────────────────────────────────────────────────

const podTournamentsApp = createApiApp();
podTournamentsApp.use("/pod-tournaments/*", requireAuth);

export const podTournamentsRoute = podTournamentsApp
  .openapi(listTournaments, async (c) => {
    const userId = getUserId(c);
    const { podTournaments } = c.get("repos");
    const items = await podTournaments.listForOwner(userId);
    const response: PodTournamentListResponse = {
      items: items.map((row) => ({
        ...toTournament(row),
        playerCount: row.playerCount,
        activePlayerCount: row.activePlayerCount,
        roundCount: row.roundCount,
      })),
    };
    return c.json(response, 200);
  })

  .openapi(createTournament, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const body = c.req.valid("json");
    const tournament = await repos.podTournaments.create({
      ownerUserId: userId,
      name: body.name,
    });
    c.header("Location", `/api/v1/pod-tournaments/${tournament.id}`);
    return c.json(toTournament(tournament), 201);
  })

  .openapi(getTournament, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const tournament = await loadOwnedTournament(repos, c.req.valid("param").id, userId);
    return c.json(await buildDetail(repos, tournament), 200);
  })

  .openapi(updateTournament, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    const body = c.req.valid("json");
    await repos.podTournaments.update(tournament.id, {
      name: body.name,
      status: body.status,
      scoringScheme: body.scoringScheme,
      byePoints: body.byePoints,
    });
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(deleteTournament, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const tournament = await loadOwnedTournament(repos, c.req.valid("param").id, userId);
    await repos.podTournaments.deleteById(tournament.id);
    return c.body(null, 204);
  })

  .openapi(addPlayer, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await repos.podTournaments.addPlayer(tournament.id, c.req.valid("json").displayName);
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(renamePlayer, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id, playerId } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await ensurePlayerInTournament(repos, tournament.id, playerId);
    await repos.podTournaments.renamePlayer(playerId, c.req.valid("json").displayName);
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(dropPlayer, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id, playerId } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await ensurePlayerInTournament(repos, tournament.id, playerId);
    await repos.podTournaments.dropPlayer(playerId, tournament.currentRound);
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(reactivatePlayer, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id, playerId } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await ensurePlayerInTournament(repos, tournament.id, playerId);
    await repos.podTournaments.reactivatePlayer(playerId);
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(removePlayer, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id, playerId } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await ensurePlayerInTournament(repos, tournament.id, playerId);
    if (await repos.podTournaments.playerHasMemberships(playerId)) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        "This player is in a paired round and cannot be removed; drop them instead.",
      );
    }
    await repos.podTournaments.deletePlayer(playerId);
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(generateRound, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await pairNextRound(repos, tournament, c.req.valid("json").byes);
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(replacePairingRoute, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id, roundNumber } = c.req.valid("param");
    const body = c.req.valid("json");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await replaceRoundPairing(repos, tournament, roundNumber, body.pods, body.byes);
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(rerollRoundRoute, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id, roundNumber } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await rerollRound(repos, tournament, roundNumber);
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(finalizeRoundRoute, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id, roundNumber } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await finalizeRound(repos, tournament, roundNumber);
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(submitResult, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id, podId } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await submitPodResult(repos, tournament.id, podId, c.req.valid("json").results, {
      allowFinalized: true,
    });
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(enableReportToken, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await repos.podTournaments.setReportToken(tournament.id, generateShareToken());
    return c.json(await detailById(repos, id, userId), 200);
  })

  .openapi(disableReportToken, async (c) => {
    const userId = getUserId(c);
    const repos = c.get("repos");
    const { id } = c.req.valid("param");
    const tournament = await loadOwnedTournament(repos, id, userId);
    await repos.podTournaments.setReportToken(tournament.id, null);
    return c.json(await detailById(repos, id, userId), 200);
  });

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
