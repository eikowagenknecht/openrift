import {
  META_EVENT_ACCEPT_FIELDS,
  META_PLAYER_ACCEPT_FIELDS,
} from "@openrift/shared/contracts/admin/meta";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type {
  CandidateMetaEventRow,
  CandidateMetaPlayerRow,
} from "../repositories/meta-candidates.js";
import type { LiveMetaPlayerRow } from "../repositories/meta.js";
import {
  acceptCandidateEvent,
  acceptCandidateEventWithPlayers,
  acceptCandidatePlayer,
  acceptMetaDeckList,
  acceptMetaEventField,
  acceptMetaPlayerField,
  linkCandidateEvent,
  linkCandidatePlayer,
  relinkCandidateEvent,
  rematchMetaCandidates,
  unlinkCandidateEvent,
  unlinkCandidatePlayer,
} from "./meta-candidate-accept.js";

const CANDIDATE_EVENT_ID = "3f7a1c2e-0000-7000-8000-000000000001";
const CANDIDATE_PLAYER_ID = "3f7a1c2e-0000-7000-8000-000000000010";
const LIVE_EVENT_ID = "3f7a1c2e-0000-7000-8000-0000000000e1";
const OTHER_EVENT_ID = "3f7a1c2e-0000-7000-8000-0000000000e2";
const LIVE_PLAYER_ID = "3f7a1c2e-0000-7000-8000-0000000000p1";
const LIVE_DECK_ID = "3f7a1c2e-0000-7000-8000-0000000000d1";

/** The scalar columns whose accept writes the candidate's own value through. */
const META_PLAYER_SCALAR_FIELDS = META_PLAYER_ACCEPT_FIELDS.filter(
  (field) => field !== "legend" && field !== "champion",
);

/** @returns A candidate event, unlinked unless told otherwise. */
function candidateEvent(overrides: Partial<CandidateMetaEventRow> = {}): CandidateMetaEventRow {
  return {
    id: CANDIDATE_EVENT_ID,
    provider: "uvsgames",
    externalId: "evt-482",
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    sourceUrl: "https://example.invalid/uvs",
    notes: "Top 8 lists only.",
    tier: "store",
    country: "DE",
    location: "Kartenstraße 1, 10115 Berlin, DE",
    metaEventId: null,
    raw: null,
    fetchedAt: null,
    checkedAt: null,
    extraData: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-02T10:00:00.000Z"),
    ...overrides,
  };
}

/** @returns A candidate standings row carrying a list whose cards all resolved. */
function candidatePlayer(overrides: Partial<CandidateMetaPlayerRow> = {}): CandidateMetaPlayerRow {
  return {
    id: CANDIDATE_PLAYER_ID,
    candidateEventId: CANDIDATE_EVENT_ID,
    metaEventId: null,
    externalId: "player-991",
    playerName: "Nova",
    uvsgamesPlayerId: null,
    rank: 2,
    rankIsTier: false,
    wins: 4,
    losses: 2,
    draws: 0,
    matchPoints: null,
    opponentMatchWinPct: null,
    gameWinPct: null,
    opponentGameWinPct: null,
    entryStatus: null,
    legendName: "Azir",
    legendCardId: "card-azir",
    championName: null,
    championCardId: null,
    cards: [
      { name: "Azir", zone: "legend", quantity: 1, cardId: "card-azir" },
      { name: "Shock", zone: "main", quantity: 3, cardId: "card-shock" },
    ],
    listStatus: "full",
    metaEventPlayerId: null,
    submittedByUserId: null,
    submissionNote: null,
    checkedAt: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-02T10:00:00.000Z"),
    ...overrides,
  };
}

/** @returns A candidate the source published standings for and no list. */
function standingsOnlyPlayer(
  overrides: Partial<CandidateMetaPlayerRow> = {},
): CandidateMetaPlayerRow {
  return candidatePlayer({ cards: null, listStatus: "none", ...overrides });
}

/** The live event a link points at. */
const liveEvent = {
  id: LIVE_EVENT_ID,
  slug: "summoner-skirmish-berlin",
  name: "Summoner Skirmish Berlin (uvs)",
  eventDate: "2026-08-01",
  format: "constructed",
  playerCount: 32,
  organizer: null,
  notes: null,
  playerRowCount: 32,
  deckCount: 4,
};

/** @returns The live standings row `livePlayersByIds` hands back. */
function livePlayer(overrides: Partial<LiveMetaPlayerRow> = {}): LiveMetaPlayerRow {
  return {
    id: LIVE_PLAYER_ID,
    metaEventId: LIVE_EVENT_ID,
    rank: 1,
    rankIsTier: false,
    playerName: "Nova",
    wins: 5,
    losses: 1,
    draws: 0,
    legendCardId: "card-azir",
    championCardId: null,
    listStatus: "full",
    deckId: LIVE_DECK_ID,
    deckName: "Azir Control",
    shareToken: "aB3dE5gH7jK9",
    ...overrides,
  };
}

/**
 * @param options.event The candidate event the repos hand back.
 * @param options.player The candidate standings row the repos hand back.
 * @param options.live The live standings row a link or accept resolves to.
 * @param options.liveDeckCards What the linked live deck currently holds.
 * @param options.cardIds The name matcher's index, by card name.
 * @returns A fake {@link Repos} and the stubs a test asserts on.
 */
