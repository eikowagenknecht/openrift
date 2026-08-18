import { META_USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/meta-submissions";
import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import {
  META_PENDING_SUBMISSION_LIMIT,
  buildMetaSubmissionExternalId,
  submitMetaDeck,
  validateMetaSubmission,
} from "./meta-submission.js";
import type { MetaSubmissionArgs } from "./meta-submission.js";

const NOW = new Date("2026-08-15T12:34:00.000Z");
const EVENT_ID = "3f7a1c2e-0000-7000-8000-000000000001";

/** @returns A valid submission against an event the archive already has. */
function args(overrides: Partial<MetaSubmissionArgs> = {}): MetaSubmissionArgs {
  return {
    userId: "user-1",
    metaEventId: EVENT_ID,
    proposedEvent: null,
    playerName: "Nova",
    finishTier: 1,
    record: "5-1",
    listStatus: "full",
    cards: [
      { name: "Azir", zone: "legend", quantity: 1 },
      { name: "Shock", zone: "main", quantity: 3 },
    ],
    note: "Top 8 list from the stream.",
    now: NOW,
    ...overrides,
  };
}

/** The stub repos and the spies a test asserts on. */
interface Harness {
  transact: Transact;
  insertEvent: ReturnType<typeof vi.fn>;
  insertDeck: ReturnType<typeof vi.fn>;
  insertSubmission: ReturnType<typeof vi.fn>;
}

/**
 * @param options.pending How many submissions the user already has open.
 * @param options.eventName The target event's name, or undefined when it is gone.
 * @param options.resolvedCardIds Card ids the name matcher hands back, by name.
 * @returns A transact that runs against stub repos.
 */
function harness(
  options: {
    pending?: number;
    eventName?: string;
    resolvedCardIds?: Record<string, string>;
  } = {},
): Harness {
  const insertEvent = vi.fn().mockResolvedValue("candidate-event-1");
  const insertDeck = vi.fn().mockResolvedValue("candidate-deck-1");
  const insertSubmission = vi.fn().mockResolvedValue("submission-1");
  const resolved = options.resolvedCardIds ?? { Azir: "card-azir", Shock: "card-shock" };

  const repos = {
    ingest: {
      lockUserSubmissions: vi.fn().mockResolvedValue(undefined),
      allCardNorms: vi
        .fn()
        .mockResolvedValue(
          Object.entries(resolved).map(([name, id]) => ({ id, normName: name.toLowerCase() })),
        ),
      allCardNameAliases: vi.fn().mockResolvedValue([]),
    },
    meta: {
      eventById: vi
        .fn()
        .mockResolvedValue(
          options.eventName === undefined ? undefined : { id: EVENT_ID, name: options.eventName },
        ),
    },
    metaCandidates: { insertEvent, insertDeck },
    metaSubmissions: {
      countPendingByUser: vi.fn().mockResolvedValue(options.pending ?? 0),
      insert: insertSubmission,
    },
  } as unknown as Repos;

  return {
    transact: (fn) => fn(repos),
    insertEvent,
    insertDeck,
    insertSubmission,
  };
}

describe("validateMetaSubmission", () => {
  it("passes a well-formed submission", () => {
    expect(validateMetaSubmission(args())).toEqual([]);
  });

  it("rejects a submission that names neither an existing nor a proposed event", () => {
    expect(validateMetaSubmission(args({ metaEventId: null }))).toContain(
      "A submission targets exactly one event: an existing one or a proposed one",
    );
  });

  it("rejects a submission that names both", () => {
    const problems = validateMetaSubmission(
      args({
        proposedEvent: {
          name: "Summoner Skirmish",
          eventDate: "2026-08-01",
          format: "constructed",
          playerCount: null,
          organizer: null,
          sourceUrl: null,
        },
      }),
    );
    expect(problems).toHaveLength(1);
  });

  it("rejects an empty card list rather than staging an empty deck", () => {
    expect(validateMetaSubmission(args({ cards: [] }))).toContain("cards must not be empty");
  });

  it("names the card whose zone it does not recognise", () => {
    const problems = validateMetaSubmission(
      args({ cards: [{ name: "Azir", zone: "bench", quantity: 1 }] }),
    );
    expect(problems).toContain('card "Azir" has unknown zone "bench"');
  });

  it("rejects a non-positive quantity", () => {
    const problems = validateMetaSubmission(
      args({ cards: [{ name: "Azir", zone: "main", quantity: 0 }] }),
    );
    expect(problems).toContain('card "Azir" has a non-positive quantity');
  });

  it("checks the proposed event against the same bounds the table enforces", () => {
    const problems = validateMetaSubmission(
      args({
        metaEventId: null,
        proposedEvent: {
          name: "",
          eventDate: "2026-02-30",
          format: " ",
          playerCount: 0,
          organizer: null,
          sourceUrl: null,
        },
      }),
    );
    expect(problems).toEqual([
      "event name must be 1-120 characters",
      'eventDate "2026-02-30" is not a YYYY-MM-DD date',
      "event format must not be empty",
      "playerCount must be a positive integer",
    ]);
  });

  it("rejects a blank note, which the column's CHECK would refuse anyway", () => {
    expect(validateMetaSubmission(args({ note: "   " }))).toContain("note must not be blank");
  });
});

describe("buildMetaSubmissionExternalId", () => {
  it("carries the submitter and the minute, with a random tail", () => {
    const id = buildMetaSubmissionExternalId("user-1", NOW);
    expect(id.startsWith("20260815-1234--user-1--")).toBe(true);
  });

  it("differs between two submissions in the same minute", () => {
    expect(buildMetaSubmissionExternalId("user-1", NOW)).not.toBe(
      buildMetaSubmissionExternalId("user-1", NOW),
    );
  });
});

describe("submitMetaDeck", () => {
  it("stages one candidate deck against the live event and records the ledger row", async () => {
    const h = harness({ eventName: "Summoner Skirmish Berlin" });
    const result = await submitMetaDeck(h.transact, args());

    expect(result).toMatchObject({ status: "ok", candidateDeckId: "candidate-deck-1" });
    // No placeholder candidate event: the deck hangs off the live one.
    expect(h.insertEvent).not.toHaveBeenCalled();
    expect(h.insertDeck).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateEventId: null,
        metaEventId: EVENT_ID,
        submittedByUserId: "user-1",
        deckId: null,
        checkedAt: null,
      }),
    );
    expect(h.insertSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: META_USER_SUBMISSION_PROVIDER,
        metaEventId: EVENT_ID,
        eventName: "Summoner Skirmish Berlin",
      }),
    );
  });

  it("resolves card names through the shared matcher", async () => {
    const h = harness({ eventName: "Summoner Skirmish Berlin" });
    await submitMetaDeck(h.transact, args());

    expect(h.insertDeck.mock.calls[0][0].cards).toEqual([
      { name: "Azir", zone: "legend", quantity: 1, cardId: "card-azir" },
      { name: "Shock", zone: "main", quantity: 3, cardId: "card-shock" },
    ]);
  });

  it("stages a name that matched nothing and reports it back", async () => {
    const h = harness({ eventName: "Skirmish", resolvedCardIds: { Azir: "card-azir" } });
    const result = await submitMetaDeck(h.transact, args());

    expect(result).toMatchObject({ status: "ok", unresolvedNames: ["Shock"] });
  });

  it("creates a candidate event when the submission proposes one", async () => {
    const h = harness();
    const result = await submitMetaDeck(
      h.transact,
      args({
        metaEventId: null,
        proposedEvent: {
          name: "Summoner Skirmish Zaun",
          eventDate: "2026-08-01",
          format: "constructed",
          playerCount: 32,
          organizer: null,
          sourceUrl: "https://example.invalid/results",
        },
      }),
    );

    expect(result.status).toBe("ok");
    expect(h.insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: META_USER_SUBMISSION_PROVIDER,
        name: "Summoner Skirmish Zaun",
        metaEventId: null,
        checkedAt: null,
      }),
    );
    expect(h.insertDeck).toHaveBeenCalledWith(
      expect.objectContaining({ candidateEventId: "candidate-event-1", metaEventId: null }),
    );
    // The ledger keeps the submitter's own name for the event, since there is
    // no live row to read one from.
    expect(h.insertSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ metaEventId: null, eventName: "Summoner Skirmish Zaun" }),
    );
  });

  it("refuses a target event that does not exist", async () => {
    const h = harness();
    await expect(submitMetaDeck(h.transact, args())).rejects.toBeInstanceOf(AppError);
    expect(h.insertDeck).not.toHaveBeenCalled();
  });

  it("stops a contributor at the pending cap", async () => {
    const h = harness({ eventName: "Skirmish", pending: META_PENDING_SUBMISSION_LIMIT });
    const result = await submitMetaDeck(h.transact, args());

    expect(result).toEqual({ status: "rate_limited", limit: META_PENDING_SUBMISSION_LIMIT });
    expect(h.insertDeck).not.toHaveBeenCalled();
  });

  it("reports validation problems without opening a transaction", async () => {
    const transact = vi.fn() as unknown as Transact;
    const result = await submitMetaDeck(transact, args({ cards: [] }));

    expect(result).toEqual({ status: "invalid", errors: ["cards must not be empty"] });
    expect(transact).not.toHaveBeenCalled();
  });
});
