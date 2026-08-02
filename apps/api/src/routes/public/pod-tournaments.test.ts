import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { publicPodTournamentsRouter } from "./pod-tournaments";

const mockSubmitPodResult = vi.fn(() => Promise.resolve());
const mockSubmitPodPlayerResult = vi.fn(() => Promise.resolve());
vi.mock("../../services/pod-pairing.js", () => ({
  submitPodResult: (...args: unknown[]) => mockSubmitPodResult(...(args as [])),
  submitPodPlayerResult: (...args: unknown[]) => mockSubmitPodPlayerResult(...(args as [])),
}));

// The tournaments row itself belongs to `tournamentsRepo`; `podTournamentsRepo`
// owns only the pod tables (rounds, pods, standings).
const mockTournamentsRepo = {
  findByShareToken: vi.fn(
    () => Promise.resolve(undefined) as Promise<Record<string, unknown> | undefined>,
  ),
};

const mockPodTournamentsRepo = {
  computeStandings: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  loadRounds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    tournaments: mockTournamentsRepo,
    podTournaments: mockPodTournamentsRepo,
    // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
  } as any);
  await next();
});
registerRouterForTest(app, publicPodTournamentsRouter);

const TOURNAMENT_ID = "t0000000-0001-4000-a000-000000000001";
const POD_ID = "b0000000-0001-4000-a000-000000000001";
const TOKEN = "report-token-abc";
const FOLLOW_TOKEN = "follow-token-xyz";

const dbTournament = {
  id: TOURNAMENT_ID,
  name: "Friday Night Pods",
  status: "running" as const,
  currentRound: 2,
  scoringScheme: "standard" as const,
  byePoints: 3,
  matchFormat: "bo1" as const,
  winPoints: 3,
  drawPoints: 1,
  regionsEnabled: false,
  pairingStyle: "pod" as const,
  playMode: "1v1" as const,
  reportToken: TOKEN,
  followToken: FOLLOW_TOKEN,
};

const playerIds = [
  "a0000000-0001-4000-a000-000000000001",
  "a0000000-0001-4000-a000-000000000002",
  "a0000000-0001-4000-a000-000000000003",
];

const standingRow = {
  playerId: playerIds[0],
  displayName: "Alice",
  status: "active" as const,
  droppedAfterRound: null,
  teamId: null,
  score: 9,
  gamePoints: 9,
  roundsPlayed: 3,
  pods3Count: 0,
  pods4Count: 3,
  byeCount: 0,
  podWins: 2,
  wins: 0,
  draws: 0,
  losses: 0,
  region: null,
  avgOpponentScore: 4.5,
  avgOpponentGamePoints: 4.5,
};

