import { describe, expect, it } from "vitest";

import type { MetaDeckCardEntry, MetaDeckFields, MetaEventFields } from "./meta-candidate-diff.js";
import {
  collapseCardEntries,
  diffMetaDeck,
  diffMetaDeckCards,
  diffMetaEvent,
  hasCardDiff,
  hasDeckDiff,
  metaCandidateState,
  normalize,
} from "./meta-candidate-diff.js";

const AZIR = "11111111-0000-7000-8000-000000000001";
const YASUO = "11111111-0000-7000-8000-000000000002";
const SHOCK = "11111111-0000-7000-8000-000000000003";

/** @returns A live-shaped event with every field populated. */
function event(overrides: Partial<MetaEventFields> = {}): MetaEventFields {
  return {
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    sourceUrl: "https://example.invalid/skirmish",
    notes: "Top 8 lists only.",
    ...overrides,
  };
}

/** @returns A card entry, defaulting to one copy in the main zone. */
function card(cardId: string, overrides: Partial<MetaDeckCardEntry> = {}): MetaDeckCardEntry {
  return { cardId, zone: "main", quantity: 1, ...overrides };
}

describe("normalize", () => {
  it("folds every way of saying nothing onto null", () => {
    expect(normalize(null)).toBeNull();
    expect(normalize(undefined)).toBeNull();
    expect(normalize("")).toBeNull();
    expect(normalize("   ")).toBeNull();
    expect(normalize("\n\t ")).toBeNull();
  });

  it("passes real values through untouched", () => {
    expect(normalize("LGS Berlin")).toBe("LGS Berlin");
    expect(normalize(" padded ")).toBe(" padded ");
    expect(normalize(0)).toBe(0);
    expect(normalize(64)).toBe(64);
  });
});

describe("diffMetaEvent", () => {
  it("reports nothing for identical events", () => {
    expect(diffMetaEvent(event(), event())).toEqual([]);
  });

  it("reports each disagreeing field with both values", () => {
    const diff = diffMetaEvent(event(), event({ name: "Skirmish Berlin", playerCount: 72 }));
    expect(diff).toEqual([
      { field: "name", from: "Summoner Skirmish Berlin", to: "Skirmish Berlin" },
      { field: "playerCount", from: 64, to: 72 },
    ]);
  });

  it("treats an empty string and null as the same absence", () => {
    const live = event({ organizer: null, notes: null });
    const candidate = event({ organizer: "", notes: "" });
    expect(diffMetaEvent(live, candidate)).toEqual([]);
  });

  it("treats a whitespace-only string as absent too", () => {
    const live = event({ organizer: null, notes: null });
    const candidate = event({ organizer: "   ", notes: "\n\t" });
    expect(diffMetaEvent(live, candidate)).toEqual([]);
  });

  it("keeps the spacing of a string that is not blank", () => {
    expect(diffMetaEvent(event(), event({ organizer: " LGS Berlin " }))).toEqual([
      { field: "organizer", from: "LGS Berlin", to: " LGS Berlin " },
    ]);
  });

  it("reports a field going from a value to absent", () => {
    expect(diffMetaEvent(event(), event({ organizer: null }))).toEqual([
      { field: "organizer", from: "LGS Berlin", to: null },
    ]);
  });

  it("reports a date change", () => {
    expect(diffMetaEvent(event(), event({ eventDate: "2026-08-02" }))).toEqual([
      { field: "eventDate", from: "2026-08-01", to: "2026-08-02" },
    ]);
  });
});

describe("collapseCardEntries", () => {
  it("leaves a list with no duplicates alone", () => {
    const entries = [card(AZIR, { zone: "legend" }), card(SHOCK, { quantity: 3 })];
    expect(collapseCardEntries(entries)).toEqual(entries);
  });

  it("sums rows that landed on the same card and zone", () => {
    const entries = [card(SHOCK, { quantity: 2 }), card(AZIR), card(SHOCK, { quantity: 1 })];
    expect(collapseCardEntries(entries)).toEqual([card(SHOCK, { quantity: 3 }), card(AZIR)]);
  });

  it("keeps the same card in two zones apart", () => {
    const entries = [card(SHOCK, { quantity: 3 }), card(SHOCK, { zone: "sideboard" })];
    expect(collapseCardEntries(entries)).toEqual(entries);
  });

  it("does not mutate its input", () => {
    const entries = [card(SHOCK, { quantity: 2 }), card(SHOCK, { quantity: 1 })];
    collapseCardEntries(entries);
    expect(entries[0].quantity).toBe(2);
  });

  it("returns nothing for an empty list", () => {
    expect(collapseCardEntries([])).toEqual([]);
  });
});

