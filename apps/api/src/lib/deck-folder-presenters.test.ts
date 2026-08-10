import { describe, expect, it } from "vitest";

import type { DeckFolderWithCount } from "../repositories/deck-folders.js";
import { toDeckFolder } from "./deck-folder-presenters.js";

function makeRow(overrides: Partial<DeckFolderWithCount> = {}): DeckFolderWithCount {
  return {
    id: "f0000000-0001-4000-a000-000000000001",
    userId: "a0000000-0001-4000-a000-000000000001",
    name: "Standard Brews",
    sortOrder: 2,
    deckCount: 3,
    createdAt: new Date("2026-08-01T10:30:00.000Z"),
    updatedAt: new Date("2026-08-02T11:00:00.000Z"),
    ...overrides,
  };
}

describe("toDeckFolder", () => {
  it("maps a folder row to the response shape", () => {
    expect(toDeckFolder(makeRow())).toEqual({
      id: "f0000000-0001-4000-a000-000000000001",
      name: "Standard Brews",
      sortOrder: 2,
      deckCount: 3,
      createdAt: "2026-08-01T10:30:00.000Z",
      updatedAt: "2026-08-02T11:00:00.000Z",
    });
  });

  it("does not leak userId into the response", () => {
    expect(toDeckFolder(makeRow())).not.toHaveProperty("userId");
  });

  it("carries a zero deck count through rather than dropping it", () => {
    expect(toDeckFolder(makeRow({ deckCount: 0 })).deckCount).toBe(0);
  });

  it("serializes timestamps as ISO strings", () => {
    const result = toDeckFolder(makeRow({ createdAt: new Date("2026-01-05T00:00:00.000Z") }));
    expect(result.createdAt).toBe("2026-01-05T00:00:00.000Z");
  });
});
