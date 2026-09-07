/** Intentionally regex-based: product descriptions are short, admin-written markdown, not arbitrary documents. */
export function markdownTeaser(markdown: string | null): string {
  if (!markdown) {
    return "";
  }
  const [firstBlock = ""] = markdown.trim().split(/\n\s*\n/u, 1);
  return firstBlock
    .split("\n")
    .map((line) => line.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/u, "").trim())
    .join(" ")
    .replaceAll(/!\[(?<alt>[^\]]*)\]\([^)]*\)/gu, "$<alt>")
    .replaceAll(/\[(?<text>[^\]]+)\]\([^)]*\)/gu, "$<text>")
    .replaceAll(/(?<mark>\*\*|__)(?<text>.+?)\k<mark>/gu, "$<text>")
    .replaceAll(/(?<mark>[*_`])(?<text>.+?)\k<mark>/gu, "$<text>")
    .trim();
}
