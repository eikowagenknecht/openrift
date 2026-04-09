import { describe, expect, it } from "bun:test";

import { extractBracketedTerms, extractKeywords } from "./keywords.js";

// ── extractBracketedTerms ─────────────────────────────────────────────────

describe("extractBracketedTerms", () => {
  // ── Empty / missing input ───────────────────────────────────────────────

  it("returns empty array for empty string", () => {
    expect(extractBracketedTerms("")).toEqual([]);
  });

  it("returns empty array for null-ish input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(extractBracketedTerms(null as any)).toEqual([]);
    expect(extractBracketedTerms(undefined as any)).toEqual([]);
  });

  it("returns empty array when text has no brackets", () => {
    expect(extractBracketedTerms("Deal 3 damage to a unit.")).toEqual([]);
  });

  // ── English (space-separated params) ────────────────────────────────────

  it("extracts a single keyword", () => {
    expect(extractBracketedTerms("[Shield]")).toEqual(["Shield"]);
  });

  it("strips numeric params from English keywords", () => {
    expect(extractBracketedTerms("[Shield 2]")).toEqual(["Shield"]);
  });

  it("strips resource glyphs", () => {
    expect(extractBracketedTerms("[Equip :rb_rune_mind:]")).toEqual(["Equip"]);
  });

  it("strips resource glyphs and numeric params together", () => {
    expect(extractBracketedTerms("[Assault 3 :rb_rune_fire:]")).toEqual(["Assault"]);
  });

  it("extracts multiple keywords preserving order", () => {
    expect(extractBracketedTerms("[Shield 2] Deal 3 damage. [Assault 1] Draw a card.")).toEqual([
      "Shield",
      "Assault",
    ]);
  });

  it("does not deduplicate", () => {
    expect(extractBracketedTerms("[Shield] [Shield 2]")).toEqual(["Shield", "Shield"]);
  });

  it("skips pure-number brackets", () => {
    expect(extractBracketedTerms("[3]")).toEqual([]);
  });

  it("skips single-character brackets", () => {
    expect(extractBracketedTerms("[X]")).toEqual([]);
  });

  it("skips brackets that are only resource glyphs", () => {
    expect(extractBracketedTerms("[:rb_rune_fire:]")).toEqual([]);
  });

  // ── CJK: trailing digit stripping ──────────────────────────────────────

  it("strips trailing digit from CJK keyword", () => {
    expect(extractBracketedTerms("[坚守2]")).toEqual(["坚守"]);
  });

  it("strips trailing multi-digit number from CJK keyword", () => {
    expect(extractBracketedTerms("[等级11>]")).toEqual(["等级"]);
  });

  it("strips trailing > symbol from CJK keyword", () => {
    expect(extractBracketedTerms("[绝念>]")).toEqual(["绝念"]);
  });

  it("strips trailing digit and > together", () => {
    expect(extractBracketedTerms("[等级6>]")).toEqual(["等级"]);
  });

  // ── CJK: trailing color stripping ──────────────────────────────────────

  it("strips trailing 蓝色 (blue)", () => {
    expect(extractBracketedTerms("[装配蓝色]")).toEqual(["装配"]);
  });

  it("strips trailing 红色 (red)", () => {
    expect(extractBracketedTerms("[装配红色]")).toEqual(["装配"]);
  });

  it("strips trailing 绿色 (green)", () => {
    expect(extractBracketedTerms("[装配绿色]")).toEqual(["装配"]);
  });

  it("strips trailing 橙色 (orange)", () => {
    expect(extractBracketedTerms("[装配橙色]")).toEqual(["装配"]);
  });

  it("strips trailing 紫色 (purple)", () => {
    expect(extractBracketedTerms("[装配紫色]")).toEqual(["装配"]);
  });

  it("strips trailing 白色 (white)", () => {
    expect(extractBracketedTerms("[装配白色]")).toEqual(["装配"]);
  });

  it("strips trailing 黑色 (black)", () => {
    expect(extractBracketedTerms("[装配黑色]")).toEqual(["装配"]);
  });

  // ── CJK: combined digit + color stripping ──────────────────────────────

  it("strips trailing digit+color combination", () => {
    expect(extractBracketedTerms("[回响4蓝色]")).toEqual(["回响"]);
  });

  it("strips trailing digit+color with multi-digit number", () => {
    expect(extractBracketedTerms("[回响12紫色]")).toEqual(["回响"]);
  });

  // ── CJK: trailing Latin letter stripping ───────────────────────────────

  it("strips trailing Latin letter from CJK keyword", () => {
    expect(extractBracketedTerms("[装配A]")).toEqual(["装配"]);
  });

  // ── CJK: no-op cases ──────────────────────────────────────────────────

  it("keeps plain CJK keyword unchanged", () => {
    expect(extractBracketedTerms("[坚守]")).toEqual(["坚守"]);
  });

  it("keeps CJK keyword unchanged when no suffix present", () => {
    expect(extractBracketedTerms("[游走]")).toEqual(["游走"]);
  });

  it("preserves standalone CJK color word (too short after stripping)", () => {
    // 蓝色 alone: stripping color leaves "", length < 2, so keeps original
    expect(extractBracketedTerms("[蓝色]")).toEqual(["蓝色"]);
  });

  it("preserves standalone CJK color word for red", () => {
    expect(extractBracketedTerms("[红色]")).toEqual(["红色"]);
  });

  // ── CJK: space-separated params still work ────────────────────────────

  it("strips space-separated numeric params from CJK keywords", () => {
    expect(extractBracketedTerms("[护盾 2]")).toEqual(["护盾"]);
  });

  // ── CJK: multiple terms ────────────────────────────────────────────────

  it("handles mixed CJK terms with different suffixes", () => {
    expect(extractBracketedTerms("[坚守2] [装配蓝色] [回响4蓝色] [等级6>]")).toEqual([
      "坚守",
      "装配",
      "回响",
      "等级",
    ]);
  });

  // ── Mixed EN and CJK (should not happen in practice but tests safety) ─

  it("does not strip digits from English keywords", () => {
    // English keywords don't contain CJK chars, so CJK stripping is skipped
    expect(extractBracketedTerms("[Shield2]")).toEqual(["Shield2"]);
  });
});

