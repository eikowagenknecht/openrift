import type { Domain } from "./types/enums.js";

export const DOMAIN_COLOR_FALLBACK = "#737373";

export const DEFAULT_DOMAIN_COLORS: Record<string, string> = {
  fury: "#CB212D",
  calm: "#16AA71",
  mind: "#227799",
  body: "#E2710C",
  chaos: "#6B4891",
  order: "#CDA902",
  colorless: "#737373",
} satisfies Record<Domain, string>;
