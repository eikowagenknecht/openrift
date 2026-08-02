interface FixTypographyOptions {
  italicParens?: boolean;
  keywordGlyphs?: boolean;
  /**
   * Keywords whose glyph cost renders inside the bracket (e.g. `[Equip :rb_x:]`).
   * Data-driven — the caller supplies the list from the keyword admin flag, so
   * no keyword names are hardcoded here. Any keyword not in this list has its
   * trailing glyphs pushed back outside the bracket. Empty by default: with no
   * cost keywords, every `[Keyword :rb_x:]` is unmerged.
   */
  costKeywords?: readonly string[];
}

/**
 * Escape a string for literal use inside a RegExp.
 * @returns The escaped string.
 */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/**
 * Apply typography fixes to a text string:
 * - Straight apostrophe (') → right single curly quote (’)
 * - Triple dots (...) → horizontal ellipsis (…)
 * - Paired straight double quotes ("…") → curly double quotes (“…”)
 * - Single leading space after line break removed
 * - Hyphen-minus before digit (-1) → minus sign (−) before digit
 * - Parenthesized text (...) wrapped with underscores for italic rendering: _(...)_
 *   (enabled by default, disable with `{ italicParens: false }` for flavor text)
 * - Cost-keyword glyphs: `[Equip] :rb_*:` → `[Equip :rb_*:]` for keywords named in
 *   `costKeywords`. Also unfixes wrongly-merged non-cost keywords:
 *   `[Add :rb_*:]` → `[Add] :rb_*:`. The cost-keyword set is data-driven (passed
 *   in via `costKeywords`), not hardcoded.
 *   (enabled by default, disable with `{ keywordGlyphs: false }` for non-rules text)
 *
 * @returns The text with typography fixes applied, or null if the input is null.
 */
export function fixTypography(text: string, options?: FixTypographyOptions): string;
export function fixTypography(text: string | null, options?: FixTypographyOptions): string | null;
export function fixTypography(text: string | null, options?: FixTypographyOptions): string | null {
  if (text === null) {
    return null;
  }
  const { italicParens = true, keywordGlyphs = true, costKeywords = [] } = options ?? {};
  let result = text
    .replaceAll("'", "’") // straight apostrophe → curly
    .replaceAll("...", "…") // triple dots → ellipsis
    .replaceAll(/"(?<quoted>[^"]*)"/gu, "“$<quoted>”") // straight double quotes → curly
    .replaceAll(/-(?<digit>\d)/gu, "−$<digit>") // hyphen before digit → minus sign
    .replaceAll(/\n (?! )/gu, "\n"); // strip single leading space after line break
  // The two rewrites below look like the bracket grammar in `card-text.ts`, but
  // they are not the same job and deliberately do not share it. `tokenizeCardText`
  // parses text that is already correct; these run upstream at import/admin time
  // to *make* it correct, so they work on the raw string and must reproduce the
  // untouched parts of it byte for byte. They are also narrower on purpose: the
  // bracket here is `[A-Z][a-z]+`, not the tokenizer's `[^\]]+`, which is what
  // keeps `[>]`, `[Level 3]` and CJK labels out of the rewrite. Routing this
  // through the tokenizer would mean re-serializing every token just to move a
  // glyph across one bracket.
  if (keywordGlyphs) {
    const costAlternation = costKeywords.map((name) => escapeRegExp(name)).join("|");
    if (costAlternation) {
      // Move trailing :rb_*: glyphs inside cost-keyword brackets: [Equip] :rb_x: → [Equip :rb_x:]
      // Only keywords flagged as cost keywords take glyph costs as parameters.
      result = result.replaceAll(
        new RegExp(
          `\\[(?<keyword>${costAlternation})\\][ \\t]*(?<glyphs>:rb_\\w+:(?:[ \\t]*:rb_\\w+:)*)`,
          "gu",
        ),
        (_, keyword: string, glyphs: string) => `[${keyword} ${glyphs}]`,
      );
    }
    // Unfix wrongly-merged non-cost keywords: [Add :rb_x:] → [Add] :rb_x:
    const negativeLookahead = costAlternation ? `(?!(?:${costAlternation})\\b)` : "";
    result = result.replaceAll(
      new RegExp(
        `\\[${negativeLookahead}(?<keyword>[A-Z][a-z]+)\\s+(?<glyphs>:rb_\\w+:(?:\\s*:rb_\\w+:)*)\\]`,
        "gu",
      ),
      (_, keyword: string, glyphs: string) => `[${keyword}] ${glyphs}`,
    );
  }
  if (italicParens) {
    // Italic parens: strip existing wrappers, then re-add for all
    result = result
      .replaceAll(/_\((?<inner>[^)]*)\)_/gu, "($<inner>)")
      .replaceAll(/\((?<inner>[^)]*)\)/gu, "_($<inner>)_");
  }
  return result;
}

/**
 * Append `/{printedTotal}` to a public code if it doesn't already contain a slash.
 * E.g. `SFD-109` + `221` → `SFD-109/221`.
 *
 * Runes (`SET-R##`) and tokens (`SET-T##`) are excluded — they aren't numbered
 * against the set total, so a `/N` suffix would be wrong.
 *
 * @returns The public code with the set total appended, or unchanged if already present, total is unavailable, or the code is a rune/token.
 */
export function appendSetTotal(
  publicCode: string,
  printedTotal: number | null | undefined,
): string {
  if (!printedTotal || publicCode.includes("/")) {
    return publicCode;
  }
  if (/^[A-Z]+-[RT]\d/u.test(publicCode)) {
    return publicCode;
  }
  return `${publicCode}/${printedTotal}`;
}
