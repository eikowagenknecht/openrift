import type { AdminMetaDeck, MetaCandidateDeck, MetaCandidateSource } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  SUBMITTED_COLUMN_ID,
  buildRosterColumns,
  buildRosterRows,
  candidateCardCount,
  compareRosterFields,
  hasListDelta,
  normalizePilotName,
  rosterAcceptBlockedReason,
  rosterListDelta,
} from "@/lib/meta-deck-roster";

function liveDeck(overrides: Partial<AdminMetaDeck> = {}): AdminMetaDeck {
  return {
    deckId: "live-1",
    shareToken: "abc123abc123",
    listStatus: "full",
    name: "Yasuo Aggro",
    format: "standard",
    playerName: "Ana",
    finishTier: 1,
    record: "6-1",
    cardCount: 40,
    ...overrides,
  };
}

function candidateDeck(overrides: Partial<MetaCandidateDeck> = {}): MetaCandidateDeck {
  return {
    id: "cand-1",
    externalId: "1",
    playerName: "Ana",
    finishTier: 1,
    record: "6-1",
    name: "Yasuo Aggro",
    cards: [{ name: "Yasuo", zone: "legend", quantity: 1, cardId: "card-1" }],
    listStatus: "full",
    unresolvedNames: [],
    deckId: null,
    shareToken: null,
    submittedByUserId: null,
    submittedByName: null,
    submissionNote: null,
    state: "new",
    diff: null,
    checkedAt: null,
    ...overrides,
  };
}

function source(id: string, provider: string, decks: MetaCandidateDeck[]): MetaCandidateSource {
  return {
    id,
    provider,
    externalId: `${provider}-1`,
    name: "Summoner Skirmish",
    eventDate: "2026-08-15",
    format: "standard",
    playerCount: 64,
    organizer: null,
    sourceUrl: null,
    notes: null,
    checkedAt: null,
    decks,
  };
}

describe("normalizePilotName", () => {
  it("folds case and inner whitespace", () => {
    expect(normalizePilotName("  Ana   Lee ")).toBe("ana lee");
  });

  it("keeps genuinely different names apart", () => {
    expect(normalizePilotName("Ana")).not.toBe(normalizePilotName("Anna"));
  });
});

describe("buildRosterColumns", () => {
  it("gives every source a column, in the order it arrived", () => {
    const columns = buildRosterColumns(
      [source("s1", "uvsgames", []), source("s2", "playriftbound", [])],
      0,
    );
    expect(columns.map((column) => column.label)).toEqual(["uvsgames", "playriftbound"]);
    expect(columns.every((column) => column.isSource)).toBe(true);
  });

  it("adds the submissions column only when decks were submitted", () => {
    expect(buildRosterColumns([], 0)).toEqual([]);
    const columns = buildRosterColumns([], 2);
    expect(columns).toEqual([{ id: SUBMITTED_COLUMN_ID, label: "Submissions", isSource: false }]);
  });
});

