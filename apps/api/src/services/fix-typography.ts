interface FixTypographyOptions {
  italicParens?: boolean;
}

/**
 * Apply typography fixes to a text string:
 * - Straight apostrophe (') → right single curly quote (\u2019)
 * - Triple dots (...) → horizontal ellipsis (\u2026)
 * - Paired straight double quotes ("…") → curly double quotes (\u201C…\u201D)
 * - Hyphen-minus before digit (-1) → minus sign (\u2212) before digit
 * - Parenthesized text (...) wrapped with underscores for italic rendering: _(...)_
 *   (enabled by default, disable with `{ italicParens: false }` for flavor text)
 *
 * @returns The text with typography fixes applied, or null if the input is null.
 */
export function fixTypography(text: string, options?: FixTypographyOptions): string;
export function fixTypography(text: string | null, options?: FixTypographyOptions): string | null;
export function fixTypography(text: string | null, options?: FixTypographyOptions): string | null {
  if (text === null) {
    return null;
  }
  const { italicParens = true } = options ?? {};
  let result = text
    .replaceAll("'", "\u2019") // straight apostrophe → curly
    .replaceAll("...", "\u2026") // triple dots → ellipsis
    .replaceAll(/"([^"]*)"/g, "\u201C$1\u201D") // straight double quotes → curly
    .replaceAll(/-(\d)/g, "\u2212$1"); // hyphen before digit → minus sign
  if (italicParens) {
    // Italic parens: strip existing wrappers, then re-add for all
    result = result.replaceAll(/_\(([^)]*)\)_/g, "($1)").replaceAll(/\(([^)]*)\)/g, "_($1)_");
  }
  return result;
}
