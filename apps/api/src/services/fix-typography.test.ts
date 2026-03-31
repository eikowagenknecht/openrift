import { describe, expect, it } from "vitest";

import { appendSetTotal, fixTypography } from "./fix-typography.js";

describe("fixTypography", () => {
  it("returns null for null input", () => {
    expect(fixTypography(null)).toBeNull();
  });

  it("returns the string unchanged when no fixes are needed", () => {
    expect(fixTypography("Deal 3 to all enemy units.")).toBe("Deal 3 to all enemy units.");
  });

  // ── Apostrophes ──────────────────────────────────────────────────────────

  it("replaces straight apostrophes with curly", () => {
    expect(fixTypography("can't")).toBe("can\u2019t");
  });

  it("replaces multiple apostrophes", () => {
    expect(fixTypography("it's a player's turn")).toBe("it\u2019s a player\u2019s turn");
  });

  // ── Ellipsis ─────────────────────────────────────────────────────────────

  it("replaces triple dots with ellipsis", () => {
    expect(fixTypography("wait...")).toBe("wait\u2026");
  });

  it("does not replace two dots", () => {
    expect(fixTypography("wait..")).toBe("wait..");
  });

  // ── Double quotes ────────────────────────────────────────────────────────

  it("replaces paired straight double quotes with curly", () => {
    expect(fixTypography('"hello"')).toBe("\u201Chello\u201D");
  });

  it("replaces multiple quote pairs", () => {
    expect(fixTypography('"one" and "two"')).toBe("\u201Cone\u201D and \u201Ctwo\u201D");
  });

  // ── Minus sign ───────────────────────────────────────────────────────────

  it("replaces hyphen before digit with minus sign", () => {
    expect(fixTypography("-1")).toBe("\u22121");
  });

  it("replaces in context like stat modifiers", () => {
    expect(fixTypography("gets -2/-3")).toBe("gets \u22122/\u22123");
  });

  it("does not replace hyphens not followed by a digit", () => {
    expect(fixTypography("well-known")).toBe("well-known");
  });

  // ── Leading whitespace ────────────────────────────────────────────────────

  it("strips a single leading space after a line break", () => {
    expect(fixTypography("line one\n line two")).toBe("line one\nline two");
  });

  it("does not strip multiple leading spaces", () => {
    expect(fixTypography("line one\n  line two")).toBe("line one\n  line two");
  });

  // ── Italic parens ────────────────────────────────────────────────────────

  it("wraps parenthesized text with underscores", () => {
    expect(fixTypography("(reminder text)")).toBe("_(reminder text)_");
  });

  it("does not double-wrap already wrapped parens", () => {
    expect(fixTypography("_(reminder text)_")).toBe("_(reminder text)_");
  });

  it("wraps multiple parenthesized groups", () => {
    expect(fixTypography("(one) and (two)")).toBe("_(one)_ and _(two)_");
  });

  it("handles text with no parens unchanged (aside from other fixes)", () => {
    expect(fixTypography("no parens here")).toBe("no parens here");
  });

  // ── Keyword glyphs ──────────────────────────────────────────────────────

  it("moves trailing glyphs inside keyword brackets", () => {
    expect(fixTypography("[Equip] :rb_rune_mind:")).toBe("[Equip :rb_rune_mind:]");
  });

  it("moves multiple glyphs inside cost-keyword brackets", () => {
    expect(fixTypography("[Equip] :rb_energy_1::rb_rune_body:")).toBe(
      "[Equip :rb_energy_1::rb_rune_body:]",
    );
  });

  it("moves space-separated glyphs inside keyword brackets", () => {
    expect(fixTypography("[Repeat] :rb_energy_2: :rb_rune_fury:")).toBe(
      "[Repeat :rb_energy_2: :rb_rune_fury:]",
    );
  });

  it("preserves space after closing bracket when glyphs are moved inside", () => {
    expect(fixTypography("[Repeat] :rb_energy_3: (You may pay the additional cost.)")).toBe(
      "[Repeat :rb_energy_3:] _(You may pay the additional cost.)_",
    );
  });

  it("does not move glyphs for non-cost keywords like Add", () => {
    expect(fixTypography("[Add] :rb_energy_1:.")).toBe("[Add] :rb_energy_1:.");
  });

  it("does not move glyphs across newlines", () => {
    expect(fixTypography("[Deflect]\n :rb_energy_2: :rb_rune_fury:")).toBe(
      "[Deflect]\n:rb_energy_2: :rb_rune_fury:",
    );
  });

  it("unfixes wrongly-merged non-cost keywords", () => {
    expect(fixTypography("[Add :rb_energy_1::rb_rune_rainbow:]")).toBe(
      "[Add] :rb_energy_1::rb_rune_rainbow:",
    );
  });

  it("does not move glyphs into non-word brackets like [>]", () => {
    expect(fixTypography("[Reaction][>] :rb_exhaust::")).toBe("[Reaction][>] :rb_exhaust::");
  });

  it("leaves already-correct cost-keyword brackets unchanged", () => {
    expect(fixTypography("[Equip :rb_rune_mind:]")).toBe("[Equip :rb_rune_mind:]");
  });

  it("skips keyword glyphs when keywordGlyphs is false", () => {
    expect(fixTypography("[Equip] :rb_rune_mind:", { keywordGlyphs: false })).toBe(
      "[Equip] :rb_rune_mind:",
    );
  });

  // ── Combined ─────────────────────────────────────────────────────────────

  it("applies all fixes together", () => {
    const input = `Deal -3 to target unit. (This includes the unit's allies...)
"Activate" this card.`;
    const expected = `Deal \u22123 to target unit. _(This includes the unit\u2019s allies\u2026)_
\u201CActivate\u201D this card.`;
    expect(fixTypography(input)).toBe(expected);
  });

  it("is idempotent — applying twice gives the same result", () => {
    const input = 'Deal -1. (reminder text) It\'s a "test"...';
    const once = fixTypography(input);
    const twice = fixTypography(once);
    expect(twice).toBe(once);
  });
});

describe("appendSetTotal", () => {
  it("appends printed total when missing", () => {
    expect(appendSetTotal("SFD-109", 221)).toBe("SFD-109/221");
  });

  it("leaves code unchanged when total already present", () => {
    expect(appendSetTotal("OGN-133/298", 298)).toBe("OGN-133/298");
  });

  it("leaves code unchanged when printedTotal is null", () => {
    expect(appendSetTotal("SFD-109", null)).toBe("SFD-109");
  });

  it("leaves code unchanged when printedTotal is zero", () => {
    expect(appendSetTotal("SFD-109", 0)).toBe("SFD-109");
  });

  it("handles art variant codes", () => {
    expect(appendSetTotal("OGN-079a", 298)).toBe("OGN-079a/298");
  });
});
