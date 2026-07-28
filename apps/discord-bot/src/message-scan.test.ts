import { describe, expect, it } from "vitest";

import { extractCardReferences, MAX_CARD_REFERENCES } from "./message-scan.js";

describe("extractCardReferences", () => {
  it("extracts a single reference", () => {
    expect(extractCardReferences("check out [[Jinx, Rebel]]!")).toEqual(["Jinx, Rebel"]);
  });

  it("extracts multiple references in order of appearance", () => {
    expect(extractCardReferences("[[Jinx]] beats [[Viktor]]")).toEqual(["Jinx", "Viktor"]);
  });

  it("trims whitespace inside the brackets", () => {
    expect(extractCardReferences("[[  Jinx  ]]")).toEqual(["Jinx"]);
  });

  it("returns empty for messages without references", () => {
    expect(extractCardReferences("no cards here")).toEqual([]);
    expect(extractCardReferences("")).toEqual([]);
  });

  it("ignores empty and whitespace-only brackets", () => {
    expect(extractCardReferences("[[]] [[   ]]")).toEqual([]);
  });

  it("dedupes case-insensitively, keeping the first spelling", () => {
    expect(extractCardReferences("[[Jinx]] and [[jinx]] and [[JINX]]")).toEqual(["Jinx"]);
  });

  it("caps the number of references per message", () => {
    const message = "[[a]] [[b]] [[c]] [[d]] [[e]]";
    expect(extractCardReferences(message)).toHaveLength(MAX_CARD_REFERENCES);
    expect(extractCardReferences(message)).toEqual(["a", "b", "c"]);
  });

  it("does not match across newlines", () => {
    expect(extractCardReferences("[[Jinx\nRebel]]")).toEqual([]);
  });

  it("does not treat single brackets as references", () => {
    expect(extractCardReferences("[Jinx] and [also this]")).toEqual([]);
  });

  it("handles nested opening brackets by matching the innermost pair", () => {
    expect(extractCardReferences("[[[Jinx]]")).toEqual(["Jinx"]);
  });
});
