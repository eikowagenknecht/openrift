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
  deckById: vi.fn(),
  decksByCandidateEventIds: vi.fn(),
  decksByMetaEventIds: vi.fn(),
  liveDecksByIds: vi.fn(),
  liveDeckCards: vi.fn(),
  liveEventsByIds: vi.fn(),
  cardNamesByIds: vi.fn(),
  ignoreDeck: vi.fn(),
};

const mockUsers = { findById: vi.fn() };
const mockDeckFormats = { getBySlug: vi.fn() };

const mockServices = {
  acceptCandidateEvent: vi.fn(),
  acceptCandidateEventWithDecks: vi.fn(),
  acceptCandidateDeck: vi.fn(),
  linkCandidateEvent: vi.fn(),
  relinkCandidateEvent: vi.fn(),
  unlinkCandidateEvent: vi.fn(),
  linkCandidateDeck: vi.fn(),
  relinkCandidateDeck: vi.fn(),
  unlinkCandidateDeck: vi.fn(),
  acceptMetaEventField: vi.fn(),
  acceptMetaDeckField: vi.fn(),
  acceptMetaDeckList: vi.fn(),
  suggestMetaEventMatches: vi.fn(),
  suggestMetaDeckMatches: vi.fn(),
};

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const CANDIDATE_ID = "b0000000-0001-4000-a000-000000000001";
const SIBLING_ID = "b0000000-0001-4000-a000-000000000002";
const DECK_ID = "d0000000-0001-4000-a000-000000000001";
const LIVE_EVENT_ID = "e0000000-0001-4000-a000-000000000001";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
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
    metaEventId: null,
    checkedAt: null,
    extraData: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** @returns A candidate deck row under a candidate event, unless overridden. */
function candidateDeck(overrides: Record<string, unknown> = {}) {
  return {
    id: DECK_ID,
    candidateEventId: CANDIDATE_ID,
    metaEventId: null,
    externalId: "deck-1",
    playerName: "Renata",
    finishTier: 1,
    record: "5-1",
    name: null,
    cards: [],
    listStatus: "full",
    deckId: null,
    submittedByUserId: null,
    submissionNote: null,
    checkedAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
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
  mockCandidates.decksByCandidateEventIds.mockResolvedValue([]);
  mockCandidates.decksByMetaEventIds.mockResolvedValue([]);
  mockCandidates.liveDecksByIds.mockResolvedValue([]);
  mockCandidates.liveDeckCards.mockResolvedValue([]);
  mockCandidates.liveEventsByIds.mockResolvedValue([]);
  mockCandidates.cardNamesByIds.mockResolvedValue(new Map());
  mockDeckFormats.getBySlug.mockResolvedValue({ slug: "constructed" });
});

