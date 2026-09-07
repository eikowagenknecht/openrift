import { META_USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/meta-submissions";
import { describe, expect, it, vi } from "vitest";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import {
  META_PENDING_SUBMISSION_LIMIT,
  buildMetaSubmissionExternalId,
  submitMetaDeck,
  submitMetaEventCorrection,
  validateMetaSubmission,
} from "./meta-submission.js";
import type { MetaSubmissionArgs } from "./meta-submission.js";

const NOW = new Date("2026-08-15T12:34:00.000Z");
const EVENT_ID = "3f7a1c2e-0000-7000-8000-000000000001";

/** A valid submission against an event the archive already has. */
function args(overrides: Partial<MetaSubmissionArgs> = {}): MetaSubmissionArgs {
  return {
    userId: "user-1",
    metaEventId: EVENT_ID,
    proposedEvent: null,
    kind: "new_list",
    playerName: "Nova",
    rank: 1,
    rankIsTier: false,
    wins: 5,
    losses: 1,
    draws: 0,
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
  insertPlayer: ReturnType<typeof vi.fn>;
  insertSubmission: ReturnType<typeof vi.fn>;
}

function harness(
  options: {
    pending?: number;
    eventName?: string;
    resolvedCardIds?: Record<string, string>;
  } = {},
): Harness {
  const insertEvent = vi.fn().mockResolvedValue("event-overlay-1");
  const insertPlayer = vi.fn().mockResolvedValue("player-overlay-1");
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
    metaOverlays: { insertEventOverlay: insertEvent, insertPlayerOverlay: insertPlayer },
    metaSubmissions: {
      countPendingByUser: vi.fn().mockResolvedValue(options.pending ?? 0),
      insert: insertSubmission,
    },
  } as unknown as Repos;

  return {
    transact: (fn) => fn(repos),
    insertEvent,
    insertPlayer,
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

  it("rejects a rank below first place", () => {
    expect(validateMetaSubmission(args({ rank: 0 }))).toContain("rank must be a positive integer");
  });

  it("rejects a fractional rank", () => {
    expect(validateMetaSubmission(args({ rank: 1.5 }))).toContain(
      "rank must be a positive integer",
    );
  });

  it("names each of the three record columns it refuses", () => {
    const problems = validateMetaSubmission(args({ wins: -1, losses: 0.5, draws: -2 }));
    expect(problems).toEqual([
      "wins must be a non-negative integer",
      "losses must be a non-negative integer",
      "draws must be a non-negative integer",
    ]);
  });

  it("accepts an unknown record, which most sources publish for nobody", () => {
    expect(validateMetaSubmission(args({ wins: null, losses: null, draws: null }))).toEqual([]);
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
  it("stages one candidate entry against the live event and records the ledger row", async () => {
    const h = harness({ eventName: "Summoner Skirmish Berlin" });
    const result = await submitMetaDeck(h.transact, args());

    expect(result).toMatchObject({ status: "ok", playerOverlayId: "player-overlay-1" });
    expect(h.insertEvent).not.toHaveBeenCalled();
    expect(h.insertPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        eventOverlayId: null,
        metaEventId: EVENT_ID,
        submittedByUserId: "user-1",
        metaEventPlayerId: null,
      }),
      expect.anything(),
    );
    expect(h.insertSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: META_USER_SUBMISSION_PROVIDER,
        playerOverlayId: "player-overlay-1",
        metaEventId: EVENT_ID,
        eventName: "Summoner Skirmish Berlin",
      }),
    );
  });

  it("stages the standing the submitter reported", async () => {
    const h = harness({ eventName: "Summoner Skirmish Berlin" });
    await submitMetaDeck(h.transact, args({ rank: 8, rankIsTier: true, wins: 4, losses: 2 }));

    expect(h.insertPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        playerName: "Nova",
        rank: 8,
        rankIsTier: true,
        wins: 4,
        losses: 2,
        draws: 0,
        listStatus: "full",
      }),
      expect.anything(),
    );
  });

  it("names no legend of its own, since the list's zones carry it", async () => {
    const h = harness({ eventName: "Summoner Skirmish Berlin" });
    await submitMetaDeck(h.transact, args());

    expect(h.insertPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ legendCardId: null, championCardId: null }),
      expect.anything(),
    );
  });

  it("resolves card names through the shared matcher", async () => {
    const h = harness({ eventName: "Summoner Skirmish Berlin" });
    await submitMetaDeck(h.transact, args());

    expect(h.insertPlayer.mock.calls[0][1]).toEqual([
      { lineNumber: 0, cardName: "Azir", zone: "legend", quantity: 1, cardId: "card-azir" },
      { lineNumber: 1, cardName: "Shock", zone: "main", quantity: 3, cardId: "card-shock" },
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
      }),
    );
    expect(h.insertPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ eventOverlayId: "event-overlay-1", metaEventId: null }),
      expect.anything(),
    );
    expect(h.insertSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ metaEventId: null, eventName: "Summoner Skirmish Zaun" }),
    );
  });

  it("refuses a target event that does not exist", async () => {
    const h = harness();
    await expect(submitMetaDeck(h.transact, args())).rejects.toBeInstanceOf(AppError);
    expect(h.insertPlayer).not.toHaveBeenCalled();
  });

  it("stops a contributor at the pending cap", async () => {
    const h = harness({ eventName: "Skirmish", pending: META_PENDING_SUBMISSION_LIMIT });
    const result = await submitMetaDeck(h.transact, args());

    expect(result).toEqual({ status: "rate_limited", limit: META_PENDING_SUBMISSION_LIMIT });
    expect(h.insertPlayer).not.toHaveBeenCalled();
  });

  it("reports validation problems without opening a transaction", async () => {
    const transact = vi.fn() as unknown as Transact;
    const result = await submitMetaDeck(transact, args({ cards: [] }));

    expect(result).toEqual({ status: "invalid", errors: ["cards must not be empty"] });
    expect(transact).not.toHaveBeenCalled();
  });
});

