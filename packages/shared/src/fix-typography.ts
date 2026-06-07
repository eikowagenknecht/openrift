interface FixTypographyOptions {
  italicParens?: boolean;
  keywordGlyphs?: boolean;
}

/**
 * Apply typography fixes to a text string:
 * - Straight apostrophe (') → right single curly quote (\u2019)
 * - Triple dots (...) → horizontal ellipsis (\u2026)
 * - Paired straight double quotes ("…") → curly double quotes (\u201C…\u201D)
 * - Single leading space after line break removed
 * - Hyphen-minus before digit (-1) → minus sign (\u2212) before digit
 * - Parenthesized text (...) wrapped with underscores for italic rendering: _(...)_
 *   (enabled by default, disable with `{ italicParens: false }` for flavor text)
 * - Cost-keyword glyphs: `[Equip] :rb_*:` → `[Equip :rb_*:]` (only Equip and Repeat)
 *   Also unfixes wrongly-merged non-cost keywords: `[Add :rb_*:]` → `[Add] :rb_*:`
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
  const { italicParens = true, keywordGlyphs = true } = options ?? {};
  let result = text
    .replaceAll("'", "\u2019") // straight apostrophe → curly
    .replaceAll("...", "\u2026") // triple dots → ellipsis
    .replaceAll(/"(?<quoted>[^"]*)"/gu, "\u201C$<quoted>\u201D") // straight double quotes → curly
    .replaceAll(/-(?<digit>\d)/gu, "\u2212$<digit>") // hyphen before digit → minus sign
    .replaceAll(/\n (?! )/gu, "\n"); // strip single leading space after line break
  if (keywordGlyphs) {
    // Move trailing :rb_*: glyphs inside cost-keyword brackets: [Equip] :rb_x: → [Equip :rb_x:]
    // Only Equip and Repeat take glyph costs as parameters; other keywords (Add, Deflect, etc.) don't.
    result = result.replaceAll(
      /\[(?<keyword>Equip|Repeat)\][ \t]*(?<glyphs>:rb_\w+:(?:[ \t]*:rb_\w+:)*)/gu,
      (_, keyword, glyphs) => `[${keyword} ${glyphs}]`,
    );
    // Unfix wrongly-merged non-cost keywords: [Add :rb_x:] → [Add] :rb_x:
    result = result.replaceAll(
      /\[(?!(?:Equip|Repeat)\b)(?<keyword>[A-Z][a-z]+)\s+(?<glyphs>:rb_\w+:(?:\s*:rb_\w+:)*)\]/gu,
      (_, keyword, glyphs) => `[${keyword}] ${glyphs}`,
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
