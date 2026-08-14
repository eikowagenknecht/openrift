import type { MetaCandidateDeck, MetaCandidateQueueRow } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  candidateStateDisplay,
  formatCardDeltaLines,
  formatDiffValue,
  groupCandidateCardsByZone,
  hasDeckChanges,
  parseMetaUploadFile,
  sortCandidateQueue,
} from "@/lib/meta-candidate-review";

function queueRow(overrides: Partial<MetaCandidateQueueRow> = {}): MetaCandidateQueueRow {
  return {
    id: "candidate-1",
    provider: "riftdecks",
    externalId: "evt-1",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "standard",
    deckCount: 8,
    unacceptedDeckCount: 8,
    state: "new",
    unresolvedCardCount: 0,
    checkedAt: null,
    metaEventId: null,
    metaEventSlug: null,
    ...overrides,
  };
}

const emptyDelta = { added: [], removed: [], changed: [] };

function zoneLabel(zone: string): string {
  return zone === "main" ? "Main" : "Sideboard";
}

describe("parseMetaUploadFile", () => {
  it("accepts a full provider + events body", () => {
    const result = parseMetaUploadFile(
      JSON.stringify({ provider: "riftdecks", events: [{ externalId: "evt-1" }] }),
    );
    expect(result).toEqual({
      ok: true,
      body: { provider: "riftdecks", events: [{ externalId: "evt-1" }] },
    });
  });

  it("trims the provider", () => {
    const result = parseMetaUploadFile(
      JSON.stringify({ provider: "  riftdecks  ", events: [{ externalId: "evt-1" }] }),
    );
    expect(result.ok && result.body.provider).toBe("riftdecks");
  });

  it("rejects invalid JSON", () => {
    expect(parseMetaUploadFile("{not json")).toEqual({ ok: false, error: "Not valid JSON." });
  });

  it("rejects a bare array", () => {
    const result = parseMetaUploadFile("[]");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("JSON object");
  });

  it("rejects a missing provider", () => {
    const result = parseMetaUploadFile(JSON.stringify({ events: [{ externalId: "evt-1" }] }));
    expect(!result.ok && result.error).toContain("provider");
  });

  it("rejects a blank provider", () => {
    const result = parseMetaUploadFile(JSON.stringify({ provider: "   ", events: [{}] }));
    expect(!result.ok && result.error).toContain("provider");
  });

  it("rejects an empty events array", () => {
    const result = parseMetaUploadFile(JSON.stringify({ provider: "riftdecks", events: [] }));
    expect(!result.ok && result.error).toContain("events");
  });

  it("rejects a null body", () => {
    const result = parseMetaUploadFile("null");
    expect(result.ok).toBe(false);
  });
});

