/**
 * Shared between the web board and the API's satori renderer, which draws the
 * same board again for share images — a drift here shows up as a mismatched
 * export. Literal hex, not theme tokens, because satori has no oklch support.
 */
export const TIER_COLORS = [
  "#c4463f",
  "#c9663a",
  "#c08a33",
  "#a89a35",
  "#7f9b45",
  "#4f9560",
  "#3f8f80",
  "#3d8098",
  "#4a6da3",
  "#5f60a0",
  "#77579a",
  "#8a5188",
] as const;

export const TIER_LABEL_INK = "#14161d";

export const TIER_UNRANKED_COLOR = "#8b8f9a";

export function tierColor(index: number): string {
  return TIER_COLORS[index % TIER_COLORS.length] ?? TIER_COLORS[0];
}

export function tierRowColor(index: number, unranked?: boolean): string {
  return unranked === true ? TIER_UNRANKED_COLOR : tierColor(index);
}
