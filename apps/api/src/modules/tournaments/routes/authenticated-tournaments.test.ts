import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import type { Variables } from "../../../types.js";
import type { Tournament } from "../repositories/tournaments-shared.js";
import { tournamentsRouter } from "./authenticated-tournaments.js";

// The cross-field invariants (lib/tournament-invariants.ts) are unit-tested
// against the matrices directly. What this file covers is the *wiring*: that
// create and update call them with the right effective values — for update,
// merged against the stored row, since a patch may touch only one side of a
// pair. The play-mode invariant in particular has no integration coverage.

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const TOURNAMENT_ID = "b0000000-0001-4000-a000-000000000001";

const now = new Date("2026-06-01T00:00:00Z");

function tournamentRow(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: TOURNAMENT_ID,
    hostType: "user",
    hostUserId: USER_ID,
    hostOrgId: null,
    groupId: null,
    name: "Summoner Skirmish",
    status: "setup",
    startsAt: new Date("2026-06-01T12:00:00Z"),
    endsAt: null,
    pairingStyle: "swiss",
    playMode: "1v1",
    currentRound: 0,
    scoringScheme: "standard",
    byePoints: 3,
    matchFormat: "bo1",
    winPoints: 3,
    drawPoints: 1,
    regionsEnabled: false,
    deckSubmission: "none",
    deckPhase: "closed",
    submissionsCloseAt: null,
    listLockMode: "on_submit",
    deckFormat: null,
    allowedSets: null,
    selfRegistration: false,
    reportToken: null,
    followToken: null,
    submissionToken: null,
    organizerInviteToken: null,
    judgeInviteToken: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Tournament;
}

// Repos return the given row and empty everything else, so a successful
// request still assembles a schema-valid detail payload.
function makeApp(tournament: Tournament) {
  const tournaments = {
    findById: vi.fn(() => Promise.resolve(tournament)),
    create: vi.fn(() => Promise.resolve(tournament)),
    isHostOrStaff: vi.fn(() => Promise.resolve(true)),
    hasRounds: vi.fn(() => Promise.resolve(false)),
    hasRelationship: vi.fn(() => Promise.resolve(true)),
    updateSettings: vi.fn(() => Promise.resolve()),
    addStaff: vi.fn(() => Promise.resolve()),
    setSubmissionToken: vi.fn(() => Promise.resolve()),
    getUserNames: vi.fn(() => Promise.resolve(new Map([[USER_ID, "Host"]]))),
    getCounts: vi.fn(() => Promise.resolve({ participantCount: 0, pendingRequestCount: 0 })),
    getStaffRoles: vi.fn(() => Promise.resolve([])),
    listStaffWithNames: vi.fn(() => Promise.resolve([])),
    findParticipantByUser: vi.fn(() => Promise.resolve(undefined)),
    participantPreviewAcross: vi.fn(() => Promise.resolve([])),
  };
  const deckCheck = {
    coverLegendsAcross: vi.fn(() => Promise.resolve([])),
    legendImagesForParticipants: vi.fn(() => Promise.resolve(new Map())),
    getEntryForPlayerByTournament: vi.fn(() => Promise.resolve(undefined)),
  };
  const podTournaments = {
    winnersAcross: vi.fn(() => Promise.resolve(new Map())),
    setReportToken: vi.fn(() => Promise.resolve()),
    setFollowToken: vi.fn(() => Promise.resolve()),
    dissolveAllTeams: vi.fn(() => Promise.resolve()),
  };
  const repos = { tournaments, deckCheck, podTournaments };

  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: USER_ID } as never);
    c.set("repos", repos as never);
    c.set("transact", (async (fn: (r: typeof repos) => unknown) => fn(repos)) as never);
    await next();
  });
  registerRouterForTest(app, tournamentsRouter);

  return { app, repos };
}