describe("buildRosterRows", () => {
  it("puts two sources' versions of one pilot in one row", () => {
    const rows = buildRosterRows(
      [],
      [
        source("s1", "uvsgames", [candidateDeck({ id: "a", playerName: "Ana" })]),
        source("s2", "playriftbound", [candidateDeck({ id: "b", playerName: "ana " })]),
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.get("s1")?.id).toBe("a");
    expect(rows[0]?.cells.get("s2")?.id).toBe("b");
  });

  it("leaves the cell empty for a source that does not have the pilot", () => {
    const rows = buildRosterRows(
      [],
      [
        source("s1", "uvsgames", [
          candidateDeck({ id: "a", playerName: "Ana", finishTier: 1 }),
          candidateDeck({ id: "b", playerName: "Bo", finishTier: 2 }),
        ]),
        source("s2", "playriftbound", [candidateDeck({ id: "c", playerName: "Ana" })]),
      ],
      [],
    );
    const bo = rows.find((row) => row.playerName === "Bo");
    expect(bo?.cells.get("s1")?.id).toBe("b");
    expect(bo?.cells.has("s2")).toBe(false);
  });

  it("follows the link over the name when a candidate is linked", () => {
    const rows = buildRosterRows(
      [liveDeck({ deckId: "live-1", playerName: "Ana Lee" })],
      [
        source("s1", "uvsgames", [
          // A different spelling entirely; the link is what settles it.
          candidateDeck({ id: "a", playerName: "A. Lee", deckId: "live-1" }),
        ]),
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.live?.deckId).toBe("live-1");
    expect(rows[0]?.cells.get("s1")?.id).toBe("a");
  });

  it("matches an unlinked candidate to the archived deck by pilot name", () => {
    const rows = buildRosterRows(
      [liveDeck({ playerName: "ANA" })],
      [source("s1", "uvsgames", [candidateDeck({ id: "a", playerName: "Ana" })])],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.get("s1")?.id).toBe("a");
  });

  it("files a submitted deck in the submissions column", () => {
    const rows = buildRosterRows(
      [],
      [],
      [candidateDeck({ id: "sub", playerName: "Ana", submittedByName: "Rin" })],
    );
    expect(rows[0]?.cells.get(SUBMITTED_COLUMN_ID)?.id).toBe("sub");
  });

  it("orders by finish, archived first, then by pilot", () => {
    const rows = buildRosterRows(
      [liveDeck({ deckId: "live-2", playerName: "Zed", finishTier: 2 })],
      [
        source("s1", "uvsgames", [
          candidateDeck({ id: "a", playerName: "Ana", finishTier: 4 }),
          candidateDeck({ id: "b", playerName: "Bo", finishTier: 1 }),
        ]),
      ],
      [],
    );
    expect(rows.map((row) => row.playerName)).toEqual(["Bo", "Zed", "Ana"]);
  });

  it("keeps a row for an archived deck no source mentions", () => {
    const rows = buildRosterRows([liveDeck({ playerName: "Solo" })], [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.size).toBe(0);
  });
});

describe("candidateCardCount", () => {
  it("sums copies across zones", () => {
    const deck = candidateDeck({
      cards: [
        { name: "Yasuo", zone: "legend", quantity: 1, cardId: "c1" },
        { name: "Recall", zone: "main", quantity: 3, cardId: "c2" },
      ],
    });
    expect(candidateCardCount(deck)).toBe(4);
  });

  it("is zero for an empty list", () => {
    expect(candidateCardCount(candidateDeck({ cards: [] }))).toBe(0);
  });
});

describe("compareRosterFields", () => {
  it("marks only the fields that would change", () => {
    const comparisons = compareRosterFields(
      liveDeck({ finishTier: 1, record: "6-1" }),
      candidateDeck({ finishTier: 2, record: "6-1" }),
    );
    const byField = Object.fromEntries(comparisons.map((row) => [row.field, row.differs]));
    expect(byField.finishTier).toBe(true);
    expect(byField.record).toBe(false);
  });

  it("marks nothing when there is no archived deck to change", () => {
    const comparisons = compareRosterFields(null, candidateDeck());
    expect(comparisons.every((row) => !row.differs)).toBe(true);
    expect(comparisons.find((row) => row.field === "record")?.live).toBe("—");
  });
});

describe("rosterListDelta", () => {
  it("reads the server diff when the deck is linked", () => {
    const delta = rosterListDelta(
      candidateDeck({
        deckId: "live-1",
        diff: {
          fields: [],
          cards: {
            added: [{ cardId: "c1", zone: "main", quantity: 2, name: "Recall" }],
            removed: [],
            changed: [],
          },
        },
      }),
    );
    expect(delta.added).toHaveLength(1);
    expect(hasListDelta(delta)).toBe(true);
  });

  it("reads the whole list as additions when it is not linked", () => {
    const delta = rosterListDelta(
      candidateDeck({
        cards: [
          { name: "Yasuo", zone: "legend", quantity: 1, cardId: "c1" },
          { name: "Recall", zone: "main", quantity: 3, cardId: null },
        ],
      }),
    );
    expect(delta.added.map((card) => card.name)).toEqual(["Yasuo", "Recall"]);
    expect(delta.removed).toEqual([]);
    // An unresolved row has no card id, so the name stands in as its key.
    expect(delta.added[1]?.cardId).toBe("Recall");
  });

  it("reports an in-sync linked deck as empty", () => {
    const delta = rosterListDelta(
      candidateDeck({
        deckId: "live-1",
        diff: { fields: [], cards: { added: [], removed: [], changed: [] } },
      }),
    );
    expect(hasListDelta(delta)).toBe(false);
  });
});

describe("rosterAcceptBlockedReason", () => {
  it("blocks on unmatched card names", () => {
    expect(rosterAcceptBlockedReason(candidateDeck({ unresolvedNames: ["Yasou"] }))).toBe(
      "1 card name still unmatched.",
    );
    expect(rosterAcceptBlockedReason(candidateDeck({ unresolvedNames: ["a", "b"] }))).toBe(
      "2 card names still unmatched.",
    );
  });

  it("allows a deck whose names all resolved", () => {
    expect(rosterAcceptBlockedReason(candidateDeck())).toBeNull();
  });
});