describe("GET /api/v1/pod-tournaments/report/:token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSubmitPodResult.mockResolvedValue(undefined);
    mockPodTournamentsRepo.computeStandings.mockResolvedValue([]);
    mockPodTournamentsRepo.loadRounds.mockResolvedValue([]);
  });

  it("returns 200 with the participant-facing report when the token resolves", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);
    mockPodTournamentsRepo.computeStandings.mockResolvedValue([standingRow]);
    mockPodTournamentsRepo.loadRounds.mockResolvedValue([]);

    const res = await app.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.tournamentName).toBe("Friday Night Pods");
    expect(json.status).toBe("running");
    expect(json.currentRound).toBe(2);
    expect(json.scoringScheme).toBe("standard");
    expect(json.byePoints).toBe(3);
    expect(json.standings).toHaveLength(1);
    expect(json.standings[0].playerId).toBe(playerIds[0]);
    expect(json.rounds).toEqual([]);
    // Reached via the report token, so result entry is allowed.
    expect(json.canSubmit).toBe(true);
  });

  // Regression: the column was typed to the three pod statuses while the CHECK
  // and the cancel endpoint both allow 'cancelled', so a cancelled tournament
  // failed oRPC output validation and 500'd every follower's report link.
  it("serves the report for a cancelled tournament", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue({
      ...dbTournament,
      status: "cancelled",
    });

    const res = await app.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.status).toBe("cancelled");
  });

  it("marks the report follow-only (canSubmit false) when reached via the follow token", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);

    const res = await app.request(`/api/v1/pod-tournaments/report/${FOLLOW_TOKEN}`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.canSubmit).toBe(false);
  });

  it("strips organizer-only penalty internals from rounds and pods", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);
    mockPodTournamentsRepo.loadRounds.mockResolvedValue([
      {
        id: "rd000000-0001-4000-a000-000000000001",
        roundNumber: 1,
        status: "finalized",
        pairingStrategy: "balanced",
        penaltyTotal: 42,
        createdAt: "2026-04-20T00:00:00.000Z",
        finalizedAt: "2026-04-20T01:00:00.000Z",
        byes: [],
        pods: [
          {
            id: POD_ID,
            podNumber: 1,
            size: 4,
            resultStatus: "reported",
            members: [],
            penalty: {
              total: 9,
              rematchPairs: 0,
              spread: 1,
              scoreSpread: 1,
              imbalance: 0,
              float: 0,
              threePodRepeat: 0,
              sameRegion: 0,
            },
          },
        ],
      },
    ]);

    const res = await app.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.rounds[0].penaltyTotal).toBeNull();
    expect(json.rounds[0].pods[0].penalty).toBeNull();
  });

  it("returns NOT_FOUND when the token does not resolve", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Not found");
    expect(mockPodTournamentsRepo.computeStandings).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the token resolves a non-pod tournament", async () => {
    // A live report token on a tournament whose pairing engine is no longer pod
    // must not render an (empty) pod report shell.
    mockTournamentsRepo.findByShareToken.mockResolvedValue({
      ...dbTournament,
      pairingStyle: "none",
    });

    const res = await app.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Not found");
    expect(mockPodTournamentsRepo.computeStandings).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/pod-tournaments/report/:token/pods/:podId/result", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSubmitPodResult.mockResolvedValue(undefined);
    mockPodTournamentsRepo.computeStandings.mockResolvedValue([]);
    mockPodTournamentsRepo.loadRounds.mockResolvedValue([]);
  });

  const validBody = {
    results: [
      { playerId: playerIds[0], gamePoints: 3 },
      { playerId: playerIds[1], gamePoints: 1 },
      { playerId: playerIds[2], gamePoints: 0 },
    ],
  };

  const putRequest = (token: string, podId: string, body: unknown) =>
    app.request(`/api/v1/pod-tournaments/report/${token}/pods/${podId}/result`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("submits the result and returns the refreshed report", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);

    const res = await putRequest(TOKEN, POD_ID, validBody);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.tournamentName).toBe("Friday Night Pods");
    expect(mockSubmitPodResult).toHaveBeenCalledTimes(1);
    const callArgs = mockSubmitPodResult.mock.calls[0] as unknown[];
    expect(callArgs[1]).toBe(TOURNAMENT_ID);
    expect(callArgs[2]).toBe(POD_ID);
    expect(callArgs[4]).toEqual({ allowFinalized: false });
  });

  it("returns FORBIDDEN when submitting via the read-only follow token", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);

    const res = await putRequest(FOLLOW_TOKEN, POD_ID, validBody);
    expect(res.status).toBe(403);
    const json = await readJson(res);
    expect(json.message).toBe("This link is follow-only");
    expect(mockSubmitPodResult).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the token does not resolve", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await putRequest(TOKEN, POD_ID, validBody);
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Not found");
    expect(mockSubmitPodResult).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the token resolves a non-pod tournament", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue({
      ...dbTournament,
      pairingStyle: "none",
    });

    const res = await putRequest(TOKEN, POD_ID, validBody);
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Not found");
    expect(mockSubmitPodResult).not.toHaveBeenCalled();
  });

  it("bridges an AppError from submitPodResult to its status and message", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);
    mockSubmitPodResult.mockRejectedValue(
      new AppError(409, "CONFLICT", "Round is not accepting results"),
    );

    const res = await putRequest(TOKEN, POD_ID, validBody);
    expect(res.status).toBe(409);
    const json = await readJson(res);
    expect(json.message).toBe("Round is not accepting results");
  });
});

