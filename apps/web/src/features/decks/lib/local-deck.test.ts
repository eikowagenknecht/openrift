import { describe, expect, it } from "vitest";

import { isLocalDeckId, LOCAL_DECK_PREFIX } from "./local-deck";

describe("isLocalDeckId", () => {
  it("recognizes an id carrying the local prefix", () => {
    expect(isLocalDeckId(`${LOCAL_DECK_PREFIX}draft-1`)).toBe(true);
  });

  it("recognizes the bare prefix", () => {
    expect(isLocalDeckId(LOCAL_DECK_PREFIX)).toBe(true);
  });

  it("rejects a server deck uuid", () => {
    expect(isLocalDeckId("00000000-0000-0000-0000-000000000001")).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(isLocalDeckId("")).toBe(false);
  });

  it("rejects an id that only contains the prefix later on", () => {
    expect(isLocalDeckId("deck-local:1")).toBe(false);
  });

  it("is case sensitive", () => {
    expect(isLocalDeckId("LOCAL:draft-1")).toBe(false);
  });
});
