export const KEYWORD_LOOKUP = new Map(
  [
    "Accelerate",
    "Action",
    "Add",
    "Assault",
    "Deathknell",
    "Deflect",
    "Equip",
    "Ganking",
    "Hidden",
    "Legion",
    "Mighty",
    "Quick-Draw",
    "Reaction",
    "Repeat",
    "Shield",
    "Tank",
    "Temporary",
    "Unique",
    "Vision",
    "Weaponmaster",
  ].map((k) => [k.toLowerCase(), k]),
);

/**
 * Extracts unique keywords from rules/effect text by matching bracketed terms
 * against the known keyword list. Returns canonical Title Case keywords.
 * @returns Array of unique canonical keywords found in the text.
 */
export function extractKeywords(text: string): string[] {
  if (!text) {
    return [];
  }
  const found = new Set<string>();
  const re = /\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const parts = match[1].trim().split(/\s+/);
    const canonical = KEYWORD_LOOKUP.get(parts[0].toLowerCase());
    if (canonical) {
      const rest = parts.slice(1).join(" ");
      found.add(rest ? `${canonical} ${rest}` : canonical);
    }
  }
  return [...found];
}