describe("PUT /api/v1/pod-tournaments/report/:token/pods/:podId/players/:playerId/result", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSubmitPodPlayerResult.mockResolvedValue(undefined);
    mockPodTournamentsRepo.computeStandings.mockResolvedValue([]);
    mockPodTournamentsRepo.loadRounds.mockResolvedValue([]);
  });

  const putRequest = (token: string, playerId: string, body: unknown) =>
    app.request(
      `/api/v1/pod-tournaments/report/${token}/pods/${POD_ID}/players/${playerId}/result`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );

  it("submits the player's score and returns the refreshed report", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);

    const res = await putRequest(TOKEN, playerIds[0], { gamePoints: 3 });
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.tournamentName).toBe("Friday Night Pods");
    expect(mockSubmitPodPlayerResult).toHaveBeenCalledTimes(1);
    const callArgs = mockSubmitPodPlayerResult.mock.calls[0] as unknown[];
    expect(callArgs[1]).toBe(TOURNAMENT_ID);
    expect(callArgs[2]).toBe(POD_ID);
    expect(callArgs[3]).toBe(playerIds[0]);
    expect(callArgs[4]).toBe(3);
  });

  it("accepts per-player entry on a Swiss tournament", async () => {
    // Swiss seats players in pods too, so a participant must be able to enter
    // their own score. Guarding on `pairingStyle !== "pod"` 404'd every Swiss
    // event while the pod-wide endpoint on the same token still worked.
    mockTournamentsRepo.findByShareToken.mockResolvedValue({
      ...dbTournament,
      pairingStyle: "swiss",
    });

    const res = await putRequest(TOKEN, playerIds[0], { gamePoints: 2 });
    expect(res.status).toBe(200);
    expect(mockSubmitPodPlayerResult).toHaveBeenCalledTimes(1);
  });

  it("returns FORBIDDEN when submitting via the read-only follow token", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);

    const res = await putRequest(FOLLOW_TOKEN, playerIds[0], { gamePoints: 3 });
    expect(res.status).toBe(403);
    const json = await readJson(res);
    expect(json.message).toBe("This link is follow-only");
    expect(mockSubmitPodPlayerResult).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the token does not resolve", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await putRequest(TOKEN, playerIds[0], { gamePoints: 3 });
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Not found");
    expect(mockSubmitPodPlayerResult).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the tournament has no pairing engine", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue({
      ...dbTournament,
      pairingStyle: "none",
    });

    const res = await putRequest(TOKEN, playerIds[0], { gamePoints: 3 });
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.message).toBe("Not found");
    expect(mockSubmitPodPlayerResult).not.toHaveBeenCalled();
  });

  it("bridges an AppError from submitPodPlayerResult to its status and message", async () => {
    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);
    mockSubmitPodPlayerResult.mockRejectedValue(
      new AppError(400, "BAD_REQUEST", "This player is not in this pod."),
    );

    const res = await putRequest(TOKEN, playerIds[0], { gamePoints: 3 });
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.message).toBe("This player is not in this pod.");
  });
});

describe("pod-tournaments route registration", () => {
  it("registers both report routes", async () => {
    const mountedApp = new Hono<{ Variables: Variables }>();
    mountedApp.use("*", async (c, next) => {
      c.set("repos", {
        tournaments: mockTournamentsRepo,
        podTournaments: mockPodTournamentsRepo,
        // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
      } as any);
      await next();
    });
    registerRouterForTest(mountedApp, publicPodTournamentsRouter);

    mockTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);
    mockPodTournamentsRepo.computeStandings.mockResolvedValue([]);
    mockPodTournamentsRepo.loadRounds.mockResolvedValue([]);

    const res = await mountedApp.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(200);
  });
});
