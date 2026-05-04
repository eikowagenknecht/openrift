import { describe, expect, it } from "vitest";

import { parseRulesText } from "./rules";

describe("parseRulesText", () => {
  it("recognises titles, subtitles, and plain text by markdown prefix", () => {
    const input = [
      "000. # Golden and Silver Rules",
      "001. ## Golden Rule",
      "002. Card text supersedes rules text.",
    ].join("\n");

    const rules = parseRulesText(input);

    expect(rules).toEqual([
      {
        ruleNumber: "000",
        ruleType: "title",
        content: "Golden and Silver Rules",
        depth: 0,
        sortOrder: 0,
      },
      { ruleNumber: "001", ruleType: "subtitle", content: "Golden Rule", depth: 0, sortOrder: 1 },
      {
        ruleNumber: "002",
        ruleType: "text",
        content: "Card text supersedes rules text.",
        depth: 0,
        sortOrder: 2,
      },
    ]);
  });

  it("derives depth from the dot-separated rule number, capped at 3", () => {
    const input = [
      "100. Top",
      "100.1. Second",
      "100.1.a. Third",
      "100.1.a.1. Fourth",
      "100.1.a.1.x. Fifth (clamped)",
    ].join("\n");

    const rules = parseRulesText(input);

    expect(rules.map((rule) => [rule.ruleNumber, rule.depth])).toEqual([
      ["100", 0],
      ["100.1", 1],
      ["100.1.a", 2],
      ["100.1.a.1", 3],
      ["100.1.a.1.x", 3],
    ]);
  });

  it("expands the literal two-character backslash-n sequence into real newlines", () => {
    const input = String.raw`103.2. *A Main Deck of at least 40 cards*\n  1 Chosen Champion Unit\n  Units`;

    const rules = parseRulesText(input);

    expect(rules).toHaveLength(1);
    expect(rules[0].content).toBe(
      "*A Main Deck of at least 40 cards*\n  1 Chosen Champion Unit\n  Units",
    );
  });

  it("skips blank lines, separator lines, and unparseable lines", () => {
    const input = [
      "",
      "=== version 1.0 ===",
      "not a rule line",
      "001. ## Golden Rule",
      "",
      "002. Card text supersedes rules text.",
    ].join("\n");

    const rules = parseRulesText(input);

    expect(rules.map((rule) => rule.ruleNumber)).toEqual(["001", "002"]);
  });

  it("preserves markdown markers (italics, etc.) in the stored content", () => {
    const input = '052. *Card*, when written in card effects, is shorthand for "Main Deck card."';

    const rules = parseRulesText(input);

    expect(rules[0].content).toBe(
      '*Card*, when written in card effects, is shorthand for "Main Deck card."',
    );
  });

  it("strips a leading pipe separator before detecting the markdown prefix", () => {
    const input = [
      "000. | # Golden and Silver Rules",
      "001. | ## Golden Rule",
      "002. | Card text supersedes rules text.",
    ].join("\n");

    const rules = parseRulesText(input);

    expect(rules.map((rule) => [rule.ruleType, rule.content])).toEqual([
      ["title", "Golden and Silver Rules"],
      ["subtitle", "Golden Rule"],
      ["text", "Card text supersedes rules text."],
    ]);
  });
});