describe("submitMetaEventCorrection", () => {
  it("records the proposed values against the event, staging nothing", async () => {
    const h = harness({ eventName: "Summoner Skirmish Berlin" });
    const result = await submitMetaEventCorrection(h.transact, {
      userId: "user-1",
      metaEventId: EVENT_ID,
      fieldEdits: { playerCount: 48, country: "DE" },
      note: "The results page lists 48 players, not 64.",
      now: NOW,
    });

    expect(result).toEqual({ status: "ok", submissionId: "submission-1" });
    expect(h.insertPlayer).not.toHaveBeenCalled();
    expect(h.insertEvent).not.toHaveBeenCalled();
    expect(h.insertSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "event_correction",
        playerOverlayId: null,
        playerName: null,
        metaEventId: EVENT_ID,
        eventName: "Summoner Skirmish Berlin",
        fieldEdits: { playerCount: 48, country: "DE" },
      }),
    );
  });

  it("keeps an empty edit set as an object rather than dropping the column", async () => {
    const h = harness({ eventName: "Skirmish" });
    await submitMetaEventCorrection(h.transact, {
      userId: "user-1",
      metaEventId: EVENT_ID,
      fieldEdits: {},
      note: "The winner's name is spelled wrong somewhere.",
      now: NOW,
    });

    expect(h.insertSubmission).toHaveBeenCalledWith(expect.objectContaining({ fieldEdits: {} }));
  });

  it("refuses an event that does not exist", async () => {
    const h = harness();
    await expect(
      submitMetaEventCorrection(h.transact, {
        userId: "user-1",
        metaEventId: EVENT_ID,
        fieldEdits: {},
        note: "Wrong date.",
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(h.insertSubmission).not.toHaveBeenCalled();
  });

  it("counts against the same pending cap as a decklist", async () => {
    const h = harness({ eventName: "Skirmish", pending: META_PENDING_SUBMISSION_LIMIT });
    const result = await submitMetaEventCorrection(h.transact, {
      userId: "user-1",
      metaEventId: EVENT_ID,
      fieldEdits: {},
      note: "Wrong date.",
      now: NOW,
    });

    expect(result).toEqual({ status: "rate_limited", limit: META_PENDING_SUBMISSION_LIMIT });
    expect(h.insertSubmission).not.toHaveBeenCalled();
  });
});
