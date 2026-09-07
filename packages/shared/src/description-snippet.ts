const DEFAULT_MAX_LENGTH = 140;

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
    .replaceAll(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)/gmu, "")
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
  const end = lastSpace > maxLength / 2 ? lastSpace : maxLength;
  return `${cut.slice(0, end).trimEnd()}…`;
}