function harness(options: {
  event?: CandidateMetaEventRow;
  player?: CandidateMetaPlayerRow;
  live?: LiveMetaPlayerRow;
  liveDeckCards?: { deckId: string; cardId: string; zone: string; quantity: number }[];
  cardIds?: Record<string, string>;
}) {
  const stubs = {
    deleteEventSourceByKey: vi.fn().mockResolvedValue(true),
    insertEventSource: vi.fn().mockResolvedValue({ id: "source-1" }),
    linkEvent: vi.fn().mockResolvedValue(true),
    unlinkEvent: vi.fn().mockResolvedValue(true),
    linkPlayer: vi.fn().mockResolvedValue(true),
    unlinkPlayer: vi.fn().mockResolvedValue(true),
    updateEvent: vi.fn().mockResolvedValue(true),
    updatePlayer: vi.fn().mockResolvedValue(true),
    createPlayer: vi
      .fn()
      .mockResolvedValue({ metaEventPlayerId: LIVE_PLAYER_ID, deckId: LIVE_DECK_ID }),
    setPlayerDeck: vi.fn().mockResolvedValue({ deckId: LIVE_DECK_ID }),
    insertCredit: vi.fn().mockResolvedValue(undefined),
    deleteCreditsForPlayer: vi.fn().mockResolvedValue(undefined),
    recordAcceptance: vi.fn().mockResolvedValue(undefined),
    setEventCheckedAt: vi.fn().mockResolvedValue(true),
    setPlayerCheckedAt: vi.fn().mockResolvedValue(true),
    updateCandidatePlayer: vi.fn().mockResolvedValue(undefined),
    replaceEventPhases: vi.fn().mockResolvedValue(undefined),
    unmaterializedMatches: vi.fn().mockResolvedValue([]),
  };

  const cardIds = options.cardIds ?? { Azir: "card-azir", Shock: "card-shock" };

  const repos = {
    meta: {
      eventById: vi.fn().mockResolvedValue(liveEvent),
      eventBySlug: vi.fn().mockResolvedValue(undefined),
      createEvent: vi.fn().mockResolvedValue(liveEvent),
      updateEvent: stubs.updateEvent,
      updatePlayer: stubs.updatePlayer,
      createPlayer: stubs.createPlayer,
      setPlayerDeck: stubs.setPlayerDeck,
      livePlayersByIds: vi.fn().mockResolvedValue([options.live ?? livePlayer()]),
      replaceEventPhases: stubs.replaceEventPhases,
      upsertEventMatches: vi.fn().mockResolvedValue([]),
      deleteEventSourceByKey: stubs.deleteEventSourceByKey,
      insertEventSource: stubs.insertEventSource,
      insertCredit: stubs.insertCredit,
      deleteCreditsForPlayer: stubs.deleteCreditsForPlayer,
    },
    metaCandidates: {
      eventById: vi.fn().mockResolvedValue(options.event),
      playerById: vi.fn().mockResolvedValue(options.player),
      linkEvent: stubs.linkEvent,
      unlinkEvent: stubs.unlinkEvent,
      linkPlayer: stubs.linkPlayer,
      unlinkPlayer: stubs.unlinkPlayer,
      setEventCheckedAt: stubs.setEventCheckedAt,
      setPlayerCheckedAt: stubs.setPlayerCheckedAt,
      updatePlayer: stubs.updateCandidatePlayer,
      liveDeckCards: vi.fn().mockResolvedValue(options.liveDeckCards ?? []),
      playersByCandidateEventIds: vi
        .fn()
        .mockResolvedValue(options.player === undefined ? [] : [options.player]),
      playersWithUnresolvedNames: vi.fn().mockResolvedValue([]),
      unmaterializedMatches: stubs.unmaterializedMatches,
      setMatchLiveIds: vi.fn().mockResolvedValue(undefined),
      cardNamesByIds: vi.fn().mockResolvedValue(new Map([["card-azir", "Azir"]])),
      // Only this candidate feeds the live event unless a test says otherwise.
      eventsByMetaEventId: vi
        .fn()
        .mockResolvedValue(options.event === undefined ? [] : [options.event]),
    },
    metaSubmissions: {
      byCandidatePlayerId: vi.fn().mockResolvedValue({ id: "submission-1" }),
      recordAcceptance: stubs.recordAcceptance,
    },
    ingest: {
      allCardNorms: vi
        .fn()
        .mockResolvedValue(
          Object.entries(cardIds).map(([name, id]) => ({ id, normName: name.toLowerCase() })),
        ),
      allCardNameAliases: vi.fn().mockResolvedValue([]),
    },
    deckFormats: { getBySlug: vi.fn().mockResolvedValue({ slug: "constructed" }) },
  } as unknown as Repos;

  return { repos, stubs };
}

