/**
 * Row colours by board position, warm-to-cool, so the ladder reads as a ranking
 * even when a creator renames the rows to something other than S/A/B/C/D.
 *
 * Deliberately literal hex rather than theme tokens: this is a fixed ranking
 * ramp, not app chrome, and it has to survive both themes unchanged so a board
 * screen-captured in light mode matches the exported image. **Keep in sync with
 * `TIER_COLORS` in `apps/api/src/services/tier-list-image.ts`** — the same board
 * is drawn twice, once here and once by satori, and a drift between them shows
 * up as a share image that doesn't match what the creator recorded.
 *
 * Twelve entries, matching the contract's `MAX_TIER_ROWS`, so a position always
 * has a colour without wrapping in practice.
 */
const TIER_COLORS = [
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

/** Ink used on a tier chip. Dark on every ramp colour, in both themes. */
export const TIER_LABEL_INK = "#14161d";

/** @returns The colour for a row at `index`, wrapping past the palette's end. */
export function tierColor(index: number): string {
  return TIER_COLORS[index % TIER_COLORS.length] ?? TIER_COLORS[0];
}
