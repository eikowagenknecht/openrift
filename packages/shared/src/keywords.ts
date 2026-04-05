/**
 * Extracts unique keywords from rules/effect text by finding bracketed terms
 * like `[Shield]` or `[Equip :rb_rune_mind:]`. Strips resource glyphs and
 * numeric parameters, returning only the base keyword name.
 *
 * Only use on English text — non-EN printings may use brackets differently.
 * @returns Array of unique keyword names found in the text.
 */
export function extractKeywords(text: string): string[] {
  if (!text) {
    return [];
  }
  const found = new Set<string>();
  const re = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const stripped = match[1].replaceAll(/:rb_\w+:/g, "").trim();
    const parts = stripped.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    // Take only the first word as the keyword name (drop numeric params like "2" in "Shield 2")
    const keyword = parts[0];
    // Skip pure numbers, short tokens, and symbol-only content like ">>"
    if (/^\d+$/.test(keyword) || keyword.length < 2 || !/[a-zA-Z]/.test(keyword)) {
      continue;
    }
    found.add(keyword);
  }
  return [...found];
}
