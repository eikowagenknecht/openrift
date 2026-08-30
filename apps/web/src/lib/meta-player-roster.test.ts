import type { AdminMetaPlayer, MetaCandidatePlayer, MetaCandidateSource } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  SUBMITTED_COLUMN_ID,
  buildRosterColumns,
  buildRosterRows,
  candidateCardCount,
  compareRosterFields,
  hasListDelta,
  needsUnresolvedLegendConfirm,
  normalizePlayerName,
  rosterAcceptBlockedReason,
  rosterListDelta,
  rosterRecord,
} from "@/lib/meta-player-roster";

function livePlayer(overrides: Partial<AdminMetaPlayer> = {}): AdminMetaPlayer {
  return {
    id: "live-1",
    rank: 1,
    rankIsTier: false,
    playerName: "Ana",
    wins: 6,
    losses: 1,
    draws: null,
    legendCardId: "card-yasuo",
    legendName: "Yasuo",
    championCardId: null,
    championName: null,
    listStatus: "full",
    deckId: "deck-1",
    shareToken: "abc123abc123",
    deckName: "Yasuo Aggro",
    deckFormat: "standard",
    cardCount: 40,
    ...overrides,
  };
}

function candidatePlayer(overrides: Partial<MetaCandidatePlayer> = {}): MetaCandidatePlayer {
  return {
    id: "cand-1",
    externalId: "1",
    playerName: "Ana",
    rank: 1,
    rankIsTier: false,
    wins: 6,
    losses: 1,
    draws: null,
    legendName: "Yasuo",
    legendCardId: "card-yasuo",
    championName: null,
    championCardId: null,
    cards: [{ name: "Yasuo", zone: "legend", quantity: 1, cardId: "card-yasuo" }],
    listStatus: "full",
    unresolvedNames: [],
    metaEventPlayerId: null,
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

function source(id: string, provider: string, players: MetaCandidatePlayer[]): MetaCandidateSource {
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
    tier: null,
    country: null,
    location: null,
    checkedAt: null,
    players,
  };
}

describe("normalizePlayerName", () => {
  it("folds case and inner whitespace", () => {
    expect(normalizePlayerName("  Ana   Lee ")).toBe("ana lee");
  });

  it("keeps genuinely different names apart", () => {
    expect(normalizePlayerName("Ana")).not.toBe(normalizePlayerName("Anna"));
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

  it("adds the submissions column only when something was submitted", () => {
    expect(buildRosterColumns([], 0)).toEqual([]);
    const columns = buildRosterColumns([], 2);
    expect(columns).toEqual([{ id: SUBMITTED_COLUMN_ID, label: "Submissions", isSource: false }]);
  });
});

describe("buildRosterRows", () => {
  it("puts two sources' versions of one player in one row", () => {
    const rows = buildRosterRows(
      [],
      [
        source("s1", "uvsgames", [candidatePlayer({ id: "a", playerName: "Ana" })]),
        source("s2", "playriftbound", [candidatePlayer({ id: "b", playerName: "ana " })]),
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.get("s1")?.id).toBe("a");
    expect(rows[0]?.cells.get("s2")?.id).toBe("b");
  });

  it("leaves the cell empty for a source that does not have the player", () => {
    const rows = buildRosterRows(
      [],
      [
        source("s1", "uvsgames", [
          candidatePlayer({ id: "a", playerName: "Ana", rank: 1 }),
          candidatePlayer({ id: "b", playerName: "Bo", rank: 2 }),
        ]),
        source("s2", "playriftbound", [candidatePlayer({ id: "c", playerName: "Ana" })]),
      ],
      [],
    );
    const bo = rows.find((row) => row.playerName === "Bo");
    expect(bo?.cells.get("s1")?.id).toBe("b");
    expect(bo?.cells.has("s2")).toBe(false);
  });

  it("follows the link over the name when a candidate is linked", () => {
    const rows = buildRosterRows(
      [livePlayer({ id: "live-1", playerName: "Ana Lee" })],
      [
        source("s1", "uvsgames", [
          // A different spelling entirely; the link is what settles it.
          candidatePlayer({ id: "a", playerName: "A. Lee", metaEventPlayerId: "live-1" }),
        ]),
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.live?.id).toBe("live-1");
    expect(rows[0]?.cells.get("s1")?.id).toBe("a");
  });

  it("matches an unlinked candidate to the archived row by player name", () => {
    const rows = buildRosterRows(
      [livePlayer({ playerName: "ANA" })],
      [source("s1", "uvsgames", [candidatePlayer({ id: "a", playerName: "Ana" })])],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.get("s1")?.id).toBe("a");
  });

  it("files a submitted list in the submissions column", () => {
    const rows = buildRosterRows(
      [],
      [],
      [candidatePlayer({ id: "sub", playerName: "Ana", submittedByName: "Rin" })],
    );
    expect(rows[0]?.cells.get(SUBMITTED_COLUMN_ID)?.id).toBe("sub");
  });

  it("orders by rank, archived first, then by player", () => {
    const rows = buildRosterRows(
      [livePlayer({ id: "live-2", playerName: "Zed", rank: 2 })],
      [
        source("s1", "uvsgames", [
          candidatePlayer({ id: "a", playerName: "Ana", rank: 4 }),
          candidatePlayer({ id: "b", playerName: "Bo", rank: 1 }),
        ]),
      ],
      [],
    );
    expect(rows.map((row) => row.playerName)).toEqual(["Bo", "Zed", "Ana"]);
  });

  it("keeps a row for an archived player no source mentions", () => {
    const rows = buildRosterRows([livePlayer({ playerName: "Solo" })], [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.size).toBe(0);
  });

  it("keeps a live row and a candidate apart when the id reads like the name", () => {
    const rows = buildRosterRows(
      [livePlayer({ id: "ana", playerName: "Zed", rank: 1 })],
      [source("s1", "uvsgames", [candidatePlayer({ id: "a", playerName: "Ana", rank: 2 })])],
      [],
    );
    expect(rows.map((row) => row.playerName)).toEqual(["Zed", "Ana"]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });

  it("keeps a standings-only candidate, which carries no list at all", () => {
    const rows = buildRosterRows(
      [],
      [source("s1", "uvsgames", [candidatePlayer({ cards: null, listStatus: "none" })])],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cells.get("s1")?.listStatus).toBe("none");
  });
});

describe("candidateCardCount", () => {
  it("sums copies across zones", () => {
    const player = candidatePlayer({
      cards: [
        { name: "Yasuo", zone: "legend", quantity: 1, cardId: "c1" },
        { name: "Recall", zone: "main", quantity: 3, cardId: "c2" },
      ],
    });
    expect(candidateCardCount(player)).toBe(4);
  });

  it("is zero for an empty list", () => {
    expect(candidateCardCount(candidatePlayer({ cards: [] }))).toBe(0);
  });

  it("is zero for a standings-only row, which has no list", () => {
    expect(candidateCardCount(candidatePlayer({ cards: null, listStatus: "none" }))).toBe(0);
  });
});

describe("rosterRecord", () => {
  it("renders all three parts, counting an unpublished draw column as none", () => {
    expect(rosterRecord({ wins: 6, losses: 1, draws: null })).toBe("6-1-0");
    expect(rosterRecord({ wins: 6, losses: 1, draws: 2 })).toBe("6-1-2");
  });

  it("renders nothing when the source published no record", () => {
    expect(rosterRecord({ wins: null, losses: null, draws: null })).toBeNull();
  });
});

describe("compareRosterFields", () => {
  it("marks only the fields that would change", () => {
    const comparisons = compareRosterFields(
      livePlayer({ rank: 1, wins: 6, losses: 1 }),
      candidatePlayer({ rank: 2, wins: 6, losses: 1 }),
    );
    const byField = Object.fromEntries(comparisons.map((row) => [row.field, row.differs]));
    expect(byField.rank).toBe(true);
    expect(byField.wins).toBe(false);
    expect(byField.losses).toBe(false);
  });

  it("prints each side's rank through its own bracket flag", () => {
    const comparisons = compareRosterFields(
      livePlayer({ rank: 8, rankIsTier: false }),
      candidatePlayer({ rank: 8, rankIsTier: true }),
    );
    const rank = comparisons.find((row) => row.field === "rank");
    expect(rank?.live).toBe("8th");
    expect(rank?.candidate).toBe("T8");
    // The rank column itself is unchanged; only the flag beside it is.
    expect(rank?.differs).toBe(false);
    expect(comparisons.find((row) => row.field === "rankIsTier")?.differs).toBe(true);
  });

  it("compares legend and champion by card id but prints their names", () => {
    const comparisons = compareRosterFields(
      livePlayer({ legendCardId: "card-yasuo", legendName: "Yasuo" }),
      candidatePlayer({ legendCardId: "card-lux", legendName: "Lux" }),
    );
    const legend = comparisons.find((row) => row.field === "legend");
    expect(legend?.live).toBe("Yasuo");
    expect(legend?.candidate).toBe("Lux");
    expect(legend?.differs).toBe(true);
  });

  it("marks nothing when there is no archived row to change", () => {
    const comparisons = compareRosterFields(null, candidatePlayer());
    expect(comparisons.every((row) => !row.differs)).toBe(true);
    expect(comparisons.find((row) => row.field === "champion")?.live).toBe("(none)");
  });
});

describe("rosterListDelta", () => {
  it("reads the server diff when the row is linked", () => {
    const delta = rosterListDelta(
      candidatePlayer({
        metaEventPlayerId: "live-1",
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
      candidatePlayer({
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

  it("is empty for a standings-only row", () => {
    const delta = rosterListDelta(candidatePlayer({ cards: null, listStatus: "none" }));
    expect(hasListDelta(delta)).toBe(false);
  });

  it("reports an in-sync linked row as empty", () => {
    const delta = rosterListDelta(
      candidatePlayer({
        metaEventPlayerId: "live-1",
        diff: { fields: [], cards: { added: [], removed: [], changed: [] } },
      }),
    );
    expect(hasListDelta(delta)).toBe(false);
  });
});

describe("rosterAcceptBlockedReason", () => {
  it("blocks on unmatched card names", () => {
    expect(rosterAcceptBlockedReason(candidatePlayer({ unresolvedNames: ["Yasou"] }))).toBe(
      "1 card name still unmatched.",
    );
    expect(rosterAcceptBlockedReason(candidatePlayer({ unresolvedNames: ["a", "b"] }))).toBe(
      "2 card names still unmatched.",
    );
  });

  it("allows a row whose names all resolved", () => {
    expect(rosterAcceptBlockedReason(candidatePlayer())).toBeNull();
  });

  it("does not block a standings-only row whose legend matched nothing", () => {
    const player = candidatePlayer({
      cards: null,
      listStatus: "none",
      legendName: "Yasou",
      legendCardId: null,
    });
    expect(rosterAcceptBlockedReason(player)).toBeNull();
    expect(needsUnresolvedLegendConfirm(player)).toBe(true);
  });
});

describe("needsUnresolvedLegendConfirm", () => {
  it("is false when the legend resolved", () => {
    expect(needsUnresolvedLegendConfirm(candidatePlayer())).toBe(false);
  });

  it("is false when the source named no legend at all", () => {
    expect(
      needsUnresolvedLegendConfirm(candidatePlayer({ legendName: null, legendCardId: null })),
    ).toBe(false);
  });
});
