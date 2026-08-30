import {
  META_DECK_ACCEPT_FIELDS,
  META_EVENT_ACCEPT_FIELDS,
} from "@openrift/shared/contracts/admin/meta";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type {
  CandidateMetaDeckRow,
  CandidateMetaEventRow,
} from "../repositories/meta-candidates.js";
import {
  acceptCandidateEvent,
  acceptMetaDeckField,
  acceptMetaDeckList,
  acceptMetaEventField,
  linkCandidateDeck,
  linkCandidateEvent,
  relinkCandidateEvent,
  unlinkCandidateDeck,
  unlinkCandidateEvent,
} from "./meta-candidate-accept.js";

const CANDIDATE_EVENT_ID = "3f7a1c2e-0000-7000-8000-000000000001";
const CANDIDATE_DECK_ID = "3f7a1c2e-0000-7000-8000-000000000010";
const LIVE_EVENT_ID = "3f7a1c2e-0000-7000-8000-0000000000e1";
const OTHER_EVENT_ID = "3f7a1c2e-0000-7000-8000-0000000000e2";
const LIVE_DECK_ID = "3f7a1c2e-0000-7000-8000-0000000000d1";

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
    metaEventId: null,
    checkedAt: null,
    extraData: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-02T10:00:00.000Z"),
    ...overrides,
  };
}

/** @returns A candidate deck whose cards all resolved. */
function candidateDeck(overrides: Partial<CandidateMetaDeckRow> = {}): CandidateMetaDeckRow {
  return {
    id: CANDIDATE_DECK_ID,
    candidateEventId: CANDIDATE_EVENT_ID,
    metaEventId: null,
    externalId: "deck-991",
    playerName: "Nova",
    finishTier: 2,
    record: "4-2",
    name: null,
    cards: [
      { name: "Azir", zone: "legend", quantity: 1, cardId: "card-azir" },
      { name: "Shock", zone: "main", quantity: 3, cardId: "card-shock" },
    ],
    listStatus: "full",
    deckId: null,
    submittedByUserId: null,
    submissionNote: null,
    checkedAt: null,
    createdAt: new Date("2026-08-02T10:00:00.000Z"),
    updatedAt: new Date("2026-08-02T10:00:00.000Z"),
    ...overrides,
  };
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
  deckCount: 4,
};

/**
 * @param options The candidate rows the repos hand back, and which event the
 *   archived deck a link points at belongs to.
 * @returns A fake {@link Repos} and the stubs a test asserts on.
 */
