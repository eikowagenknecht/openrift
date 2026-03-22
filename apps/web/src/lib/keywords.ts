const KEYWORD_COLORS: Record<string, string> = {
  Accelerate: "#24705f",
  Action: "#24705f",
  Ambush: "#24705f",
  Assault: "#cd346f",
  Backline: "#cd346f",
  Buff: "#707070",
  Deathknell: "#95b229",
  Deflect: "#95b229",
  Equip: "#707070",
  Ganking: "#95b229",
  Hidden: "#24705f",
  Hunt: "#95b229",
  Legion: "#24705f",
  Level: "#95b229",
  Mighty: "#707070",
  Predict: "#707070",
  "Quick-Draw": "#24705f",
  Reaction: "#24705f",
  Repeat: "#24705f",
  Shield: "#cd346f",
  Stun: "#707070",
  Tank: "#cd346f",
  Temporary: "#95b229",
  Unique: "#24705f",
  Vision: "#707070",
  Weaponmaster: "#707070",
};

const KEYWORD_DARK_TEXT = new Set([
  "Deathknell",
  "Deflect",
  "Ganking",
  "Hunt",
  "Level",
  "Temporary",
]);

export function getKeywordStyle(keyword: string): { bg: string; dark: boolean } {
  // Strip trailing numbers (e.g. "Shield 2" → "Shield")
  const base = keyword.replace(/\s+\d+$/, "");
  return {
    bg: KEYWORD_COLORS[base] ?? "#6a6a6a",
    dark: KEYWORD_DARK_TEXT.has(base),
  };
}
