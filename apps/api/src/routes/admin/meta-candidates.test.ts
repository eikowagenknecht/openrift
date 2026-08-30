import { ERROR_CODES } from "@openrift/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../errors.js";
import { MAX_EVENT_MATCH_DAY_DELTA } from "../../services/meta-match-suggestions.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { adminMetaCandidatesRouter } from "./meta-candidates";

// ---------------------------------------------------------------------------
// Mock repos and services
// ---------------------------------------------------------------------------

const mockCandidates = {
  eventById: vi.fn(),
  eventsByMetaEventId: vi.fn(),
  playerById: vi.fn(),
  playersByCandidateEventIds: vi.fn(),
  playersByMetaEventIds: vi.fn(),
  liveDeckCards: vi.fn(),
  liveEventsByIds: vi.fn(),
  cardNamesByIds: vi.fn(),
  ignoreEvent: vi.fn(),
  ignorePlayer: vi.fn(),
};

const mockMeta = { livePlayersByIds: vi.fn() };
const mockUsers = { findById: vi.fn() };
const mockDeckFormats = { getBySlug: vi.fn() };

const mockServices = {
  acceptCandidateEvent: vi.fn(),
  acceptCandidateEventWithPlayers: vi.fn(),
  acceptCandidatePlayer: vi.fn(),
  linkCandidateEvent: vi.fn(),
  relinkCandidateEvent: vi.fn(),
  unlinkCandidateEvent: vi.fn(),
  linkCandidatePlayer: vi.fn(),
  relinkCandidatePlayer: vi.fn(),
  unlinkCandidatePlayer: vi.fn(),
  acceptMetaEventField: vi.fn(),
  acceptMetaPlayerField: vi.fn(),
  acceptMetaDeckList: vi.fn(),
  suggestMetaEventMatches: vi.fn(),
  suggestMetaPlayerMatches: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const CANDIDATE_ID = "b0000000-0001-4000-a000-000000000001";
const SIBLING_ID = "b0000000-0001-4000-a000-000000000002";
const PLAYER_ID = "c0000000-0001-4000-a000-000000000001";
const DECK_ID = "d0000000-0001-4000-a000-000000000001";
const LIVE_EVENT_ID = "e0000000-0001-4000-a000-000000000001";
const LIVE_PLAYER_ID = "f0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    meta: mockMeta,
    metaCandidates: mockCandidates,
    users: mockUsers,
    deckFormats: mockDeckFormats,
  } as never);
  c.set("services", mockServices as never);
  await next();
});
registerRouterForTest(app, adminMetaCandidatesRouter);

/** @returns A candidate event row. */
function candidateEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: CANDIDATE_ID,
    provider: "uvsgames",
    externalId: "evt-1",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    sourceUrl: "https://example.invalid/uvs",
    notes: null,
    tier: null,
    country: null,
    location: null,
    metaEventId: null,
    raw: null,
    fetchedAt: null,
    checkedAt: null,
    extraData: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

/**
 * @returns A candidate standings row under a candidate event, unless
 * overridden. Standings-only, which is what most of a source's field is.
 */
function candidatePlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_ID,
    candidateEventId: CANDIDATE_ID,
    metaEventId: null,
    externalId: "player-1",
    playerName: "Renata",
    rank: 1,
    rankIsTier: false,
    wins: 5,
    losses: 1,
    draws: 0,
    matchPoints: null,
    opponentMatchWinPct: null,
    gameWinPct: null,
    opponentGameWinPct: null,
    entryStatus: null,
    legendName: "Azir",
    legendCardId: null,
    championName: null,
    championCardId: null,
    cards: null,
    listStatus: "none",
    metaEventPlayerId: null,
    submittedByUserId: null,
    submissionNote: null,
    checkedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** @returns A live standings row as the diff reads it. */
function livePlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: LIVE_PLAYER_ID,
    metaEventId: LIVE_EVENT_ID,
    rank: 1,
    rankIsTier: false,
    playerName: "Renata",
    wins: 5,
    losses: 1,
    draws: 0,
    legendCardId: null,
    championCardId: null,
    listStatus: "none",
    deckId: null,
    deckName: null,
    shareToken: null,
    ...overrides,
  };
}

