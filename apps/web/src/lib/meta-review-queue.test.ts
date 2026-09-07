import type { AdminMetaEventCorrection } from "@openrift/shared/contracts/admin/meta-submissions";
import type { MetaOverlayQueueRow, MetaOverlayRowMatch } from "@openrift/shared/types/api/meta";
import { describe, expect, it } from "vitest";

import {
  acceptClaimMask,
  bulkAcceptItems,
  filterGroup,
  groupReviewQueue,
  sumTriageCounts,
  totalTriageCount,
  triageOverlay,
} from "./meta-review-queue";

function match(overrides: Partial<MetaOverlayRowMatch> = {}): MetaOverlayRowMatch {
  return {
    state: "exact",
    metaEventPlayerId: "row-1",
    playerName: "Ashe Main",
    rank: 4,
    rankIsTier: false,
    candidateCount: 1,
    ...overrides,
  };
}

function player(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
  return {
    id: "o1",
    kind: "player",
    status: "pending",
    provider: "playriftbound",
    sourceEventExternalId: "evt-1",
    sourcePlayerExternalId: "evt-1-p1",
    eventOverlayId: null,
    metaEventPlayerId: null,
    metaEventId: "e1",
    metaEventName: "Summoner Skirmish",
    metaEventSlug: "summoner-skirmish",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
    proposedName: null,
    playerName: "Ashe Main",
    rank: 4,
    rankIsTier: false,
    match: match(),
    submittedBy: "u1",
    submissionNote: null,
    changes: [],
    cards: [{ lineNumber: 1, zone: "main", quantity: 3, cardName: "Yasuo", cardId: "c1" }],
    unresolvedNames: [],
    createdAt: "2026-08-30T10:00:00.000Z",
    ...overrides,
  };
}

function eventRow(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
  return player({
    id: "ev1",
    kind: "event",
    sourcePlayerExternalId: null,
    playerName: null,
    rank: null,
    rankIsTier: null,
    match: null,
    cards: [],
    ...overrides,
  });
}

function proposal(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
  return eventRow({
    id: "prop-1",
    metaEventId: null,
    metaEventName: null,
    metaEventSlug: null,
    proposedName: "Summoner Skirmish Berlin",
    eventDate: "2026-08-25",
    eventFormat: "constructed",
    ...overrides,
  });
}

function correction(overrides: Partial<AdminMetaEventCorrection> = {}): AdminMetaEventCorrection {
  return {
    submission: {
      id: "s1",
      eventName: "Summoner Skirmish",
      playerName: null,
      kind: "event_correction",
      note: "Top cut was 16",
      status: "pending",
      reason: null,
      resolutionNote: null,
      acceptedDeckId: null,
      createdAt: "2026-08-29T10:00:00.000Z",
      resolvedAt: null,
    },
    event: {
      id: "e1",
      slug: "summoner-skirmish",
      name: "Summoner Skirmish",
      eventDate: "2026-08-01",
      format: "constructed",
      playerCount: 64,
      organizer: null,
      location: null,
      country: null,
    },
    fieldEdits: {},
    ...overrides,
  };
}

describe("triageOverlay", () => {
  it("reads a linked or exactly matched row with every name resolved as ready", () => {
    expect(triageOverlay(player())).toBe("ready");
    expect(triageOverlay(player({ match: match({ state: "linked" }) }))).toBe("ready");
  });

  it("puts unmatched card names ahead of the standings-row question", () => {
    expect(triageOverlay(player({ unresolvedNames: ["Yasou"] }))).toBe("unmatched");
  });

  it("asks for a row when the match is ambiguous, missing, or cannot be scored yet", () => {
    expect(triageOverlay(player({ match: match({ state: "candidates" }) }))).toBe("needsRow");
    expect(triageOverlay(player({ match: match({ state: "none" }) }))).toBe("needsRow");
    expect(triageOverlay(player({ match: match({ state: "unscored" }) }))).toBe("needsRow");
  });

  it("marks a proposal as a new event and a live-event patch as ready", () => {
    expect(triageOverlay(proposal())).toBe("newEvent");
    expect(triageOverlay(eventRow())).toBe("ready");
  });
});

describe("bulkAcceptItems", () => {
  it("links an exact match on accept and leaves a linked row's anchor alone", () => {
    const rows = [
      player({ id: "a" }),
      player({ id: "b", metaEventPlayerId: "row-2", match: match({ state: "linked" }) }),
    ];
    expect(bulkAcceptItems(rows)).toEqual([
      { id: "a", metaEventPlayerId: "row-1" },
      { id: "b", metaEventPlayerId: null },
    ]);
  });

  it("skips every row that still needs a decision", () => {
    const rows = [
      player({ id: "a", unresolvedNames: ["Yasou"] }),
      player({ id: "b", match: match({ state: "none" }) }),
      eventRow({ id: "c" }),
    ];
    expect(bulkAcceptItems(rows)).toEqual([]);
  });
});