describe("linkCandidateEvent", () => {
  it("cites the source and points the candidate at the live event", async () => {
    const { repos, stubs } = harness({ event: candidateEvent() });
    const result = await linkCandidateEvent(repos, CANDIDATE_EVENT_ID, LIVE_EVENT_ID);

    expect(result).toEqual({ metaEventId: LIVE_EVENT_ID, slug: liveEvent.slug });
    expect(stubs.insertEventSource).toHaveBeenCalledWith({
      metaEventId: LIVE_EVENT_ID,
      provider: "uvsgames",
      externalId: "evt-482",
      label: "uvsgames",
      sourceUrl: "https://example.invalid/uvs",
    });
    expect(stubs.linkEvent).toHaveBeenCalledWith(
      CANDIDATE_EVENT_ID,
      LIVE_EVENT_ID,
      expect.any(Date),
    );
  });

  it("writes no field value, so the other source's values survive", async () => {
    const { repos, stubs } = harness({ event: candidateEvent() });
    await linkCandidateEvent(repos, CANDIDATE_EVENT_ID, LIVE_EVENT_ID);
    expect(stubs.updateEvent).not.toHaveBeenCalled();
  });

  it("refuses a candidate that is already linked", async () => {
    const { repos } = harness({ event: candidateEvent({ metaEventId: OTHER_EVENT_ID }) });
    await expect(
      linkCandidateEvent(repos, CANDIDATE_EVENT_ID, LIVE_EVENT_ID),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("404s on a live event that is gone", async () => {
    const { repos } = harness({ event: candidateEvent() });
    vi.mocked(repos.meta.eventById).mockResolvedValue(undefined);
    await expect(
      linkCandidateEvent(repos, CANDIDATE_EVENT_ID, LIVE_EVENT_ID),
    ).rejects.toBeInstanceOf(AppError);
  });
});

describe("relinkCandidateEvent", () => {
  it("takes the citation with it, so no stale credit is left behind", async () => {
    const { repos, stubs } = harness({ event: candidateEvent({ metaEventId: OTHER_EVENT_ID }) });
    await relinkCandidateEvent(repos, CANDIDATE_EVENT_ID, LIVE_EVENT_ID);

    expect(stubs.deleteEventSourceByKey).toHaveBeenCalledWith("uvsgames", "evt-482");
    expect(stubs.insertEventSource).toHaveBeenCalledWith(
      expect.objectContaining({ metaEventId: LIVE_EVENT_ID }),
    );
  });
});

describe("unlinkCandidateEvent", () => {
  it("removes the citation and clears the link, changing no field", async () => {
    const { repos, stubs } = harness({ event: candidateEvent({ metaEventId: LIVE_EVENT_ID }) });
    const result = await unlinkCandidateEvent(repos, CANDIDATE_EVENT_ID);

    expect(result).toEqual({ metaEventId: null, slug: null });
    expect(stubs.deleteEventSourceByKey).toHaveBeenCalledWith("uvsgames", "evt-482");
    expect(stubs.unlinkEvent).toHaveBeenCalledWith(CANDIDATE_EVENT_ID);
    expect(stubs.updateEvent).not.toHaveBeenCalled();
  });
});

describe("acceptCandidateEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes every field of the only source feeding the event, no flag needed", async () => {
    const candidate = candidateEvent({ metaEventId: LIVE_EVENT_ID });
    const { repos, stubs } = harness({ event: candidate });
    const result = await acceptCandidateEvent(repos, CANDIDATE_EVENT_ID);

    expect(result).toEqual({ metaEventId: LIVE_EVENT_ID, slug: liveEvent.slug, created: false });
    expect(stubs.updateEvent).toHaveBeenCalledWith(LIVE_EVENT_ID, {
      name: candidate.name,
      eventDate: candidate.eventDate,
      format: candidate.format,
      playerCount: candidate.playerCount,
      organizer: candidate.organizer,
      notes: candidate.notes,
      tier: candidate.tier,
      country: candidate.country,
      location: candidate.location,
    });
  });

  it("leaves tier, country, and address alone when the source holds none", async () => {
    const candidate = candidateEvent({
      metaEventId: LIVE_EVENT_ID,
      tier: null,
      country: null,
      location: null,
    });
    const { repos, stubs } = harness({ event: candidate });
    await acceptCandidateEvent(repos, CANDIDATE_EVENT_ID);

    expect(stubs.updateEvent).toHaveBeenCalledWith(LIVE_EVENT_ID, {
      name: candidate.name,
      eventDate: candidate.eventDate,
      format: candidate.format,
      playerCount: candidate.playerCount,
      organizer: candidate.organizer,
      notes: candidate.notes,
    });
  });

  it("refuses to clobber a second source's values, naming it", async () => {
    const candidate = candidateEvent({ metaEventId: LIVE_EVENT_ID });
    const { repos, stubs } = harness({ event: candidate });
    vi.mocked(repos.metaCandidates.eventsByMetaEventId).mockResolvedValue([
      candidate,
      candidateEvent({
        id: "3f7a1c2e-0000-7000-8000-000000000002",
        provider: "playriftbound",
        metaEventId: LIVE_EVENT_ID,
      }),
    ]);

    await expect(acceptCandidateEvent(repos, CANDIDATE_EVENT_ID)).rejects.toThrow(/playriftbound/u);
    expect(stubs.updateEvent).not.toHaveBeenCalled();
  });

  it("goes through once the overwrite is confirmed", async () => {
    const candidate = candidateEvent({ metaEventId: LIVE_EVENT_ID });
    const { repos, stubs } = harness({ event: candidate });
    vi.mocked(repos.metaCandidates.eventsByMetaEventId).mockResolvedValue([
      candidate,
      candidateEvent({
        id: "3f7a1c2e-0000-7000-8000-000000000002",
        provider: "playriftbound",
        metaEventId: LIVE_EVENT_ID,
      }),
    ]);

    await acceptCandidateEvent(repos, CANDIDATE_EVENT_ID, { overwriteAll: true });
    expect(stubs.updateEvent).toHaveBeenCalled();
  });

  it("does not ask the question on the unlinked one-click path", async () => {
    const { repos } = harness({ event: candidateEvent() });
    await acceptCandidateEvent(repos, CANDIDATE_EVENT_ID);
    expect(repos.metaCandidates.eventsByMetaEventId).not.toHaveBeenCalled();
  });

  it("gives a candidate no producer classified the player-count placeholder", async () => {
    const candidate = candidateEvent({ tier: null, playerCount: 500 });
    const { repos } = harness({ event: candidate });
    await acceptCandidateEvent(repos, CANDIDATE_EVENT_ID);

    expect(repos.meta.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "competitive" }),
    );
  });
});

