import { describe, expect, it } from "vitest";

import { textDiff } from "./text-diff";

describe("textDiff (word granularity, default)", () => {
  it("returns a single equal segment when inputs are identical", () => {
    expect(textDiff("hello world", "hello world")).toEqual([
      { text: "hello world", type: "equal" },
    ]);
  });

  it("returns an added segment when old is empty", () => {
    expect(textDiff("", "new text")).toEqual([{ text: "new text", type: "added" }]);
  });

  it("returns a removed segment when new is empty", () => {
    expect(textDiff("old text", "")).toEqual([{ text: "old text", type: "removed" }]);
  });

  it("preserves identical empty strings as a single equal segment", () => {
    expect(textDiff("", "")).toEqual([{ text: "", type: "equal" }]);
  });

  it("marks an inserted word as added", () => {
    expect(textDiff("the cat", "the small cat")).toEqual([
      { text: "the", type: "equal" },
      { text: " small", type: "added" },
      { text: " cat", type: "equal" },
    ]);
  });

  it("marks a removed word as removed", () => {
    expect(textDiff("the small cat", "the cat")).toEqual([
      { text: "the", type: "equal" },
      { text: " small", type: "removed" },
      { text: " cat", type: "equal" },
    ]);
  });

  it("marks a replaced word as removed then added", () => {
    const result = textDiff("the cat sat", "the dog sat");
    expect(result).toEqual([
      { text: "the ", type: "equal" },
      { text: "cat", type: "removed" },
      { text: "dog", type: "added" },
      { text: " sat", type: "equal" },
    ]);
  });

  it("treats punctuation runs as their own tokens", () => {
    const result = textDiff("hello, world", "hello! world");
    expect(result).toEqual([
      { text: "hello", type: "equal" },
      { text: ",", type: "removed" },
      { text: "!", type: "added" },
      { text: " world", type: "equal" },
    ]);
  });

  it("merges consecutive same-type segments", () => {
    const result = textDiff("a b c d", "a x y d");
    const types = result.map((s) => s.type);
    for (let i = 1; i < types.length; i++) {
      expect(types[i]).not.toBe(types[i - 1]);
    }
  });

  it("handles markdown emphasis markers as edits", () => {
    const result = textDiff("the Board", "*The Board*");
    const added = result
      .filter((s) => s.type === "added")
      .map((s) => s.text)
      .join("");
    const removed = result
      .filter((s) => s.type === "removed")
      .map((s) => s.text)
      .join("");
    expect(added).toContain("*");
    expect(added).toContain("The");
    expect(removed).toContain("the");
  });
});

describe("textDiff (char granularity)", () => {
  it("detects a smart-quote substitution", () => {
    const result = textDiff(`it's`, `it’s`, { granularity: "char" });
    expect(result).toEqual([
      { text: "it", type: "equal" },
      { text: "'", type: "removed" },
      { text: "’", type: "added" },
      { text: "s", type: "equal" },
    ]);
  });

  it("detects an inserted character mid-word", () => {
    const result = textDiff("color", "colour", { granularity: "char" });
    expect(result).toEqual([
      { text: "colo", type: "equal" },
      { text: "u", type: "added" },
      { text: "r", type: "equal" },
    ]);
  });

  it("returns identical input as a single equal segment", () => {
    expect(textDiff("abc", "abc", { granularity: "char" })).toEqual([
      { text: "abc", type: "equal" },
    ]);
  });
});

describe("textDiff round-trip", () => {
  it("the equal+added segments reconstruct newText (word)", () => {
    const oldText = "the quick brown fox jumps over the lazy dog";
    const newText = "the slow brown fox leaps across the sleepy dog";
    const segments = textDiff(oldText, newText);
    const reconstructed = segments
      .filter((s) => s.type !== "removed")
      .map((s) => s.text)
      .join("");
    expect(reconstructed).toBe(newText);
  });

  it("the equal+removed segments reconstruct oldText (word)", () => {
    const oldText = "the quick brown fox jumps over the lazy dog";
    const newText = "the slow brown fox leaps across the sleepy dog";
    const segments = textDiff(oldText, newText);
    const reconstructed = segments
      .filter((s) => s.type !== "added")
      .map((s) => s.text)
      .join("");
    expect(reconstructed).toBe(oldText);
  });

  it("the equal+added segments reconstruct newText (char)", () => {
    const oldText = "abcdefg";
    const newText = "abXdEfg";
    const segments = textDiff(oldText, newText, { granularity: "char" });
    const reconstructed = segments
      .filter((s) => s.type !== "removed")
      .map((s) => s.text)
      .join("");
    expect(reconstructed).toBe(newText);
  });
});