describe("groupReviewQueue", () => {
  it("folds every row of one live event into one group with its facts", () => {
    const groups = groupReviewQueue(
      [player({ id: "a" }), player({ id: "b", provider: null }), eventRow({ id: "c" })],
      [correction()],
    );

    expect(groups).toHaveLength(1);
    const group = groups[0]!;
    expect(group.name).toBe("Summoner Skirmish");
    expect(group.slug).toBe("summoner-skirmish");
    expect(group.eventDate).toBe("2026-08-01");
    expect(group.format).toBe("constructed");
    expect(group.providers).toEqual(["playriftbound", "usersubmission"]);
    expect(group.players.map((row) => row.id)).toEqual(["a", "b"]);
    expect(group.eventPatches.map((row) => row.id)).toEqual(["c"]);
    expect(group.corrections).toHaveLength(1);
    expect(group.counts).toEqual({
      ready: 3,
      needsRow: 0,
      unmatched: 0,
      newEvent: 0,
      correction: 1,
    });
  });

  it("groups a linked row by the event its anchor resolved to", () => {
    const groups = groupReviewQueue(
      [
        player({ id: "a" }),
        player({ id: "b", metaEventPlayerId: "row-9", match: match({ state: "linked" }) }),
      ],
      [],
    );
    expect(groups).toHaveLength(1);
  });

  it("keeps a proposal and the rows riding on it together, and puts them first", () => {
    const groups = groupReviewQueue(
      [
        player({ id: "old", createdAt: "2026-08-01T00:00:00.000Z" }),
        proposal({ createdAt: "2026-08-31T00:00:00.000Z" }),
        player({
          id: "rider",
          metaEventId: null,
          metaEventName: null,
          eventOverlayId: "prop-1",
          match: match({ state: "unscored" }),
          createdAt: "2026-08-31T00:00:00.000Z",
        }),
      ],
      [],
    );

    expect(groups.map((group) => group.name)).toEqual([
      "Summoner Skirmish Berlin",
      "Summoner Skirmish",
    ]);
    expect(groups[0]!.proposal?.id).toBe("prop-1");
    expect(groups[0]!.players.map((row) => row.id)).toEqual(["rider"]);
    expect(groups[0]!.eventDate).toBe("2026-08-25");
  });

  it("orders live events oldest pending first", () => {
    const groups = groupReviewQueue(
      [
        player({
          id: "a",
          metaEventId: "e2",
          metaEventName: "Later",
          createdAt: "2026-08-20T00:00:00.000Z",
        }),
        player({ id: "b", createdAt: "2026-08-10T00:00:00.000Z" }),
      ],
      [],
    );
    expect(groups.map((group) => group.name)).toEqual(["Summoner Skirmish", "Later"]);
  });

  it("sorts a group's rows by finish, unranked last, then by name", () => {
    const groups = groupReviewQueue(
      [
        player({ id: "none", rank: null, playerName: "Zed" }),
        player({ id: "eight", rank: 8, playerName: "Mirru" }),
        player({ id: "four-b", rank: 4, playerName: "Bravo" }),
        player({ id: "four-a", rank: 4, playerName: "Alpha" }),
      ],
      [],
    );
    expect(groups[0]!.players.map((row) => row.id)).toEqual(["four-a", "four-b", "eight", "none"]);
  });

  it("files a correction whose event is gone under its own name", () => {
    const groups = groupReviewQueue([], [correction({ event: null })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe("Summoner Skirmish");
    expect(groups[0]!.metaEventId).toBeNull();
    expect(groups[0]!.counts.correction).toBe(1);
  });
});

describe("filterGroup", () => {
  const groups = groupReviewQueue(
    [
      player({ id: "ready" }),
      player({ id: "loose", match: match({ state: "none" }) }),
      eventRow({ id: "patch" }),
    ],
    [correction()],
  );

  it("keeps only the rows of the picked triage", () => {
    const narrowed = filterGroup(groups[0]!, "needsRow");
    expect(narrowed?.players.map((row) => row.id)).toEqual(["loose"]);
    expect(narrowed?.eventPatches).toEqual([]);
    expect(narrowed?.corrections).toEqual([]);
  });

  it("shows corrections only under their own chip", () => {
    expect(filterGroup(groups[0]!, "correction")?.corrections).toHaveLength(1);
    expect(filterGroup(groups[0]!, "ready")?.corrections).toEqual([]);
  });

  it("drops a group with nothing in the picked triage", () => {
    expect(filterGroup(groups[0]!, "unmatched")).toBeNull();
  });
});

describe("sumTriageCounts", () => {
  it("adds every group's counts, and the total is their sum", () => {
    const groups = groupReviewQueue(
      [player({ id: "a" }), player({ id: "b", metaEventId: "e2", unresolvedNames: ["X"] })],
      [correction()],
    );
    const counts = sumTriageCounts(groups);
    expect(counts).toEqual({ ready: 1, needsRow: 0, unmatched: 1, newEvent: 0, correction: 1 });
    expect(totalTriageCount(counts)).toBe(3);
  });
});

describe("acceptClaimMask", () => {
  const CHANGES = [
    { field: "playerName", from: "ASC HaruKaze", to: "HaruKaze" },
    { field: "rank", from: "28", to: "30" },
    { field: "listStatus", from: null, to: "full" },
  ];

  it("sends no mask while nothing is unticked", () => {
    expect(acceptClaimMask(player({ changes: CHANGES }), new Set())).toBeNull();
  });

  it("keeps the ticked fields and the lines that travel with them", () => {
    expect(acceptClaimMask(player({ changes: CHANGES }), new Set(["rank"]))).toEqual([
      "playerName",
      "listStatus",
      "cards",
    ]);
  });

  it("adds no card claim to an overlay that printed no lines", () => {
    const row = player({ changes: CHANGES, cards: [] });
    expect(acceptClaimMask(row, new Set(["rank"]))).toEqual(["playerName", "listStatus"]);
  });

  it("drops a field name the player vocabulary does not know", () => {
    const row = player({ changes: [...CHANGES, { field: "notAField", from: "a", to: "b" }] });
    expect(acceptClaimMask(row, new Set(["rank"]))).not.toContain("notAField");
  });

  it("reports an empty mask when every claim is unticked, which accept refuses", () => {
    const row = player({ changes: CHANGES, cards: [] });
    expect(acceptClaimMask(row, new Set(["playerName", "rank", "listStatus"]))).toEqual([]);
  });
});
