import { describe, expect, it } from "vitest";

import { fixTypography } from "./fix-typography.js";

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
