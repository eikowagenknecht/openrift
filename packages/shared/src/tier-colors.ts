/**
 * Row colours for tier-list boards, by board position, warm-to-cool, so the
 * ladder reads as a ranking even when a creator renames the rows to something
 * other than S/A/B/C/D.
 *
 * Shared between the web board and the API's satori share-image renderer: the
 * same board is drawn twice, and a drift between the two shows up as a share
 * image that doesn't match what the creator recorded. Deliberately literal hex
 * rather than theme tokens — this is a fixed ranking ramp, not app chrome, it
 * has to survive both themes unchanged, and satori has no oklch anyway.
 *
 * Twelve entries, matching the contract's `MAX_TIER_ROWS`, so a position
 * always has a colour without wrapping in practice.
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

/** Ink used on a tier chip. Dark on every ramp colour, in both themes. */
export const TIER_LABEL_INK = "#14161d";

/**
 * The unranked row's colour: off the ramp entirely, so "these did not make the
 * cut" never reads as a rank of its own. Grey rather than a darker red — the
 * bottom of the ramp is already the worst tier, and a second red row would
 * compete with it.
 */
export const TIER_UNRANKED_COLOR = "#8b8f9a";

/** @returns The colour for a row at `index`, wrapping past the palette's end. */
export function tierColor(index: number): string {
  return TIER_COLORS[index % TIER_COLORS.length] ?? TIER_COLORS[0];
}

/**
 * The colour a board row is drawn in.
 *
 * The unranked row is deliberately not part of the ramp, so it keeps its grey
 * wherever it sits and the ranked rows above it keep the colours they would
 * have had without it.
 *
 * @returns The row's chip colour.
 */
export function tierRowColor(index: number, unranked?: boolean): string {
  return unranked === true ? TIER_UNRANKED_COLOR : tierColor(index);
}