describe("diffMetaDeckCards", () => {
  it("reports nothing for identical lists regardless of order", () => {
    const live = [card(AZIR, { zone: "legend" }), card(SHOCK, { quantity: 3 })];
    const candidate = [card(SHOCK, { quantity: 3 }), card(AZIR, { zone: "legend" })];
    expect(diffMetaDeckCards(live, candidate)).toEqual({ added: [], removed: [], changed: [] });
  });

  it("reports added, removed and re-quantified cards", () => {
    const live = [card(AZIR, { zone: "legend" }), card(SHOCK, { quantity: 3 })];
    const candidate = [card(AZIR, { zone: "legend" }), card(SHOCK, { quantity: 2 }), card(YASUO)];
    const diff = diffMetaDeckCards(live, candidate);
    expect(diff.added).toEqual([card(YASUO)]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([{ cardId: SHOCK, zone: "main", from: 3, to: 2 }]);
  });

  it("reports a card the candidate dropped", () => {
    const diff = diffMetaDeckCards([card(AZIR), card(YASUO)], [card(AZIR)]);
    expect(diff.removed).toEqual([card(YASUO)]);
    expect(diff.added).toEqual([]);
  });

  it("keys on card and zone, so the same card in two zones is two rows", () => {
    const live = [card(SHOCK, { quantity: 3 }), card(SHOCK, { zone: "sideboard", quantity: 1 })];
    const candidate = [
      card(SHOCK, { quantity: 3 }),
      card(SHOCK, { zone: "sideboard", quantity: 2 }),
    ];
    const diff = diffMetaDeckCards(live, candidate);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([{ cardId: SHOCK, zone: "sideboard", from: 1, to: 2 }]);
  });

  it("treats a card moved between zones as a removal plus an addition", () => {
    const diff = diffMetaDeckCards([card(SHOCK)], [card(SHOCK, { zone: "sideboard" })]);
    expect(diff.added).toEqual([card(SHOCK, { zone: "sideboard" })]);
    expect(diff.removed).toEqual([card(SHOCK)]);
    expect(diff.changed).toEqual([]);
  });

  it("reports an empty live list as all additions", () => {
    expect(diffMetaDeckCards([], [card(AZIR)]).added).toEqual([card(AZIR)]);
  });

  it("reports an empty candidate list as all removals", () => {
    expect(diffMetaDeckCards([card(AZIR)], []).removed).toEqual([card(AZIR)]);
  });
});

describe("diffMetaDeck", () => {
  const liveDeck: MetaDeckFields & { cards: MetaDeckCardEntry[] } = {
    event: "live-1",
    name: "Azir Control",
    playerName: "Renata",
    finishTier: 1,
    record: "5-1",
    listStatus: "full",
    cards: [card(AZIR, { zone: "legend" })],
  };

  it("reports nothing for an identical deck", () => {
    expect(hasDeckDiff(diffMetaDeck(liveDeck, liveDeck))).toBe(false);
  });

  it("reports a metadata change alone", () => {
    const diff = diffMetaDeck(liveDeck, { ...liveDeck, finishTier: 4 });
    expect(diff.fields).toEqual([{ field: "finishTier", from: 1, to: 4 }]);
    expect(hasCardDiff(diff.cards)).toBe(false);
    expect(hasDeckDiff(diff)).toBe(true);
  });

  it("reports a card change alone", () => {
    const diff = diffMetaDeck(liveDeck, { ...liveDeck, cards: [...liveDeck.cards, card(SHOCK)] });
    expect(diff.fields).toEqual([]);
    expect(hasCardDiff(diff.cards)).toBe(true);
    expect(hasDeckDiff(diff)).toBe(true);
  });

  it("folds a null record and an empty one together", () => {
    const diff = diffMetaDeck({ ...liveDeck, record: null }, { ...liveDeck, record: "" });
    expect(diff.fields).toEqual([]);
  });

  it("reports a deck that moved to another event", () => {
    const diff = diffMetaDeck(liveDeck, { ...liveDeck, event: "live-2" });
    expect(diff.fields).toEqual([{ field: "event", from: "live-1", to: "live-2" }]);
    expect(hasDeckDiff(diff)).toBe(true);
  });

  it("reports a deck whose candidate no longer points at any event", () => {
    const diff = diffMetaDeck(liveDeck, { ...liveDeck, event: null });
    expect(diff.fields).toEqual([{ field: "event", from: "live-1", to: null }]);
  });

  it("reports a source that upgraded an archetype to a full list", () => {
    // The status alone, so the case can't be mistaken for the card diff
    // carrying it: an archive entry gaining a main deck also gains a public
    // page, and the reviewer has to see that before accepting.
    const archetype = { ...liveDeck, listStatus: "archetype" as const };
    const diff = diffMetaDeck(archetype, liveDeck);
    expect(diff.fields).toEqual([{ field: "listStatus", from: "archetype", to: "full" }]);
    expect(hasDeckDiff(diff)).toBe(true);
  });

  it("reports a partial list being completed, which changes no page", () => {
    // Quieter than the archetype case (the deck already had its page) but still
    // a change the reviewer sees: the side zones are arriving.
    const partial = { ...liveDeck, listStatus: "partial" as const };
    const diff = diffMetaDeck(partial, liveDeck);
    expect(diff.fields).toEqual([{ field: "listStatus", from: "partial", to: "full" }]);
  });

  it("reports nothing for two archetypes that agree", () => {
    const archetype = { ...liveDeck, listStatus: "archetype" as const };
    expect(hasDeckDiff(diffMetaDeck(archetype, archetype))).toBe(false);
  });
});

describe("metaCandidateState", () => {
  it("calls an unlinked candidate new, whatever the diff says", () => {
    expect(metaCandidateState(false, false)).toBe("new");
    expect(metaCandidateState(false, true)).toBe("new");
  });

  it("distinguishes a linked candidate by its diff", () => {
    expect(metaCandidateState(true, true)).toBe("changed");
    expect(metaCandidateState(true, false)).toBe("inSync");
  });
});