// ── extractKeywords ───────────────────────────────────────────────────────

describe("extractKeywords", () => {
  // ── Empty / missing input ───────────────────────────────────────────────

  it("returns empty array for empty string", () => {
    expect(extractKeywords("")).toEqual([]);
  });

  it("returns empty array for null-ish input", () => {
    expect(extractKeywords(null as any)).toEqual([]);
    expect(extractKeywords(undefined as any)).toEqual([]);
  });

  it("returns empty array when text has no brackets", () => {
    expect(extractKeywords("Deal 3 damage to a unit.")).toEqual([]);
  });

  // ── Basic extraction ───────────────────────────────────────────────────

  it("extracts a single keyword", () => {
    expect(extractKeywords("[Shield]")).toEqual(["Shield"]);
  });

  it("strips numeric params", () => {
    expect(extractKeywords("[Shield 2]")).toEqual(["Shield"]);
  });

  it("strips resource glyphs", () => {
    expect(extractKeywords("[Equip :rb_rune_mind:]")).toEqual(["Equip"]);
  });

  it("extracts multiple unique keywords", () => {
    const result = extractKeywords("[Shield 2] [Assault 1] [Equip :rb_rune_mind:]");
    expect(result).toContain("Shield");
    expect(result).toContain("Assault");
    expect(result).toContain("Equip");
    expect(result).toHaveLength(3);
  });

  // ── Deduplication ──────────────────────────────────────────────────────

  it("deduplicates repeated keywords", () => {
    expect(extractKeywords("[Shield] [Shield 2] [Shield 3]")).toEqual(["Shield"]);
  });

  // ── Skipped tokens ────────────────────────────────────────────────────

  it("skips pure-number brackets", () => {
    expect(extractKeywords("[3]")).toEqual([]);
  });

  it("skips single-character brackets", () => {
    expect(extractKeywords("[X]")).toEqual([]);
  });

  it("skips symbol-only brackets", () => {
    expect(extractKeywords("[>>]")).toEqual([]);
  });

  it("skips brackets that are only resource glyphs", () => {
    expect(extractKeywords("[:rb_rune_fire:]")).toEqual([]);
  });

  // ── Mixed content ─────────────────────────────────────────────────────

  it("extracts keywords from mixed text with non-keyword brackets", () => {
    const result = extractKeywords("When played, [Shield 2]. Deal [3] damage. [Assault 1].");
    expect(result).toContain("Shield");
    expect(result).toContain("Assault");
    expect(result).toHaveLength(2);
  });
});