describe("acceptMetaEventField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(META_EVENT_ACCEPT_FIELDS)("writes exactly the %s column", async (field) => {
    const candidate = candidateEvent({ metaEventId: LIVE_EVENT_ID });
    const { repos, stubs } = harness({ event: candidate });
    await acceptMetaEventField(repos, { candidateEventId: CANDIDATE_EVENT_ID, field });

    expect(stubs.updateEvent).toHaveBeenCalledWith(LIVE_EVENT_ID, { [field]: candidate[field] });
  });

  it("leaves the review state alone, since one field is not the whole row", async () => {
    const { repos, stubs } = harness({ event: candidateEvent({ metaEventId: LIVE_EVENT_ID }) });
    await acceptMetaEventField(repos, { candidateEventId: CANDIDATE_EVENT_ID, field: "name" });
    expect(stubs.setEventCheckedAt).not.toHaveBeenCalled();
  });

  it("refuses a format the archive does not know", async () => {
    const { repos, stubs } = harness({ event: candidateEvent({ metaEventId: LIVE_EVENT_ID }) });
    vi.mocked(repos.deckFormats.getBySlug).mockResolvedValue(undefined);

    await expect(
      acceptMetaEventField(repos, { candidateEventId: CANDIDATE_EVENT_ID, field: "format" }),
    ).rejects.toBeInstanceOf(AppError);
    expect(stubs.updateEvent).not.toHaveBeenCalled();
  });

  it("refuses an unlinked candidate: there is nothing to write into", async () => {
    const { repos } = harness({ event: candidateEvent() });
    await expect(
      acceptMetaEventField(repos, { candidateEventId: CANDIDATE_EVENT_ID, field: "name" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it.each(["tier", "country", "location"] as const)(
    "refuses to take a %s the source holds nothing for",
    async (field) => {
      const candidate = candidateEvent({ metaEventId: LIVE_EVENT_ID, [field]: null });
      const { repos, stubs } = harness({ event: candidate });

      await expect(
        acceptMetaEventField(repos, { candidateEventId: CANDIDATE_EVENT_ID, field }),
      ).rejects.toBeInstanceOf(AppError);
      expect(stubs.updateEvent).not.toHaveBeenCalled();
    },
  );
});

describe("linkCandidatePlayer", () => {
  it("links a standings row inside its own event", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer(),
    });
    const result = await linkCandidatePlayer(repos, CANDIDATE_PLAYER_ID, LIVE_PLAYER_ID);

    expect(result).toEqual({ metaEventPlayerId: LIVE_PLAYER_ID, deckId: LIVE_DECK_ID });
    expect(stubs.linkPlayer).toHaveBeenCalledWith(
      CANDIDATE_PLAYER_ID,
      LIVE_PLAYER_ID,
      expect.any(Date),
    );
  });

  it("refuses a standings row that belongs to another event", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer(),
      live: livePlayer({ metaEventId: OTHER_EVENT_ID }),
    });
    await expect(
      linkCandidatePlayer(repos, CANDIDATE_PLAYER_ID, LIVE_PLAYER_ID),
    ).rejects.toBeInstanceOf(AppError);
    expect(stubs.linkPlayer).not.toHaveBeenCalled();
  });

  it("refuses while the entry's event is still unlinked", async () => {
    const { repos } = harness({ event: candidateEvent(), player: candidatePlayer() });
    await expect(
      linkCandidatePlayer(repos, CANDIDATE_PLAYER_ID, LIVE_PLAYER_ID),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("refuses a candidate that is already linked", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: "3f7a1c2e-0000-7000-8000-0000000000p2" }),
    });
    await expect(
      linkCandidatePlayer(repos, CANDIDATE_PLAYER_ID, LIVE_PLAYER_ID),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("resolves a user submission's event through its own column", async () => {
    const { repos, stubs } = harness({
      player: candidatePlayer({ candidateEventId: null, metaEventId: LIVE_EVENT_ID }),
    });
    await linkCandidatePlayer(repos, CANDIDATE_PLAYER_ID, LIVE_PLAYER_ID);
    expect(stubs.linkPlayer).toHaveBeenCalled();
  });
});

describe("unlinkCandidatePlayer", () => {
  it("takes back only this contributor's credit", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        metaEventPlayerId: LIVE_PLAYER_ID,
        submittedByUserId: "user-1",
      }),
    });
    const result = await unlinkCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(result).toEqual({ metaEventPlayerId: null, deckId: null });
    expect(stubs.deleteCreditsForPlayer).toHaveBeenCalledWith(LIVE_PLAYER_ID, "user-1");
    expect(stubs.unlinkPlayer).toHaveBeenCalledWith(CANDIDATE_PLAYER_ID);
  });

  it("touches no credit for a provider's entry", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID }),
    });
    await unlinkCandidatePlayer(repos, CANDIDATE_PLAYER_ID);
    expect(stubs.deleteCreditsForPlayer).not.toHaveBeenCalled();
  });
});

describe("acceptMetaPlayerField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(META_PLAYER_SCALAR_FIELDS)("writes exactly the %s column", async (field) => {
    const player = candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID });
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player,
    });
    await acceptMetaPlayerField(repos, { candidatePlayerId: CANDIDATE_PLAYER_ID, field });

    expect(stubs.updatePlayer).toHaveBeenCalledWith(LIVE_PLAYER_ID, { [field]: player[field] });
  });

  it("writes the legend's resolved card id, not the name the source wrote", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        metaEventPlayerId: LIVE_PLAYER_ID,
        cards: null,
        listStatus: "none",
        legendName: "Azir",
        legendCardId: "card-azir",
      }),
    });
    await acceptMetaPlayerField(repos, {
      candidatePlayerId: CANDIDATE_PLAYER_ID,
      field: "legend",
    });

    expect(stubs.updatePlayer).toHaveBeenCalledWith(LIVE_PLAYER_ID, {
      legendCardId: "card-azir",
    });
  });

  it("prefers the list's own legend zone over the source's separate pick", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        metaEventPlayerId: LIVE_PLAYER_ID,
        legendCardId: "card-stale",
        cards: [{ name: "Azir", zone: "legend", quantity: 1, cardId: "card-azir" }],
      }),
    });
    await acceptMetaPlayerField(repos, {
      candidatePlayerId: CANDIDATE_PLAYER_ID,
      field: "legend",
    });

    expect(stubs.updatePlayer).toHaveBeenCalledWith(LIVE_PLAYER_ID, {
      legendCardId: "card-azir",
    });
  });

  it("writes the champion's resolved card id", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        metaEventPlayerId: LIVE_PLAYER_ID,
        cards: [{ name: "Vi", zone: "champion", quantity: 1, cardId: "card-vi" }],
      }),
    });
    await acceptMetaPlayerField(repos, {
      candidatePlayerId: CANDIDATE_PLAYER_ID,
      field: "champion",
    });

    expect(stubs.updatePlayer).toHaveBeenCalledWith(LIVE_PLAYER_ID, {
      championCardId: "card-vi",
    });
  });

  it("refuses an unlinked candidate entry", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer(),
    });
    await expect(
      acceptMetaPlayerField(repos, { candidatePlayerId: CANDIDATE_PLAYER_ID, field: "rank" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("credits the contributor and settles their ledger row", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        metaEventPlayerId: LIVE_PLAYER_ID,
        submittedByUserId: "user-1",
      }),
    });
    await acceptMetaPlayerField(
      repos,
      { candidatePlayerId: CANDIDATE_PLAYER_ID, field: "rank" },
      { resolvedByUserId: "admin-1" },
    );

    expect(stubs.recordAcceptance).toHaveBeenCalledWith({
      submissionId: "submission-1",
      credit: {
        metaEventId: LIVE_EVENT_ID,
        metaEventPlayerId: LIVE_PLAYER_ID,
        userId: "user-1",
      },
      acceptedDeckId: LIVE_DECK_ID,
      resolvedAt: expect.any(Date),
      resolvedByUserId: "admin-1",
    });
  });

  it("credits nobody for a provider's entry", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID }),
    });
    await acceptMetaPlayerField(repos, { candidatePlayerId: CANDIDATE_PLAYER_ID, field: "rank" });
    expect(stubs.recordAcceptance).not.toHaveBeenCalled();
  });
});

