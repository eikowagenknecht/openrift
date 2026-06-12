import { describe, expect, it } from "vitest";

import type { DeckCheckCardLine } from "./deck-check.js";
import {
  buildContentHashInput,
  deckCheckEntrySource,
  diffCardLines,
  mapSectionToZone,
} from "./deck-check.js";

function line(overrides: Partial<DeckCheckCardLine> = {}): DeckCheckCardLine {
  return { name: "Blazing Scorcher", zone: "main", quantity: 3, ...overrides };
}

describe("mapSectionToZone", () => {
  it("maps canonical zone slugs to themselves", () => {
    expect(mapSectionToZone("main")).toBe("main");
    expect(mapSectionToZone("legend")).toBe("legend");
    expect(mapSectionToZone("champion")).toBe("champion");
    expect(mapSectionToZone("runes")).toBe("runes");
    expect(mapSectionToZone("battlefield")).toBe("battlefield");
    expect(mapSectionToZone("sideboard")).toBe("sideboard");
    expect(mapSectionToZone("overflow")).toBe("overflow");
  });

  it("maps provider synonyms regardless of case and punctuation", () => {
    expect(mapSectionToZone("Main Deck")).toBe("main");
    expect(mapSectionToZone("DECK")).toBe("main");
    expect(mapSectionToZone("Chosen Champion")).toBe("champion");
    expect(mapSectionToZone("rune")).toBe("runes");
    expect(mapSectionToZone("Side")).toBe("sideboard");
    expect(mapSectionToZone("Battlefields")).toBe("battlefield");
  });

  it("returns null for unknown sections", () => {
    expect(mapSectionToZone("commander")).toBeNull();
    expect(mapSectionToZone("")).toBeNull();
    expect(mapSectionToZone("extra")).toBeNull();
  });
});

describe("buildContentHashInput", () => {
  it("is stable across payload line order", () => {
    const lines = [
      line({ name: "Darius, Trifarian", zone: "champion", quantity: 1 }),
      line({ name: "Blazing Scorcher", quantity: 3 }),
      line({ name: "Aspirant Trainee", quantity: 2 }),
    ];
    const shuffled = [lines[2]!, lines[0]!, lines[1]!];
    expect(buildContentHashInput(lines)).toBe(buildContentHashInput(shuffled));
  });

  it("changes when a quantity changes", () => {
    expect(buildContentHashInput([line({ quantity: 3 })])).not.toBe(
      buildContentHashInput([line({ quantity: 2 })]),
    );
  });

  it("changes when a card moves zone", () => {
    expect(buildContentHashInput([line({ zone: "main" })])).not.toBe(
      buildContentHashInput([line({ zone: "sideboard" })]),
    );
  });

  it("ignores name casing and punctuation differences", () => {
    expect(buildContentHashInput([line({ name: "Darius, Trifarian" })])).toBe(
      buildContentHashInput([line({ name: "darius trifarian" })]),
    );
  });

  it("merges duplicate lines by quantity", () => {
    expect(buildContentHashInput([line({ quantity: 2 }), line({ quantity: 1 })])).toBe(
      buildContentHashInput([line({ quantity: 3 })]),
    );
  });

  it("returns an empty string for no lines", () => {
    expect(buildContentHashInput([])).toBe("");
  });
});

describe("diffCardLines", () => {
  it("reports an unchanged list as empty", () => {
    const lines = [line(), line({ name: "Darius, Trifarian", zone: "champion", quantity: 1 })];
    const diff = diffCardLines(lines, lines);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("reports added and removed lines", () => {
    const diff = diffCardLines([line()], [line({ name: "Aspirant Trainee", quantity: 2 })]);
    expect(diff.added).toEqual([{ name: "Aspirant Trainee", zone: "main", quantity: 2 }]);
    expect(diff.removed).toEqual([{ name: "Blazing Scorcher", zone: "main", quantity: 3 }]);
    expect(diff.changed).toEqual([]);
  });

  it("reports quantity changes", () => {
    const diff = diffCardLines([line({ quantity: 3 })], [line({ quantity: 2 })]);
    expect(diff.changed).toEqual([
      { name: "Blazing Scorcher", zone: "main", oldQuantity: 3, newQuantity: 2 },
    ]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("treats a zone move as removed plus added", () => {
    const diff = diffCardLines([line({ zone: "main" })], [line({ zone: "sideboard" })]);
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(diff.changed).toEqual([]);
  });

  it("handles empty lists on either side", () => {
    expect(diffCardLines([], [line()]).added).toHaveLength(1);
    expect(diffCardLines([line()], []).removed).toHaveLength(1);
  });
});

describe("deckCheckEntrySource", () => {
  it("classifies provider ids as api", () => {
    expect(deckCheckEntrySource("1234")).toBe("api");
    expect(deckCheckEntrySource("wp-order-77")).toBe("api");
  });

  it("classifies manual: ids as manual", () => {
    expect(deckCheckEntrySource("manual:0198ee2a")).toBe("manual");
  });

  it("classifies openrift: ids as self", () => {
    expect(deckCheckEntrySource("openrift:user-1")).toBe("self");
  });
});
