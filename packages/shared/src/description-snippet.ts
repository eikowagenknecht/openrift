const DEFAULT_MAX_LENGTH = 140;

/**
 * Reduces a markdown deck description to a one-line plain-text snippet for
 * list surfaces (deck tiles). Strips block and inline markdown syntax,
 * collapses whitespace, and truncates at a word boundary with an ellipsis.
 *
 * @returns The snippet, or null when the description has no visible text.
 */
export function descriptionSnippet(
  description: string | null | undefined,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | null {
  if (!description) {
    return null;
  }
  const text = description
    // Fenced code blocks go first so their contents can't leak markers.
    .replaceAll(/```[\s\S]*?(?:```|$)/gu, " ")
    .replaceAll(/`(?<code>[^`]*)`/gu, "$<code>")
    // Images before links: ![alt](url) would otherwise leave "!" behind.
    .replaceAll(/!\[(?<alt>[^\]]*)\]\([^)]*\)/gu, "$<alt>")
    .replaceAll(/\[\[(?<card>[^\]]+)\]\]/gu, "$<card>")
    .replaceAll(/\[(?<label>[^\]]+)\]\([^)]*\)/gu, "$<label>")
    // Block prefixes: headings, blockquotes, list markers, numbered lists.
    .replaceAll(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)/gmu, "")
    // Horizontal rules on their own line.
    .replaceAll(/^[ \t]*(?:[-*_][ \t]*){3,}$/gmu, " ")
    .replaceAll(/[*_~]+/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
  if (text === "") {
    return null;
  }
  if (text.length <= maxLength) {
    return text;
  }
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  // A boundary too close to the start means one giant word; cut mid-word then.
  const end = lastSpace > maxLength / 2 ? lastSpace : maxLength;
  return `${cut.slice(0, end).trimEnd()}…`;
}