describe("acceptMetaDeckList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces the whole list along with what it claims to be", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID, listStatus: "partial" }),
    });
    const result = await acceptMetaDeckList(repos, CANDIDATE_PLAYER_ID);

    expect(result).toEqual({ metaEventPlayerId: LIVE_PLAYER_ID, deckId: LIVE_DECK_ID });
    expect(stubs.setPlayerDeck).toHaveBeenCalledWith(
      LIVE_PLAYER_ID,
      expect.objectContaining({
        cards: [
          { cardId: "card-azir", zone: "legend", quantity: 1, preferredPrintingId: null },
          { cardId: "card-shock", zone: "main", quantity: 3, preferredPrintingId: null },
        ],
        listStatus: "partial",
      }),
      expect.any(String),
    );
  });

  it("keeps the name the maintainer already gave the archived deck", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID }),
      live: livePlayer({ deckName: "Azir Control" }),
    });
    await acceptMetaDeckList(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.setPlayerDeck).toHaveBeenCalledWith(
      LIVE_PLAYER_ID,
      expect.objectContaining({ name: "Azir Control", format: liveEvent.format }),
      expect.any(String),
    );
  });

  it("names a first list after its legend and player", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID }),
      live: livePlayer({ deckId: null, deckName: null, shareToken: null, listStatus: "none" }),
    });
    await acceptMetaDeckList(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.setPlayerDeck).toHaveBeenCalledWith(
      LIVE_PLAYER_ID,
      expect.objectContaining({ name: "Azir (Nova)" }),
      expect.any(String),
    );
  });

  it("refuses a list holding a name that matched nothing", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        metaEventPlayerId: LIVE_PLAYER_ID,
        cards: [{ name: "Azyr", zone: "legend", quantity: 1, cardId: null }],
      }),
    });
    await expect(acceptMetaDeckList(repos, CANDIDATE_PLAYER_ID)).rejects.toBeInstanceOf(AppError);
  });

  it("refuses an entry the source published standings only for", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer({ metaEventPlayerId: LIVE_PLAYER_ID }),
    });
    await expect(acceptMetaDeckList(repos, CANDIDATE_PLAYER_ID)).rejects.toBeInstanceOf(AppError);
    expect(stubs.setPlayerDeck).not.toHaveBeenCalled();
  });

  it("refuses an unlinked candidate entry", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer(),
    });
    await expect(acceptMetaDeckList(repos, CANDIDATE_PLAYER_ID)).rejects.toBeInstanceOf(AppError);
  });
});

