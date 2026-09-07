interface FixTypographyOptions {
  italicParens?: boolean;
  keywordGlyphs?: boolean;
  costKeywords?: readonly string[];
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

export function fixTypography(text: string, options?: FixTypographyOptions): string;
export function fixTypography(text: string | null, options?: FixTypographyOptions): string | null;
export function fixTypography(text: string | null, options?: FixTypographyOptions): string | null {
  if (text === null) {
    return null;
  }
  const { italicParens = true, keywordGlyphs = true, costKeywords = [] } = options ?? {};
  let result = text
    .replaceAll("'", "’")
    .replaceAll("...", "…")
    .replaceAll(/"(?<quoted>[^"]*)"/gu, "“$<quoted>”")
    .replaceAll(/-(?<digit>\d)/gu, "−$<digit>")
    .replaceAll(/\n (?! )/gu, "\n");
  // Must reproduce untouched parts byte-for-byte for card-text.ts's downstream tokenizer.
  if (keywordGlyphs) {
    const costAlternation = costKeywords.map((name) => escapeRegExp(name)).join("|");
    if (costAlternation) {
      result = result.replaceAll(
        new RegExp(
          `\\[(?<keyword>${costAlternation})\\][ \\t]*(?<glyphs>:rb_\\w+:(?:[ \\t]*:rb_\\w+:)*)`,
          "gu",
        ),
        (_, keyword: string, glyphs: string) => `[${keyword} ${glyphs}]`,
      );
    }
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
    result = result
      .replaceAll(/_\((?<inner>[^)]*)\)_/gu, "($<inner>)")
      .replaceAll(/\((?<inner>[^)]*)\)/gu, "_($<inner>)_");
  }
  return result;
}

/** Excludes runes (`SET-R##`) and tokens (`SET-T##`) — they aren't numbered against the set total. */
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
