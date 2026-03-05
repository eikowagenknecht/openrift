const KEYWORD_COLORS: Record<string, string> = {
  Accelerate: "#24705f",
  Action: "#24705f",
  Assault: "#cd346f",
  Deathknell: "#95b229",
  Deflect: "#95b229",
  Equip: "#707070",
  Ganking: "#95b229",
  Hidden: "#24705f",
  Legion: "#24705f",
  Mighty: "#707070",
  "Quick-Draw": "#24705f",
  Reaction: "#24705f",
  Repeat: "#24705f",
  Shield: "#cd346f",
  Tank: "#cd346f",
  Temporary: "#95b229",
  Unique: "#24705f",
  Vision: "#707070",
  Weaponmaster: "#707070",
};

const KEYWORD_DARK_TEXT = new Set(["Deathknell", "Deflect", "Ganking", "Temporary"]);

export function getKeywordStyle(keyword: string): { bg: string; dark: boolean } {
  // Strip trailing numbers (e.g. "Shield 2" → "Shield")
  const base = keyword.replace(/\s+\d+$/, "");
  return {
    bg: KEYWORD_COLORS[base] ?? "#6a6a6a",
    dark: KEYWORD_DARK_TEXT.has(base),
  };
}