describe("acceptCandidatePlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("files a source-identified player under their id, with no name of its own", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer({ uvsgamesPlayerId: 218_662 }),
    });
    stubs.createPlayer.mockResolvedValue({ metaEventPlayerId: LIVE_PLAYER_ID, deckId: null });

    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    // The name is the source's to change, so the archive stores no copy of it.
    expect(stubs.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ playerName: null, uvsgamesPlayerId: 218_662 }),
      // No list, so no deck and no permalink to mint.
      null,
    );
  });

  it("files a pushed player under the name it was staged with", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer({ playerName: "Ekko", uvsgamesPlayerId: null }),
    });
    stubs.createPlayer.mockResolvedValue({ metaEventPlayerId: LIVE_PLAYER_ID, deckId: null });

    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ playerName: "Ekko" }),
      null,
    );
    expect(stubs.createPlayer.mock.calls[0][0]).not.toHaveProperty("uvsgamesPlayerId");
  });

  it("files a standings-only entry as a live row with no deck", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer(),
    });
    stubs.createPlayer.mockResolvedValue({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: null,
    });
    const result = await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(result).toEqual({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: null,
      created: true,
    });
    expect(stubs.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: LIVE_EVENT_ID,
        playerName: "Nova",
        rank: 2,
        rankIsTier: false,
        wins: 4,
        losses: 2,
        draws: 0,
        legendCardId: "card-azir",
        championCardId: null,
        deck: null,
      }),
      null,
    );
    expect(stubs.linkPlayer).toHaveBeenCalledWith(
      CANDIDATE_PLAYER_ID,
      LIVE_PLAYER_ID,
      expect.any(Date),
    );
  });

  it("carries a tier-only rank across as a tier", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer({ rank: 8, rankIsTier: true }),
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ rank: 8, rankIsTier: true }),
      null,
    );
  });

  it("builds the archived deck when the source published a list", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer(),
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        deck: expect.objectContaining({
          name: "Azir (Nova)",
          format: liveEvent.format,
          listStatus: "full",
          cards: [
            { cardId: "card-azir", zone: "legend", quantity: 1, preferredPrintingId: null },
            { cardId: "card-shock", zone: "main", quantity: 3, preferredPrintingId: null },
          ],
        }),
      }),
      expect.any(String),
    );
  });

  it("takes the legend from the list's own zone rather than the source's pick", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ legendCardId: "card-stale" }),
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ legendCardId: "card-azir" }),
      expect.any(String),
    );
  });

  it("sums two lines that resolved to one card and zone", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        legendCardId: null,
        legendName: null,
        cards: [
          { name: "Shock", zone: "main", quantity: 2, cardId: "card-shock" },
          { name: "shock", zone: "main", quantity: 1, cardId: "card-shock" },
        ],
      }),
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.createPlayer.mock.calls[0][0].deck.cards).toEqual([
      { cardId: "card-shock", zone: "main", quantity: 3, preferredPrintingId: null },
    ]);
  });

  it("files the legend the source published beside the list into the deck", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        cards: [{ name: "Shock", zone: "main", quantity: 3, cardId: "card-shock" }],
      }),
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.createPlayer.mock.calls[0][0].deck.cards).toEqual([
      { cardId: "card-shock", zone: "main", quantity: 3, preferredPrintingId: null },
      { cardId: "card-azir", zone: "legend", quantity: 1, preferredPrintingId: null },
    ]);
  });

  it("leaves the list's own legend alone rather than adding the source's pick beside it", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        legendCardId: "card-stale",
        cards: [{ name: "Azir", zone: "legend", quantity: 1, cardId: "card-azir" }],
      }),
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.createPlayer.mock.calls[0][0].deck.cards).toEqual([
      { cardId: "card-azir", zone: "legend", quantity: 1, preferredPrintingId: null },
    ]);
  });

  it("gives a standings-only entry no deck, legend or not", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer(),
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.createPlayer.mock.calls[0][0].deck).toBeNull();
  });

  it("refuses while the entry's event is still unlinked", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent(),
      player: candidatePlayer(),
    });
    await expect(acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID)).rejects.toBeInstanceOf(
      AppError,
    );
    expect(stubs.createPlayer).not.toHaveBeenCalled();
  });

  it("refuses a list holding a name that matched nothing, naming it", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        cards: [{ name: "Azyr", zone: "legend", quantity: 1, cardId: null }],
      }),
    });
    await expect(acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID)).rejects.toThrow(/Azyr/u);
  });

  it("refuses a standings-only entry whose legend matched nothing", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer({ legendName: "Azyr", legendCardId: null }),
    });
    await expect(acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID)).rejects.toThrow(/Azyr/u);
  });

  it("files that entry without a legend when the admin says so", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer({ legendName: "Azyr", legendCardId: null }),
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID, { allowUnresolvedLegend: true });

    expect(stubs.createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ legendCardId: null }),
      null,
    );
  });

  it("never waves through a list, where an unresolved name is a missing alias", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        cards: [{ name: "Azyr", zone: "legend", quantity: 1, cardId: null }],
      }),
    });
    await expect(
      acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID, { allowUnresolvedLegend: true }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("updates the linked live row instead of creating a second one", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID }),
      liveDeckCards: [
        { deckId: LIVE_DECK_ID, cardId: "card-azir", zone: "legend", quantity: 1 },
        { deckId: LIVE_DECK_ID, cardId: "card-shock", zone: "main", quantity: 3 },
      ],
    });
    const result = await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(result).toEqual({
      metaEventPlayerId: LIVE_PLAYER_ID,
      deckId: LIVE_DECK_ID,
      created: false,
    });
    expect(stubs.createPlayer).not.toHaveBeenCalled();
    expect(stubs.updatePlayer).toHaveBeenCalledWith(LIVE_PLAYER_ID, {
      eventId: LIVE_EVENT_ID,
      rank: 2,
      rankIsTier: false,
      // A candidate with no source identity keeps the name it was staged with.
      playerName: "Nova",
      wins: 4,
      losses: 2,
      draws: 0,
      matchPoints: null,
      opponentMatchWinPct: null,
      gameWinPct: null,
      opponentGameWinPct: null,
      entryStatus: null,
      legendCardId: "card-azir",
      championCardId: null,
    });
    expect(stubs.setPlayerCheckedAt).toHaveBeenCalledWith(CANDIDATE_PLAYER_ID, expect.any(Date));
  });

  it("leaves the source identity of a live row a nameless candidate accepts onto", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer({ metaEventPlayerId: LIVE_PLAYER_ID, uvsgamesPlayerId: null }),
    });

    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.updatePlayer.mock.calls[0][1]).not.toHaveProperty("uvsgamesPlayerId");
  });

  it("files a source-identified candidate under its id on the update path too", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer({ metaEventPlayerId: LIVE_PLAYER_ID, uvsgamesPlayerId: 218_662 }),
    });

    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.updatePlayer).toHaveBeenCalledWith(
      LIVE_PLAYER_ID,
      expect.objectContaining({ playerName: null, uvsgamesPlayerId: 218_662 }),
    );
  });

  it("materializes the pairings this accept may have completed", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer(),
    });

    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.unmaterializedMatches).toHaveBeenCalledWith(CANDIDATE_EVENT_ID);
  });

  it("leaves the pairings alone when the caller materializes them itself", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: standingsOnlyPlayer(),
    });

    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID, { skipMatchMaterialization: true });

    expect(stubs.unmaterializedMatches).not.toHaveBeenCalled();
  });

  it("has no pairings to materialize for a user submission, which has no candidate event", async () => {
    const { repos, stubs } = harness({
      player: standingsOnlyPlayer({ candidateEventId: null, metaEventId: LIVE_EVENT_ID }),
    });

    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.unmaterializedMatches).not.toHaveBeenCalled();
  });

  it("carries the standings detail onto the live row", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({
        metaEventPlayerId: LIVE_PLAYER_ID,
        matchPoints: 21,
        opponentMatchWinPct: 0.65382653,
        gameWinPct: 0.77777778,
        opponentGameWinPct: 0.64397379,
        entryStatus: "dropped",
      }),
      liveDeckCards: [
        { deckId: LIVE_DECK_ID, cardId: "card-azir", zone: "legend", quantity: 1 },
        { deckId: LIVE_DECK_ID, cardId: "card-shock", zone: "main", quantity: 3 },
      ],
    });

    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.updatePlayer).toHaveBeenCalledWith(
      LIVE_PLAYER_ID,
      expect.objectContaining({
        matchPoints: 21,
        opponentMatchWinPct: 0.65382653,
        gameWinPct: 0.77777778,
        opponentGameWinPct: 0.64397379,
        entryStatus: "dropped",
      }),
    );
  });

  it("leaves an unchanged list alone rather than churning the deck", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID }),
      liveDeckCards: [
        { deckId: LIVE_DECK_ID, cardId: "card-azir", zone: "legend", quantity: 1 },
        { deckId: LIVE_DECK_ID, cardId: "card-shock", zone: "main", quantity: 3 },
      ],
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);
    expect(stubs.setPlayerDeck).not.toHaveBeenCalled();
  });

  it("rewrites the list once a card count moved", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID }),
      liveDeckCards: [
        { deckId: LIVE_DECK_ID, cardId: "card-azir", zone: "legend", quantity: 1 },
        { deckId: LIVE_DECK_ID, cardId: "card-shock", zone: "main", quantity: 2 },
      ],
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);
    expect(stubs.setPlayerDeck).toHaveBeenCalled();
  });

  it("attaches a first list to a linked row that had none", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ metaEventPlayerId: LIVE_PLAYER_ID }),
      live: livePlayer({ deckId: null, deckName: null, shareToken: null, listStatus: "none" }),
    });
    const result = await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID);

    expect(stubs.setPlayerDeck).toHaveBeenCalled();
    expect(result.deckId).toBe(LIVE_DECK_ID);
  });

  it("credits the contributor and settles their ledger row", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      player: candidatePlayer({ submittedByUserId: "user-1" }),
    });
    await acceptCandidatePlayer(repos, CANDIDATE_PLAYER_ID, { resolvedByUserId: "admin-1" });

    expect(stubs.recordAcceptance).toHaveBeenCalledWith({
      submissionId: "submission-1",
      credit: {
        metaEventId: LIVE_EVENT_ID,
        metaEventPlayerId: LIVE_PLAYER_ID,
        userId: "user-1",
      },
      acceptedDeckId: LIVE_DECK_ID,
      resolvedAt: expect.any(Date),
      resolvedByUserId: "admin-1",
    });
  });
});