/** @returns The response to a POST with an optional JSON body. */
function post(path: string, body?: unknown) {
  return app.request(`/api/admin/v1/meta${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockCandidates.playersByCandidateEventIds.mockResolvedValue([]);
  mockCandidates.playersByMetaEventIds.mockResolvedValue([]);
  mockCandidates.liveDeckCards.mockResolvedValue([]);
  mockCandidates.liveEventsByIds.mockResolvedValue([]);
  mockCandidates.cardNamesByIds.mockResolvedValue(new Map());
  mockMeta.livePlayersByIds.mockResolvedValue([]);
  mockDeckFormats.getBySlug.mockResolvedValue({ slug: "constructed" });
});

describe("GET /meta/candidates/{id}", () => {
  it("returns an unlinked candidate as its own only source", async () => {
    mockCandidates.eventById.mockResolvedValue(candidateEvent());
    mockCandidates.playersByCandidateEventIds.mockResolvedValue([candidatePlayer()]);

    const res = await app.request(`/api/admin/v1/meta/candidates/${CANDIDATE_ID}`);

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.sources).toHaveLength(1);
    expect(json.sources[0].provider).toBe("uvsgames");
    expect(json.sources[0].players).toHaveLength(1);
    expect(json.submittedPlayers).toEqual([]);
    // An unlinked candidate has no siblings, so nothing goes looking for them.
    expect(mockCandidates.eventsByMetaEventId).not.toHaveBeenCalled();
  });

  it("carries a standings-only entry with no list and no deck", async () => {
    mockCandidates.eventById.mockResolvedValue(candidateEvent());
    mockCandidates.playersByCandidateEventIds.mockResolvedValue([candidatePlayer()]);

    const res = await app.request(`/api/admin/v1/meta/candidates/${CANDIDATE_ID}`);

    const json = await readJson(res);
    expect(json.players[0]).toMatchObject({
      rank: 1,
      rankIsTier: false,
      wins: 5,
      losses: 1,
      draws: 0,
      legendName: "Azir",
      cards: null,
      listStatus: "none",
      unresolvedNames: [],
      state: "new",
      diff: null,
    });
  });

  it("reports the card names that matched nothing, which block taking the list", async () => {
    mockCandidates.eventById.mockResolvedValue(candidateEvent());
    mockCandidates.playersByCandidateEventIds.mockResolvedValue([
      candidatePlayer({
        listStatus: "full",
        cards: [
          { name: "Azir", zone: "legend", quantity: 1, cardId: null },
          { name: "Shock", zone: "main", quantity: 3, cardId: null },
          { name: "Shock", zone: "sideboard", quantity: 1, cardId: null },
        ],
      }),
    ]);

    const res = await app.request(`/api/admin/v1/meta/candidates/${CANDIDATE_ID}`);

    const json = await readJson(res);
    expect(json.players[0].unresolvedNames).toEqual(["Azir", "Shock"]);
  });

  it("returns one source column per candidate on the same live event", async () => {
    const linked = candidateEvent({ metaEventId: LIVE_EVENT_ID });
    const sibling = candidateEvent({
      id: SIBLING_ID,
      provider: "playriftbound",
      externalId: "prb-9",
      name: "Summoner Skirmish Berlin",
      metaEventId: LIVE_EVENT_ID,
    });
    mockCandidates.eventById.mockResolvedValue(linked);
    mockCandidates.eventsByMetaEventId.mockResolvedValue([linked, sibling]);
    mockCandidates.playersByCandidateEventIds.mockResolvedValue([
      candidatePlayer(),
      candidatePlayer({
        id: "c0000000-0001-4000-a000-000000000002",
        candidateEventId: SIBLING_ID,
      }),
    ]);
    mockCandidates.liveEventsByIds.mockResolvedValue([
      { id: LIVE_EVENT_ID, slug: "summoner-skirmish-2026", name: "Summoner Skirmish" },
    ]);

    const res = await app.request(`/api/admin/v1/meta/candidates/${CANDIDATE_ID}`);

    const json = await readJson(res);
    expect(mockCandidates.eventsByMetaEventId).toHaveBeenCalledWith(LIVE_EVENT_ID);
    expect(json.sources.map((source: { provider: string }) => source.provider)).toEqual([
      "uvsgames",
      "playriftbound",
    ]);
    // Each column carries only its own standings, and `players` stays this
    // candidate's own — the review screen reads both.
    expect(json.sources[1].players).toHaveLength(1);
    expect(json.players).toHaveLength(1);
  });

  it("diffs a linked entry against its live standings row", async () => {
    mockCandidates.eventById.mockResolvedValue(candidateEvent({ metaEventId: LIVE_EVENT_ID }));
    mockCandidates.eventsByMetaEventId.mockResolvedValue([
      candidateEvent({ metaEventId: LIVE_EVENT_ID }),
    ]);
    mockCandidates.playersByCandidateEventIds.mockResolvedValue([
      candidatePlayer({ rank: 1, rankIsTier: false, wins: 5, metaEventPlayerId: LIVE_PLAYER_ID }),
    ]);
    mockMeta.livePlayersByIds.mockResolvedValue([
      livePlayer({ rank: 8, rankIsTier: true, wins: 4 }),
    ]);
    mockCandidates.liveEventsByIds.mockResolvedValue([
      { id: LIVE_EVENT_ID, slug: "summoner-skirmish-2026", name: "Summoner Skirmish" },
    ]);

    const res = await app.request(`/api/admin/v1/meta/candidates/${CANDIDATE_ID}`);

    const json = await readJson(res);
    expect(mockMeta.livePlayersByIds).toHaveBeenCalledWith([LIVE_PLAYER_ID]);
    expect(json.players[0].state).toBe("changed");
    expect(json.players[0].diff.fields).toEqual(
      expect.arrayContaining([
        { field: "rank", from: 8, to: 1 },
        { field: "rankIsTier", from: true, to: false },
        { field: "wins", from: 4, to: 5 },
      ]),
    );
  });

  it("carries the directly-submitted entries with their submitter resolved", async () => {
    mockCandidates.eventById.mockResolvedValue(candidateEvent({ metaEventId: LIVE_EVENT_ID }));
    mockCandidates.eventsByMetaEventId.mockResolvedValue([
      candidateEvent({ metaEventId: LIVE_EVENT_ID }),
    ]);
    mockCandidates.playersByMetaEventIds.mockResolvedValue([
      candidatePlayer({
        id: "c0000000-0001-4000-a000-000000000003",
        candidateEventId: null,
        metaEventId: LIVE_EVENT_ID,
        submittedByUserId: "user-7",
        submissionNote: "Saw it on stream.",
      }),
    ]);
    mockUsers.findById.mockResolvedValue({ id: "user-7", name: "Skarner Fan", email: "x@y.z" });

    const res = await app.request(`/api/admin/v1/meta/candidates/${CANDIDATE_ID}`);

    const json = await readJson(res);
    expect(json.submittedPlayers).toHaveLength(1);
    expect(json.submittedPlayers[0].submittedByName).toBe("Skarner Fan");
    expect(json.submittedPlayers[0].submissionNote).toBe("Saw it on stream.");
    // One lookup per distinct submitter, and none at all for provider rows.
    expect(mockUsers.findById).toHaveBeenCalledTimes(1);
  });

  it("404s an unknown candidate", async () => {
    mockCandidates.eventById.mockResolvedValue(undefined);

    const res = await app.request(`/api/admin/v1/meta/candidates/${CANDIDATE_ID}`);

    expect(res.status).toBe(404);
  });
});

describe("linking", () => {
  it("links a candidate event to a live event", async () => {
    mockServices.linkCandidateEvent.mockResolvedValue({
      metaEventId: LIVE_EVENT_ID,
      slug: "summoner-skirmish-2026",
    });

    const res = await post(`/candidates/${CANDIDATE_ID}/link`, { metaEventId: LIVE_EVENT_ID });

    expect(res.status).toBe(200);
    expect(mockServices.linkCandidateEvent).toHaveBeenCalledWith(
      expect.anything(),
      CANDIDATE_ID,
      LIVE_EVENT_ID,
    );
    expect(await readJson(res)).toEqual({
      metaEventId: LIVE_EVENT_ID,
      slug: "summoner-skirmish-2026",
    });
  });

  it("relinks a candidate event", async () => {
    mockServices.relinkCandidateEvent.mockResolvedValue({ metaEventId: LIVE_EVENT_ID, slug: "s" });

    const res = await post(`/candidates/${CANDIDATE_ID}/relink`, { metaEventId: LIVE_EVENT_ID });

    expect(res.status).toBe(200);
    expect(mockServices.relinkCandidateEvent).toHaveBeenCalledWith(
      expect.anything(),
      CANDIDATE_ID,
      LIVE_EVENT_ID,
    );
  });

  it("unlinks a candidate event", async () => {
    mockServices.unlinkCandidateEvent.mockResolvedValue({ metaEventId: null, slug: null });

    const res = await post(`/candidates/${CANDIDATE_ID}/unlink`);

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ metaEventId: null, slug: null });
  });

  it("rejects a link body with no target", async () => {
    const res = await post(`/candidates/${CANDIDATE_ID}/link`, {});

    expect(res.status).toBe(400);
    expect(mockServices.linkCandidateEvent).not.toHaveBeenCalled();
  });

  it("links, relinks and unlinks a candidate player against a live standings row", async () => {
    mockServices.linkCandidatePlayer.mockResolvedValue({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: null,
    });
    mockServices.relinkCandidatePlayer.mockResolvedValue({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: DECK_ID,
    });
    mockServices.unlinkCandidatePlayer.mockResolvedValue({
      metaEventPlayerId: null,
      deckId: null,
    });

    const linked = await post(`/candidate-players/${PLAYER_ID}/link`, {
      metaEventPlayerId: LIVE_PLAYER_ID,
    });
    const relinked = await post(`/candidate-players/${PLAYER_ID}/relink`, {
      metaEventPlayerId: LIVE_PLAYER_ID,
    });
    const unlinked = await post(`/candidate-players/${PLAYER_ID}/unlink`);

    expect(await readJson(linked)).toEqual({ metaEventPlayerId: LIVE_PLAYER_ID, deckId: null });
    expect(await readJson(relinked)).toEqual({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: DECK_ID,
    });
    expect(await readJson(unlinked)).toEqual({ metaEventPlayerId: null, deckId: null });
    expect(mockServices.linkCandidatePlayer).toHaveBeenCalledWith(
      expect.anything(),
      PLAYER_ID,
      LIVE_PLAYER_ID,
    );
  });
});

describe("per-field accept", () => {
  it("takes one named event field", async () => {
    mockServices.acceptMetaEventField.mockResolvedValue({ metaEventId: LIVE_EVENT_ID });

    const res = await post(`/candidates/${CANDIDATE_ID}/accept-field`, { field: "name" });

    expect(res.status).toBe(200);
    expect(mockServices.acceptMetaEventField).toHaveBeenCalledWith(expect.anything(), {
      candidateEventId: CANDIDATE_ID,
      field: "name",
    });
  });

  it("refuses a field outside the writable list", async () => {
    // `slug` is minted once and never renamed, so the wire must not offer it.
    const res = await post(`/candidates/${CANDIDATE_ID}/accept-field`, { field: "slug" });

    expect(res.status).toBe(400);
    expect(mockServices.acceptMetaEventField).not.toHaveBeenCalled();
  });

  it("takes one named standings field and names the reviewing admin", async () => {
    mockServices.acceptMetaPlayerField.mockResolvedValue({ metaEventPlayerId: LIVE_PLAYER_ID });

    const res = await post(`/candidate-players/${PLAYER_ID}/accept-field`, { field: "rank" });

    expect(res.status).toBe(200);
    expect(mockServices.acceptMetaPlayerField).toHaveBeenCalledWith(
      expect.anything(),
      { candidatePlayerId: PLAYER_ID, field: "rank" },
      { resolvedByUserId: USER_ID },
    );
  });

  it("refuses the card list as a per-field accept", async () => {
    // The list moves whole, through accept-list.
    const res = await post(`/candidate-players/${PLAYER_ID}/accept-field`, { field: "cards" });

    expect(res.status).toBe(400);
    expect(mockServices.acceptMetaPlayerField).not.toHaveBeenCalled();
  });

  it("refuses the list status, which only agrees with a list it comes with", async () => {
    const res = await post(`/candidate-players/${PLAYER_ID}/accept-field`, {
      field: "listStatus",
    });

    expect(res.status).toBe(400);
    expect(mockServices.acceptMetaPlayerField).not.toHaveBeenCalled();
  });

  it("takes the whole card list onto its standings row", async () => {
    mockServices.acceptMetaDeckList.mockResolvedValue({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: DECK_ID,
    });

    const res = await post(`/candidate-players/${PLAYER_ID}/accept-list`);

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: DECK_ID,
    });
    expect(mockServices.acceptMetaDeckList).toHaveBeenCalledWith(expect.anything(), PLAYER_ID, {
      resolvedByUserId: USER_ID,
    });
  });
});

describe("whole-entity accept", () => {
  it("passes the confirmation flag, defaulting it to false", async () => {
    mockServices.acceptCandidateEvent.mockResolvedValue({
      metaEventId: LIVE_EVENT_ID,
      slug: "summoner-skirmish-2026",
      created: true,
    });

    const res = await post(`/candidates/${CANDIDATE_ID}/accept`);

    expect(res.status).toBe(200);
    expect(mockServices.acceptCandidateEvent).toHaveBeenCalledWith(
      expect.anything(),
      CANDIDATE_ID,
      { overwriteAll: false },
    );
  });

  it("forwards an explicit confirmation", async () => {
    mockServices.acceptCandidateEvent.mockResolvedValue({
      metaEventId: LIVE_EVENT_ID,
      slug: "s",
      created: false,
    });

    await post(`/candidates/${CANDIDATE_ID}/accept`, { overwriteAll: true });

    expect(mockServices.acceptCandidateEvent).toHaveBeenCalledWith(
      expect.anything(),
      CANDIDATE_ID,
      { overwriteAll: true },
    );
  });

  it("re-labels the multi-source refusal so the UI can prompt instead of failing", async () => {
    mockServices.acceptCandidateEvent.mockRejectedValue(
      new AppError(409, ERROR_CODES.CONFLICT, "This event also carries values from playriftbound."),
    );
    // Linked, so the 409 can only be the overwrite refusal.
    mockCandidates.eventById.mockResolvedValue(candidateEvent({ metaEventId: LIVE_EVENT_ID }));

    const res = await post(`/candidates/${CANDIDATE_ID}/accept`);

    expect(res.status).toBe(409);
    const json = await readJson(res);
    expect(json.code).toBe("OVERWRITE_NOT_CONFIRMED");
    expect(json.message).toContain("playriftbound");
  });

  it("leaves a slug collision as a plain conflict", async () => {
    mockServices.acceptCandidateEvent.mockRejectedValue(
      new AppError(409, ERROR_CODES.CONFLICT, "No free slug available for this event name"),
    );
    // Unlinked, so the only 409 it can produce is the slug one — a dead end for
    // the UI, not a question to confirm.
    mockCandidates.eventById.mockResolvedValue(candidateEvent());

    const res = await post(`/candidates/${CANDIDATE_ID}/accept`);

    expect(res.status).toBe(409);
    const json = await readJson(res);
    expect(json.code).toBe(ERROR_CODES.CONFLICT);
  });

  it("passes the confirmation, the legend override and the acting admin on accept-with-players", async () => {
    mockServices.acceptCandidateEventWithPlayers.mockResolvedValue({
      metaEventId: LIVE_EVENT_ID,
      slug: "s",
      created: true,
      acceptedPlayers: [],
      skippedPlayers: [],
    });

    await post(`/candidates/${CANDIDATE_ID}/accept-with-players`, {
      overwriteAll: true,
      allowUnresolvedLegend: true,
    });

    expect(mockServices.acceptCandidateEventWithPlayers).toHaveBeenCalledWith(
      expect.anything(),
      CANDIDATE_ID,
      { overwriteAll: true, allowUnresolvedLegend: true, resolvedByUserId: USER_ID },
    );
  });

  it("reports the entries an accept-with-players had to skip", async () => {
    mockServices.acceptCandidateEventWithPlayers.mockResolvedValue({
      metaEventId: LIVE_EVENT_ID,
      slug: "s",
      created: true,
      acceptedPlayers: [{ metaEventPlayerId: LIVE_PLAYER_ID, deckId: null, created: true }],
      skippedPlayers: [
        {
          candidatePlayerId: PLAYER_ID,
          externalId: "player-2",
          playerName: "Ekko",
          reason: "Unresolved card names",
        },
      ],
    });

    const res = await post(`/candidates/${CANDIDATE_ID}/accept-with-players`);

    const json = await readJson(res);
    expect(json.acceptedPlayers[0]).toEqual({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: null,
      created: true,
    });
    expect(json.skippedPlayers[0].reason).toBe("Unresolved card names");
  });

  it("files an entry whose legend resolved to nothing only when the admin says so", async () => {
    mockServices.acceptCandidatePlayer.mockResolvedValue({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: null,
      created: true,
    });

    await post(`/candidate-players/${PLAYER_ID}/accept`, { allowUnresolvedLegend: true });

    expect(mockServices.acceptCandidatePlayer).toHaveBeenCalledWith(expect.anything(), PLAYER_ID, {
      allowUnresolvedLegend: true,
      resolvedByUserId: USER_ID,
    });
  });

  it("names the acting admin when accepting one entry, for the submission ledger", async () => {
    mockServices.acceptCandidatePlayer.mockResolvedValue({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: DECK_ID,
      created: true,
    });

    const res = await post(`/candidate-players/${PLAYER_ID}/accept`);

    expect(res.status).toBe(200);
    expect(mockServices.acceptCandidatePlayer).toHaveBeenCalledWith(expect.anything(), PLAYER_ID, {
      allowUnresolvedLegend: false,
      resolvedByUserId: USER_ID,
    });
  });
});

describe("match suggestions", () => {
  it("returns ranked event suggestions", async () => {
    mockServices.suggestMetaEventMatches.mockResolvedValue([
      {
        metaEventId: LIVE_EVENT_ID,
        slug: "summoner-skirmish-2026",
        name: "Summoner Skirmish",
        eventDate: "2026-08-01",
        format: "constructed",
        playerRowCount: 64,
        score: 9.5,
        reasons: ["same format", "same date", "similar name"],
      },
    ]);

    const res = await app.request(
      `/api/admin/v1/meta/candidates/${CANDIDATE_ID}/match-suggestions`,
    );

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.suggestions[0].metaEventId).toBe(LIVE_EVENT_ID);
    expect(json.suggestions[0].playerRowCount).toBe(64);
    expect(json.suggestions[0].reasons).toContain("same date");
    // Travels so an empty list can say why instead of just being empty.
    expect(json.windowDays).toBeGreaterThan(0);
  });

  it("returns an empty list rather than a 404 when nothing matches", async () => {
    mockServices.suggestMetaPlayerMatches.mockResolvedValue([]);

    const res = await app.request(
      `/api/admin/v1/meta/candidate-players/${PLAYER_ID}/match-suggestions`,
    );

    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ suggestions: [] });
  });

  it("states the date window the event gate uses", async () => {
    mockServices.suggestMetaEventMatches.mockResolvedValue([]);

    const res = await app.request(
      `/api/admin/v1/meta/candidates/${CANDIDATE_ID}/match-suggestions`,
    );

    expect(await readJson(res)).toEqual({ suggestions: [], windowDays: MAX_EVENT_MATCH_DAY_DELTA });
  });
});

describe("ignoring", () => {
  it("writes an event's ignore key and leaves the staged row where it is", async () => {
    mockCandidates.eventById.mockResolvedValue(candidateEvent({ metaEventId: LIVE_EVENT_ID }));

    const res = await post(`/candidates/${CANDIDATE_ID}/ignore`);

    expect(res.status).toBe(204);
    expect(mockCandidates.ignoreEvent).toHaveBeenCalledWith("uvsgames", "evt-1");
  });

  it("404s ignoring an unknown candidate event", async () => {
    mockCandidates.eventById.mockResolvedValue(undefined);

    const res = await post(`/candidates/${CANDIDATE_ID}/ignore`);

    expect(res.status).toBe(404);
    expect(mockCandidates.ignoreEvent).not.toHaveBeenCalled();
  });

  it("ignores a provider's entry under its source event's key", async () => {
    mockCandidates.playerById.mockResolvedValue(candidatePlayer());
    mockCandidates.eventById.mockResolvedValue(candidateEvent());

    const res = await post(`/candidate-players/${PLAYER_ID}/ignore`);

    expect(res.status).toBe(204);
    expect(mockCandidates.ignorePlayer).toHaveBeenCalledWith("uvsgames", {
      eventExternalId: "evt-1",
      externalId: "player-1",
    });
  });

  it("refuses a user submission, which has no source event to key on", async () => {
    mockCandidates.playerById.mockResolvedValue(
      candidatePlayer({
        candidateEventId: null,
        metaEventId: LIVE_EVENT_ID,
        submittedByUserId: "user-7",
      }),
    );

    const res = await post(`/candidate-players/${PLAYER_ID}/ignore`);

    expect(res.status).toBe(400);
    expect(mockCandidates.ignorePlayer).not.toHaveBeenCalled();
  });
});