describe("GET /meta/candidates/{id}", () => {
  it("returns an unlinked candidate as its own only source", async () => {
    mockCandidates.eventById.mockResolvedValue(candidateEvent());
    mockCandidates.decksByCandidateEventIds.mockResolvedValue([candidateDeck()]);

    const res = await app.request(`/api/admin/v1/meta/candidates/${CANDIDATE_ID}`);

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.sources).toHaveLength(1);
    expect(json.sources[0].provider).toBe("uvsgames");
    expect(json.sources[0].decks).toHaveLength(1);
    expect(json.submittedDecks).toEqual([]);
    // An unlinked candidate has no siblings, so nothing goes looking for them.
    expect(mockCandidates.eventsByMetaEventId).not.toHaveBeenCalled();
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
    mockCandidates.decksByCandidateEventIds.mockResolvedValue([
      candidateDeck(),
      candidateDeck({ id: "d0000000-0001-4000-a000-000000000002", candidateEventId: SIBLING_ID }),
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
    // Each column carries only its own decks, and `decks` stays this
    // candidate's own — the review screen reads both.
    expect(json.sources[1].decks).toHaveLength(1);
    expect(json.decks).toHaveLength(1);
  });

  it("carries the directly-submitted decks with their submitter resolved", async () => {
    mockCandidates.eventById.mockResolvedValue(candidateEvent({ metaEventId: LIVE_EVENT_ID }));
    mockCandidates.eventsByMetaEventId.mockResolvedValue([
      candidateEvent({ metaEventId: LIVE_EVENT_ID }),
    ]);
    mockCandidates.decksByMetaEventIds.mockResolvedValue([
      candidateDeck({
        id: "d0000000-0001-4000-a000-000000000003",
        candidateEventId: null,
        metaEventId: LIVE_EVENT_ID,
        submittedByUserId: "user-7",
        submissionNote: "Saw it on stream.",
      }),
    ]);
    mockUsers.findById.mockResolvedValue({ id: "user-7", name: "Skarner Fan", email: "x@y.z" });

    const res = await app.request(`/api/admin/v1/meta/candidates/${CANDIDATE_ID}`);

    const json = await readJson(res);
    expect(json.submittedDecks).toHaveLength(1);
    expect(json.submittedDecks[0].submittedByName).toBe("Skarner Fan");
    expect(json.submittedDecks[0].submissionNote).toBe("Saw it on stream.");
    // One lookup per distinct submitter, and none at all for provider decks.
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

  it("links, relinks and unlinks a candidate deck", async () => {
    mockServices.linkCandidateDeck.mockResolvedValue({ deckId: "live-deck" });
    mockServices.relinkCandidateDeck.mockResolvedValue({ deckId: "other-deck" });
    mockServices.unlinkCandidateDeck.mockResolvedValue({ deckId: null });

    const linked = await post(`/candidate-decks/${DECK_ID}/link`, { deckId: LIVE_EVENT_ID });
    const relinked = await post(`/candidate-decks/${DECK_ID}/relink`, { deckId: LIVE_EVENT_ID });
    const unlinked = await post(`/candidate-decks/${DECK_ID}/unlink`);

    expect(await readJson(linked)).toEqual({ deckId: "live-deck" });
    expect(await readJson(relinked)).toEqual({ deckId: "other-deck" });
    expect(await readJson(unlinked)).toEqual({ deckId: null });
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

  it("takes one named deck field and names the reviewing admin", async () => {
    mockServices.acceptMetaDeckField.mockResolvedValue({ deckId: "live-deck" });

    const res = await post(`/candidate-decks/${DECK_ID}/accept-field`, { field: "finishTier" });

    expect(res.status).toBe(200);
    expect(mockServices.acceptMetaDeckField).toHaveBeenCalledWith(
      expect.anything(),
      { candidateDeckId: DECK_ID, field: "finishTier" },
      { resolvedByUserId: USER_ID },
    );
  });

  it("refuses the card list as a per-field accept", async () => {
    // The list moves whole, through accept-list.
    const res = await post(`/candidate-decks/${DECK_ID}/accept-field`, { field: "cards" });

    expect(res.status).toBe(400);
    expect(mockServices.acceptMetaDeckField).not.toHaveBeenCalled();
  });

  it("takes the whole card list", async () => {
    mockServices.acceptMetaDeckList.mockResolvedValue({ deckId: "live-deck" });

    const res = await post(`/candidate-decks/${DECK_ID}/accept-list`);

    expect(res.status).toBe(200);
    expect(mockServices.acceptMetaDeckList).toHaveBeenCalledWith(expect.anything(), DECK_ID, {
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

  it("passes both the confirmation and the acting admin on accept-with-decks", async () => {
    mockServices.acceptCandidateEventWithDecks.mockResolvedValue({
      metaEventId: LIVE_EVENT_ID,
      slug: "s",
      created: true,
      acceptedDecks: [],
      skippedDecks: [],
    });

    await post(`/candidates/${CANDIDATE_ID}/accept-with-decks`, { overwriteAll: true });

    expect(mockServices.acceptCandidateEventWithDecks).toHaveBeenCalledWith(
      expect.anything(),
      CANDIDATE_ID,
      { overwriteAll: true, resolvedByUserId: USER_ID },
    );
  });

  it("names the acting admin when accepting one deck, for the submission ledger", async () => {
    mockServices.acceptCandidateDeck.mockResolvedValue({ deckId: "live-deck", created: true });

    const res = await post(`/candidate-decks/${DECK_ID}/accept`);

    expect(res.status).toBe(200);
    expect(mockServices.acceptCandidateDeck).toHaveBeenCalledWith(expect.anything(), DECK_ID, {
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
        deckCount: 8,
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
    expect(json.suggestions[0].reasons).toContain("same date");
    // Travels so an empty list can say why instead of just being empty.
    expect(json.windowDays).toBeGreaterThan(0);
  });

  it("returns an empty list rather than a 404 when nothing matches", async () => {
    mockServices.suggestMetaDeckMatches.mockResolvedValue([]);

    const res = await app.request(
      `/api/admin/v1/meta/candidate-decks/${DECK_ID}/match-suggestions`,
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

describe("POST /meta/candidate-decks/{id}/ignore", () => {
  it("ignores a provider's deck under its source event's key", async () => {
    mockCandidates.deckById.mockResolvedValue(candidateDeck());
    mockCandidates.eventById.mockResolvedValue(candidateEvent());

    const res = await post(`/candidate-decks/${DECK_ID}/ignore`);

    expect(res.status).toBe(204);
    expect(mockCandidates.ignoreDeck).toHaveBeenCalledWith(
      "uvsgames",
      { eventExternalId: "evt-1", externalId: "deck-1" },
      DECK_ID,
    );
  });

  it("refuses a user submission, which has no source event to key on", async () => {
    mockCandidates.deckById.mockResolvedValue(
      candidateDeck({
        candidateEventId: null,
        metaEventId: LIVE_EVENT_ID,
        submittedByUserId: "user-7",
      }),
    );

    const res = await post(`/candidate-decks/${DECK_ID}/ignore`);

    expect(res.status).toBe(400);
    expect(mockCandidates.ignoreDeck).not.toHaveBeenCalled();
  });
});