describe("acceptCandidateEventWithPlayers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the event and files its whole field", async () => {
    const { repos, stubs } = harness({ event: candidateEvent(), player: candidatePlayer() });
    vi.mocked(repos.metaCandidates.playersByCandidateEventIds).mockResolvedValue([
      standingsOnlyPlayer({ id: "cand-a", externalId: "p-a", playerName: "Nova", rank: 1 }),
      standingsOnlyPlayer({ id: "cand-b", externalId: "p-b", playerName: "Ekko", rank: 2 }),
    ]);
    const result = await acceptCandidateEventWithPlayers(repos, CANDIDATE_EVENT_ID);

    expect(result.created).toBe(true);
    expect(result.acceptedPlayers).toHaveLength(2);
    expect(result.skippedPlayers).toEqual([]);
    expect(stubs.createPlayer).toHaveBeenCalledTimes(2);
  });

  it("skips the one blocked entry with its reason and files the rest", async () => {
    const { repos, stubs } = harness({ event: candidateEvent(), player: candidatePlayer() });
    vi.mocked(repos.metaCandidates.playersByCandidateEventIds).mockResolvedValue([
      standingsOnlyPlayer({ id: "cand-a", externalId: "p-a", playerName: "Nova" }),
      standingsOnlyPlayer({
        id: "cand-b",
        externalId: "p-b",
        playerName: "Ekko",
        legendName: "Azyr",
        legendCardId: null,
      }),
    ]);
    const result = await acceptCandidateEventWithPlayers(repos, CANDIDATE_EVENT_ID);

    expect(result.acceptedPlayers).toHaveLength(1);
    expect(result.skippedPlayers).toEqual([
      {
        candidatePlayerId: "cand-b",
        externalId: "p-b",
        playerName: "Ekko",
        reason: expect.stringContaining("Azyr"),
      },
    ]);
    expect(stubs.createPlayer).toHaveBeenCalledTimes(1);
  });

  it("materializes the field's pairings once, after the whole field is filed", async () => {
    const { repos, stubs } = harness({ event: candidateEvent(), player: candidatePlayer() });
    vi.mocked(repos.metaCandidates.playersByCandidateEventIds).mockResolvedValue([
      standingsOnlyPlayer({ id: "cand-a", externalId: "p-a", playerName: "Nova", rank: 1 }),
      standingsOnlyPlayer({ id: "cand-b", externalId: "p-b", playerName: "Ekko", rank: 2 }),
    ]);

    await acceptCandidateEventWithPlayers(repos, CANDIDATE_EVENT_ID);

    expect(stubs.unmaterializedMatches).toHaveBeenCalledTimes(1);
    expect(stubs.unmaterializedMatches).toHaveBeenCalledWith(CANDIDATE_EVENT_ID);
  });

  it("copies the phase structure the payload carries onto the live event", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({
        raw: {
          detail: {
            tournament_phases: [
              { phase_name: "Swiss", round_type: "swiss", number_of_rounds: 6 },
              {
                phase_name: "Top 8",
                round_type: "singleElimination",
                rank_required_to_enter_phase: 8,
              },
            ],
          },
        },
      }),
      player: candidatePlayer(),
    });
    vi.mocked(repos.metaCandidates.playersByCandidateEventIds).mockResolvedValue([]);

    await acceptCandidateEventWithPlayers(repos, CANDIDATE_EVENT_ID);

    expect(stubs.replaceEventPhases).toHaveBeenCalledWith(LIVE_EVENT_ID, [
      expect.objectContaining({
        metaEventId: LIVE_EVENT_ID,
        phaseOrder: 0,
        name: "Swiss",
        roundType: "swiss",
        roundCount: 6,
      }),
      expect.objectContaining({
        metaEventId: LIVE_EVENT_ID,
        phaseOrder: 1,
        roundType: "singleElimination",
        rankRequired: 8,
      }),
    ]);
  });

  it("writes no phases for an event whose payload carries none", async () => {
    const { repos, stubs } = harness({ event: candidateEvent(), player: candidatePlayer() });
    vi.mocked(repos.metaCandidates.playersByCandidateEventIds).mockResolvedValue([]);

    await acceptCandidateEventWithPlayers(repos, CANDIDATE_EVENT_ID);

    expect(stubs.replaceEventPhases).not.toHaveBeenCalled();
  });

  it("waves the unresolved legends through when the admin asks", async () => {
    const { repos, stubs } = harness({ event: candidateEvent(), player: candidatePlayer() });
    vi.mocked(repos.metaCandidates.playersByCandidateEventIds).mockResolvedValue([
      standingsOnlyPlayer({ id: "cand-b", legendName: "Azyr", legendCardId: null }),
    ]);
    const result = await acceptCandidateEventWithPlayers(repos, CANDIDATE_EVENT_ID, {
      allowUnresolvedLegend: true,
    });

    expect(result.skippedPlayers).toEqual([]);
    expect(stubs.createPlayer).toHaveBeenCalledTimes(1);
  });
});

