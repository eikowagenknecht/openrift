import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import type { Variables } from "../../types.js";
import { publicPodTournamentsRouter } from "./pod-tournaments";

const mockSubmitPodResult = vi.fn(() => Promise.resolve());
vi.mock("../../services/pod-pairing.js", () => ({
  submitPodResult: (...args: unknown[]) => mockSubmitPodResult(...(args as [])),
}));

const mockPodTournamentsRepo = {
  findByShareToken: vi.fn(
    () => Promise.resolve(undefined) as Promise<Record<string, unknown> | undefined>,
  ),
  computeStandings: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
  loadRounds: vi.fn(() => Promise.resolve([] as Record<string, unknown>[])),
};

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
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
  pairingStyle: "pod" as const,
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
  score: 9,
  gamePoints: 9,
  roundsPlayed: 3,
  pods3Count: 0,
  pods4Count: 3,
  byeCount: 0,
  podWins: 2,
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
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);
    mockPodTournamentsRepo.computeStandings.mockResolvedValue([standingRow]);
    mockPodTournamentsRepo.loadRounds.mockResolvedValue([]);

    const res = await app.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(200);
    const json = await res.json();
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

  it("marks the report follow-only (canSubmit false) when reached via the follow token", async () => {
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);

    const res = await app.request(`/api/v1/pod-tournaments/report/${FOLLOW_TOKEN}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.canSubmit).toBe(false);
  });

  it("strips organizer-only penalty internals from rounds and pods", async () => {
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);
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
            },
          },
        ],
      },
    ]);

    const res = await app.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rounds[0].penaltyTotal).toBeNull();
    expect(json.rounds[0].pods[0].penalty).toBeNull();
  });

  it("returns NOT_FOUND when the token does not resolve", async () => {
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await app.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe("Not found");
    expect(mockPodTournamentsRepo.computeStandings).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the token resolves a non-pod tournament", async () => {
    // A live report token on a tournament whose pairing engine is no longer pod
    // must not render an (empty) pod report shell.
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue({
      ...dbTournament,
      pairingStyle: "none",
    });

    const res = await app.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(404);
    const json = await res.json();
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
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);

    const res = await putRequest(TOKEN, POD_ID, validBody);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tournamentName).toBe("Friday Night Pods");
    expect(mockSubmitPodResult).toHaveBeenCalledTimes(1);
    const callArgs = mockSubmitPodResult.mock.calls[0] as unknown[];
    expect(callArgs[1]).toBe(TOURNAMENT_ID);
    expect(callArgs[2]).toBe(POD_ID);
    expect(callArgs[4]).toEqual({ allowFinalized: false });
  });

  it("returns FORBIDDEN when submitting via the read-only follow token", async () => {
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);

    const res = await putRequest(FOLLOW_TOKEN, POD_ID, validBody);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.message).toBe("This link is follow-only");
    expect(mockSubmitPodResult).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the token does not resolve", async () => {
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue(undefined);

    const res = await putRequest(TOKEN, POD_ID, validBody);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe("Not found");
    expect(mockSubmitPodResult).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the token resolves a non-pod tournament", async () => {
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue({
      ...dbTournament,
      pairingStyle: "none",
    });

    const res = await putRequest(TOKEN, POD_ID, validBody);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toBe("Not found");
    expect(mockSubmitPodResult).not.toHaveBeenCalled();
  });

  it("bridges an AppError from submitPodResult to its status and message", async () => {
    mockPodTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);
    mockSubmitPodResult.mockRejectedValue(
      new AppError(409, "CONFLICT", "Round is not accepting results"),
    );

    const res = await putRequest(TOKEN, POD_ID, validBody);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.message).toBe("Round is not accepting results");
  });
});

describe("pod-tournaments route registration", () => {
  it("registers both report routes", async () => {
    const mountedApp = new Hono<{ Variables: Variables }>();
    mountedApp.use("*", async (c, next) => {
      c.set("repos", {
        podTournaments: mockPodTournamentsRepo,
        // oxlint-disable-next-line no-explicit-any -- test mock doesn't match full Repos type
      } as any);
      await next();
    });
    registerRouterForTest(mountedApp, publicPodTournamentsRouter);

    mockPodTournamentsRepo.findByShareToken.mockResolvedValue(dbTournament);
    mockPodTournamentsRepo.computeStandings.mockResolvedValue([]);
    mockPodTournamentsRepo.loadRounds.mockResolvedValue([]);

    const res = await mountedApp.request(`/api/v1/pod-tournaments/report/${TOKEN}`);
    expect(res.status).toBe(200);
  });
});