describe("sortCandidateQueue", () => {
  it("puts unreviewed rows first, then the newest event date", () => {
    const rows = [
      queueRow({ id: "a", checkedAt: "2026-08-10T10:00:00.000Z", eventDate: "2026-08-09" }),
      queueRow({ id: "b", checkedAt: null, eventDate: "2026-07-01" }),
      queueRow({ id: "c", checkedAt: null, eventDate: "2026-08-05" }),
    ];
    expect(sortCandidateQueue(rows).map((row) => row.id)).toEqual(["c", "b", "a"]);
  });

  it("breaks a same-day tie by name", () => {
    const rows = [
      queueRow({ id: "z", name: "Zaun Open" }),
      queueRow({ id: "a", name: "Arcane Cup" }),
    ];
    expect(sortCandidateQueue(rows).map((row) => row.id)).toEqual(["a", "z"]);
  });

  it("leaves the input untouched", () => {
    const rows = [queueRow({ id: "a", eventDate: "2026-07-01" }), queueRow({ id: "b" })];
    sortCandidateQueue(rows);
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("handles an empty queue", () => {
    expect(sortCandidateQueue([])).toEqual([]);
  });
});

describe("formatCardDeltaLines", () => {
  it("renders additions, removals, and quantity changes", () => {
    const lines = formatCardDeltaLines(
      {
        added: [{ cardId: "c1", zone: "main", quantity: 2, name: "Vi" }],
        removed: [{ cardId: "c2", zone: "sideboard", quantity: 1, name: "Jinx" }],
        changed: [{ cardId: "c3", zone: "main", from: 3, to: 2, name: "Ekko" }],
      },
      zoneLabel,
    );
    expect(lines).toEqual(["+2 Vi (Main)", "-1 Jinx (Sideboard)", "Ekko (Main) 3 → 2"]);
  });

  it("labels a card whose row vanished", () => {
    const lines = formatCardDeltaLines(
      { ...emptyDelta, added: [{ cardId: "c1", zone: "main", quantity: 1, name: null }] },
      zoneLabel,
    );
    expect(lines).toEqual(["+1 Unknown card (Main)"]);
  });

  it("returns nothing for an empty delta", () => {
    expect(formatCardDeltaLines(emptyDelta, zoneLabel)).toEqual([]);
  });
});

describe("hasDeckChanges", () => {
  it("is false while the deck is unlinked", () => {
    expect(hasDeckChanges(null)).toBe(false);
  });

  it("is false for an empty diff", () => {
    expect(hasDeckChanges({ fields: [], cards: emptyDelta })).toBe(false);
  });

  it("is true for a field-only change", () => {
    const diff: NonNullable<MetaCandidateDeck["diff"]> = {
      fields: [{ field: "record", from: "5-1", to: "6-0" }],
      cards: emptyDelta,
    };
    expect(hasDeckChanges(diff)).toBe(true);
  });

  it("is true for a card-only change", () => {
    const diff: NonNullable<MetaCandidateDeck["diff"]> = {
      fields: [],
      cards: {
        ...emptyDelta,
        changed: [{ cardId: "c1", zone: "main", from: 1, to: 2, name: "Vi" }],
      },
    };
    expect(hasDeckChanges(diff)).toBe(true);
  });
});

describe("formatDiffValue", () => {
  it("renders scalars", () => {
    expect(formatDiffValue("Summoner Skirmish")).toBe("Summoner Skirmish");
    expect(formatDiffValue(64)).toBe("64");
    expect(formatDiffValue(true)).toBe("true");
  });

  it("joins lists", () => {
    expect(formatDiffValue(["a", "b"])).toBe("a, b");
  });

  it("shows a placeholder for empty values", () => {
    expect(formatDiffValue(null)).toBe("—");
    expect(formatDiffValue(undefined)).toBe("—");
    expect(formatDiffValue("")).toBe("—");
    expect(formatDiffValue([])).toBe("—");
  });
});

describe("groupCandidateCardsByZone", () => {
  const cards = [
    { name: "Vi", zone: "main", quantity: 3, cardId: "c1" },
    { name: "Ekko", zone: "main", quantity: 1, cardId: "c2" },
    { name: "Jinx", zone: "sideboard", quantity: 2, cardId: null },
    { name: "Poro", zone: "snacks", quantity: 1, cardId: null },
  ];

  it("orders known zones by the configured order and sorts cards by name", () => {
    const groups = groupCandidateCardsByZone(cards, ["sideboard", "main"]);
    expect(groups.map((group) => group.zone)).toEqual(["sideboard", "main", "snacks"]);
    expect(groups[1]?.cards.map((card) => card.name)).toEqual(["Ekko", "Vi"]);
  });

  it("keeps a zone the source invented instead of dropping its cards", () => {
    const groups = groupCandidateCardsByZone(cards, ["main"]);
    const snacks = groups.find((group) => group.zone === "snacks");
    expect(snacks?.cards).toHaveLength(1);
  });

  it("skips configured zones with no cards", () => {
    const groups = groupCandidateCardsByZone(
      [{ name: "Vi", zone: "main", quantity: 1, cardId: "c1" }],
      ["main", "sideboard"],
    );
    expect(groups.map((group) => group.zone)).toEqual(["main"]);
  });

  it("handles an empty card list", () => {
    expect(groupCandidateCardsByZone([], ["main"])).toEqual([]);
  });
});

describe("candidateStateDisplay", () => {
  it("names each state", () => {
    expect(candidateStateDisplay("new").label).toBe("New");
    expect(candidateStateDisplay("changed").label).toBe("Changed");
    expect(candidateStateDisplay("inSync").label).toBe("In sync");
  });
});