describe("rematchMetaCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports nothing to do when every name already resolved", async () => {
    const { repos, stubs } = harness({});
    const result = await rematchMetaCandidates(repos);

    expect(result).toEqual({ examined: 0, updated: 0, resolved: 0 });
    expect(stubs.updateCandidatePlayer).not.toHaveBeenCalled();
  });

  it("resolves a card line the alias now covers", async () => {
    const { repos, stubs } = harness({});
    vi.mocked(repos.metaCandidates.playersWithUnresolvedNames).mockResolvedValue([
      candidatePlayer({
        cards: [
          { name: "Azir", zone: "legend", quantity: 1, cardId: "card-azir" },
          { name: "Shock", zone: "main", quantity: 3, cardId: null },
        ],
      }),
    ]);
    const result = await rematchMetaCandidates(repos);

    expect(result).toEqual({ examined: 1, updated: 1, resolved: 1 });
    expect(stubs.updateCandidatePlayer).toHaveBeenCalledWith(CANDIDATE_PLAYER_ID, {
      cards: [
        { name: "Azir", zone: "legend", quantity: 1, cardId: "card-azir" },
        { name: "Shock", zone: "main", quantity: 3, cardId: "card-shock" },
      ],
    });
  });

  it("resolves the legend of a standings-only entry, which carries no card lines", async () => {
    const { repos, stubs } = harness({});
    vi.mocked(repos.metaCandidates.playersWithUnresolvedNames).mockResolvedValue([
      standingsOnlyPlayer({ legendName: "Azir", legendCardId: null }),
    ]);
    const result = await rematchMetaCandidates(repos);

    expect(result).toEqual({ examined: 1, updated: 1, resolved: 1 });
    expect(stubs.updateCandidatePlayer).toHaveBeenCalledWith(CANDIDATE_PLAYER_ID, {
      legendCardId: "card-azir",
    });
  });

  it("resolves the champion name too", async () => {
    const { repos, stubs } = harness({ cardIds: { Vi: "card-vi" } });
    vi.mocked(repos.metaCandidates.playersWithUnresolvedNames).mockResolvedValue([
      standingsOnlyPlayer({
        uvsgamesPlayerId: null,
        legendName: null,
        legendCardId: null,
        championName: "Vi",
        championCardId: null,
      }),
    ]);
    const result = await rematchMetaCandidates(repos);

    expect(result).toEqual({ examined: 1, updated: 1, resolved: 1 });
    expect(stubs.updateCandidatePlayer).toHaveBeenCalledWith(CANDIDATE_PLAYER_ID, {
      championCardId: "card-vi",
    });
  });

  it("counts every name one pass resolved on one row", async () => {
    const { repos } = harness({ cardIds: { Azir: "card-azir", Vi: "card-vi" } });
    vi.mocked(repos.metaCandidates.playersWithUnresolvedNames).mockResolvedValue([
      candidatePlayer({
        legendName: "Azir",
        legendCardId: null,
        championName: "Vi",
        championCardId: null,
        cards: [{ name: "Azir", zone: "legend", quantity: 1, cardId: null }],
      }),
    ]);
    expect(await rematchMetaCandidates(repos)).toEqual({ examined: 1, updated: 1, resolved: 3 });
  });

  it("counts a row it examined but could not resolve", async () => {
    const { repos, stubs } = harness({});
    vi.mocked(repos.metaCandidates.playersWithUnresolvedNames).mockResolvedValue([
      standingsOnlyPlayer({ legendName: "Azyr", legendCardId: null }),
    ]);
    const result = await rematchMetaCandidates(repos);

    expect(result).toEqual({ examined: 1, updated: 0, resolved: 0 });
    expect(stubs.updateCandidatePlayer).not.toHaveBeenCalled();
  });

  it("leaves the review state alone: resolving a name is not a source change", async () => {
    const { repos, stubs } = harness({});
    vi.mocked(repos.metaCandidates.playersWithUnresolvedNames).mockResolvedValue([
      standingsOnlyPlayer({ legendName: "Azir", legendCardId: null }),
    ]);
    await rematchMetaCandidates(repos);
    expect(stubs.setPlayerCheckedAt).not.toHaveBeenCalled();
  });
});