function req(method: string, path: string, body?: unknown): Request {
  return new Request(`http://test/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const CREATE_BASE = {
  name: "Summoner Skirmish",
  host: { type: "user" },
  deckSubmission: "none",
  startsAt: "2026-06-01T12:00:00Z",
};

describe("POST /tournaments", () => {
  it("rejects 2v2 team play combined with pod pairing", async () => {
    const { app, repos } = makeApp(tournamentRow());

    const res = await app.fetch(
      req("POST", "/tournaments", { ...CREATE_BASE, pairingStyle: "pod", playMode: "2v2" }),
    );

    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("free-for-all pods");
    expect(repos.tournaments.create).not.toHaveBeenCalled();
  });

  it("rejects 2v2 team play combined with regions", async () => {
    const { app, repos } = makeApp(tournamentRow());

    const res = await app.fetch(
      req("POST", "/tournaments", {
        ...CREATE_BASE,
        pairingStyle: "swiss",
        playMode: "2v2",
        regionsEnabled: true,
      }),
    );

    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("Regions aren't");
    expect(repos.tournaments.create).not.toHaveBeenCalled();
  });

  it("creates a 2v2 Swiss tournament, the one combination 2v2 allows", async () => {
    const { app, repos } = makeApp(tournamentRow({ playMode: "2v2" }));

    const res = await app.fetch(
      req("POST", "/tournaments", { ...CREATE_BASE, pairingStyle: "swiss", playMode: "2v2" }),
    );

    expect(res.status).toBe(201);
    expect(((await res.json()) as { playMode: string }).playMode).toBe("2v2");
    expect(repos.tournaments.create).toHaveBeenCalled();
  });
});

describe("PATCH /tournaments/{id}", () => {
  it("rejects a play-mode switch that contradicts the stored pairing style", async () => {
    // The patch carries no pairingStyle, so the invariant only catches this if
    // it is merged against the stored row.
    const { app, repos } = makeApp(tournamentRow({ pairingStyle: "pod" }));

    const res = await app.fetch(req("PATCH", `/tournaments/${TOURNAMENT_ID}`, { playMode: "2v2" }));

    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("free-for-all pods");
    expect(repos.tournaments.updateSettings).not.toHaveBeenCalled();
  });

  it("rejects enabling regions on a stored 2v2 tournament", async () => {
    const { app, repos } = makeApp(tournamentRow({ playMode: "2v2" }));

    const res = await app.fetch(
      req("PATCH", `/tournaments/${TOURNAMENT_ID}`, { regionsEnabled: true }),
    );

    expect(res.status).toBe(422);
    expect(((await res.json()) as { message: string }).message).toContain("Regions aren't");
    expect(repos.tournaments.updateSettings).not.toHaveBeenCalled();
  });

  it("rejects a backwards status move", async () => {
    const { app, repos } = makeApp(tournamentRow({ status: "completed" }));

    const res = await app.fetch(
      req("PATCH", `/tournaments/${TOURNAMENT_ID}`, { status: "running" }),
    );

    expect(res.status).toBe(409);
    expect(repos.tournaments.updateSettings).not.toHaveBeenCalled();
  });

  it("refuses to edit a cancelled tournament at all", async () => {
    // The cancelled row of the transition matrix is unreachable through update:
    // this guard fires first, whatever the patch contains.
    const { app, repos } = makeApp(tournamentRow({ status: "cancelled" }));

    const res = await app.fetch(req("PATCH", `/tournaments/${TOURNAMENT_ID}`, { name: "Renamed" }));

    expect(res.status).toBe(409);
    expect(((await res.json()) as { message: string }).message).toContain("cancelled tournament");
    expect(repos.tournaments.updateSettings).not.toHaveBeenCalled();
  });

  it("honors an explicit status write to cancelled", async () => {
    const { app, repos } = makeApp(tournamentRow());

    const res = await app.fetch(
      req("PATCH", `/tournaments/${TOURNAMENT_ID}`, { status: "cancelled" }),
    );

    expect(res.status).toBe(200);
    expect(repos.tournaments.updateSettings).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      expect.objectContaining({ status: "cancelled" }),
    );
  });
});