function harness(options: {
  event?: CandidateMetaEventRow;
  deck?: CandidateMetaDeckRow;
  liveDeckEventId?: string;
}) {
  const stubs = {
    deleteEventSourceByKey: vi.fn().mockResolvedValue(true),
    insertEventSource: vi.fn().mockResolvedValue({ id: "source-1" }),
    writeDeckSource: vi.fn().mockResolvedValue(undefined),
    deleteDeckSourceByKey: vi.fn().mockResolvedValue(true),
    linkEvent: vi.fn().mockResolvedValue(true),
    unlinkEvent: vi.fn().mockResolvedValue(true),
    linkDeck: vi.fn().mockResolvedValue(true),
    unlinkDeck: vi.fn().mockResolvedValue(true),
    updateEvent: vi.fn().mockResolvedValue(true),
    updateDeck: vi.fn().mockResolvedValue(true),
    insertCredit: vi.fn().mockResolvedValue(undefined),
    deleteCreditsForDeck: vi.fn().mockResolvedValue(undefined),
    recordAcceptance: vi.fn().mockResolvedValue(undefined),
    setEventCheckedAt: vi.fn().mockResolvedValue(true),
  };

  const repos = {
    meta: {
      eventById: vi.fn().mockResolvedValue(liveEvent),
      eventBySlug: vi.fn().mockResolvedValue(undefined),
      createEvent: vi.fn().mockResolvedValue(liveEvent),
      updateEvent: stubs.updateEvent,
      updateDeck: stubs.updateDeck,
      deckShareState: vi.fn().mockResolvedValue({ listStatus: "full", shareToken: "aB3dE5gH7jK9" }),
      deleteEventSourceByKey: stubs.deleteEventSourceByKey,
      insertEventSource: stubs.insertEventSource,
      writeDeckSource: stubs.writeDeckSource,
      deleteDeckSourceByKey: stubs.deleteDeckSourceByKey,
      insertCredit: stubs.insertCredit,
      deleteCreditsForDeck: stubs.deleteCreditsForDeck,
    },
    metaCandidates: {
      eventById: vi.fn().mockResolvedValue(options.event),
      deckById: vi.fn().mockResolvedValue(options.deck),
      linkEvent: stubs.linkEvent,
      unlinkEvent: stubs.unlinkEvent,
      linkDeck: stubs.linkDeck,
      unlinkDeck: stubs.unlinkDeck,
      setEventCheckedAt: stubs.setEventCheckedAt,
      setDeckCheckedAt: vi.fn().mockResolvedValue(true),
      liveDecksByIds: vi.fn().mockResolvedValue([
        {
          deckId: LIVE_DECK_ID,
          metaEventId: options.liveDeckEventId ?? LIVE_EVENT_ID,
          name: "Azir Control",
          shareToken: "aB3dE5gH7jK9",
          playerName: "Nova",
          finishTier: 1,
          record: "5-1",
          listStatus: "full",
        },
      ]),
      liveDeckCards: vi.fn().mockResolvedValue([]),
      decksByCandidateEventIds: vi.fn().mockResolvedValue([]),
      cardNamesByIds: vi.fn().mockResolvedValue(new Map()),
      // Only this candidate feeds the live event unless a test says otherwise.
      eventsByMetaEventId: vi
        .fn()
        .mockResolvedValue(options.event === undefined ? [] : [options.event]),
    },
    metaSubmissions: {
      byCandidateDeckId: vi.fn().mockResolvedValue({ id: "submission-1" }),
      recordAcceptance: stubs.recordAcceptance,
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
});

describe("linkCandidateDeck", () => {
  it("links a deck inside its own event", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck(),
    });
    const result = await linkCandidateDeck(repos, CANDIDATE_DECK_ID, LIVE_DECK_ID);

    expect(result).toEqual({ deckId: LIVE_DECK_ID });
    expect(stubs.linkDeck).toHaveBeenCalledWith(CANDIDATE_DECK_ID, LIVE_DECK_ID, expect.any(Date));
    // The key the next upload finds the archived deck by, kept outside the
    // candidate row so an ignore cannot take it with it (migration 256).
    expect(stubs.writeDeckSource).toHaveBeenCalledWith(LIVE_DECK_ID, {
      provider: "uvsgames",
      eventExternalId: "evt-482",
      externalId: "deck-991",
    });
  });

  it("refuses a deck that belongs to another event", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck(),
      liveDeckEventId: OTHER_EVENT_ID,
    });
    await expect(linkCandidateDeck(repos, CANDIDATE_DECK_ID, LIVE_DECK_ID)).rejects.toBeInstanceOf(
      AppError,
    );
    expect(stubs.linkDeck).not.toHaveBeenCalled();
  });

  it("refuses while the deck's event is still unlinked", async () => {
    const { repos } = harness({ event: candidateEvent(), deck: candidateDeck() });
    await expect(linkCandidateDeck(repos, CANDIDATE_DECK_ID, LIVE_DECK_ID)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("resolves a user submission's event through its own column", async () => {
    const { repos, stubs } = harness({
      deck: candidateDeck({ candidateEventId: null, metaEventId: LIVE_EVENT_ID }),
    });
    await linkCandidateDeck(repos, CANDIDATE_DECK_ID, LIVE_DECK_ID);
    expect(stubs.linkDeck).toHaveBeenCalled();
    // No source event, so no key to record: nothing scopes a submission's deck
    // id, which is also why a submission cannot be ignored.
    expect(stubs.writeDeckSource).not.toHaveBeenCalled();
  });
});

describe("unlinkCandidateDeck", () => {
  it("takes back only this contributor's credit", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck({ deckId: LIVE_DECK_ID, submittedByUserId: "user-1" }),
    });
    await unlinkCandidateDeck(repos, CANDIDATE_DECK_ID);

    expect(stubs.deleteCreditsForDeck).toHaveBeenCalledWith(LIVE_DECK_ID, "user-1");
    expect(stubs.unlinkDeck).toHaveBeenCalledWith(CANDIDATE_DECK_ID);
  });

  it("touches no credit for a provider's deck", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck({ deckId: LIVE_DECK_ID }),
    });
    await unlinkCandidateDeck(repos, CANDIDATE_DECK_ID);
    expect(stubs.deleteCreditsForDeck).not.toHaveBeenCalled();
  });

  it("drops the source key, so the next upload stages as new", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck({ deckId: LIVE_DECK_ID }),
    });
    await unlinkCandidateDeck(repos, CANDIDATE_DECK_ID);

    // Unlinking says this provider no longer describes that archived deck, so
    // the key has to go with the link — an ignore, which keeps the key, is the
    // other half of the pair.
    expect(stubs.deleteDeckSourceByKey).toHaveBeenCalledWith({
      provider: "uvsgames",
      eventExternalId: "evt-482",
      externalId: "deck-991",
    });
  });
});

describe("acceptMetaDeckField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(META_DECK_ACCEPT_FIELDS)("writes exactly the %s column", async (field) => {
    const deck = candidateDeck({ deckId: LIVE_DECK_ID });
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck,
    });
    await acceptMetaDeckField(repos, { candidateDeckId: CANDIDATE_DECK_ID, field });

    expect(stubs.updateDeck).toHaveBeenCalledWith(LIVE_DECK_ID, { [field]: deck[field] });
  });

  it("refuses an unlinked candidate deck", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck(),
    });
    await expect(
      acceptMetaDeckField(repos, { candidateDeckId: CANDIDATE_DECK_ID, field: "record" }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("credits the contributor and settles their ledger row", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck({ deckId: LIVE_DECK_ID, submittedByUserId: "user-1" }),
    });
    await acceptMetaDeckField(
      repos,
      { candidateDeckId: CANDIDATE_DECK_ID, field: "record" },
      { resolvedByUserId: "admin-1" },
    );

    expect(stubs.recordAcceptance).toHaveBeenCalledWith({
      submissionId: "submission-1",
      credit: { metaEventId: LIVE_EVENT_ID, deckId: LIVE_DECK_ID, userId: "user-1" },
      acceptedDeckId: LIVE_DECK_ID,
      resolvedAt: expect.any(Date),
      resolvedByUserId: "admin-1",
    });
  });

  it("credits nobody for a provider's deck", async () => {
    const { repos, stubs } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck({ deckId: LIVE_DECK_ID }),
    });
    await acceptMetaDeckField(repos, { candidateDeckId: CANDIDATE_DECK_ID, field: "record" });
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
      deck: candidateDeck({ deckId: LIVE_DECK_ID, listStatus: "partial" }),
    });
    await acceptMetaDeckList(repos, CANDIDATE_DECK_ID);

    expect(stubs.updateDeck).toHaveBeenCalledWith(LIVE_DECK_ID, {
      cards: [
        { cardId: "card-azir", zone: "legend", quantity: 1, preferredPrintingId: null },
        { cardId: "card-shock", zone: "main", quantity: 3, preferredPrintingId: null },
      ],
      listStatus: "partial",
    });
  });

  it("refuses a list holding a name that matched nothing", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck({
        deckId: LIVE_DECK_ID,
        cards: [{ name: "Azyr", zone: "legend", quantity: 1, cardId: null }],
      }),
    });
    await expect(acceptMetaDeckList(repos, CANDIDATE_DECK_ID)).rejects.toBeInstanceOf(AppError);
  });

  it("refuses an archetype with no legend to file it under", async () => {
    const { repos } = harness({
      event: candidateEvent({ metaEventId: LIVE_EVENT_ID }),
      deck: candidateDeck({
        deckId: LIVE_DECK_ID,
        listStatus: "archetype",
        cards: [{ name: "Vi", zone: "champion", quantity: 1, cardId: "card-vi" }],
      }),
    });
    await expect(acceptMetaDeckList(repos, CANDIDATE_DECK_ID)).rejects.toBeInstanceOf(AppError);
  });
});
