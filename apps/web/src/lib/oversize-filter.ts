import { WellKnown } from "@openrift/shared";

// There are exactly two physical sizes (standard, oversized), so a single
// tri-state "Oversize" toggle covers every case: require oversized, require
// non-oversized, or no constraint. It maps onto the plain `cardSizes` include
// array (which has no exclude companion) — "not oversized" is expressed as
// "only the non-oversized sizes".

/**
 * Derives the Oversize toggle's tri-state from the `cardSizes` include array:
 * true = oversized only, false = non-oversized only, null = no size constraint.
 * @returns The tri-state, or null when unconstrained / ambiguous.
 */
export function oversizeState(cardSizes: readonly string[]): boolean | null {
  if (cardSizes.length === 1 && cardSizes[0] === WellKnown.cardSize.OVERSIZED) {
    return true;
  }
  if (cardSizes.length > 0 && !cardSizes.includes(WellKnown.cardSize.OVERSIZED)) {
    return false;
  }
  return null;
}

/**
 * The next `cardSizes` value when the Oversize toggle is clicked, cycling
 * null → oversized → non-oversized → null.
 * @returns The cardSizes array to write.
 */
export function nextOversize(cardSizes: readonly string[]): string[] {
  const state = oversizeState(cardSizes);
  if (state === null) {
    return [WellKnown.cardSize.OVERSIZED];
  }
  if (state === true) {
    return [WellKnown.cardSize.STANDARD];
  }
  return [];
}

/**
 * The faceted count to show beside the Oversize toggle, matching the size it
 * currently advertises (the standard count while forbidding oversized, the
 * oversized count otherwise).
 * @returns The count, or undefined when counts aren't loaded.
 */
export function oversizeCount(
  counts: Map<string, number> | undefined,
  state: boolean | null,
): number | undefined {
  return counts?.get(state === false ? WellKnown.cardSize.STANDARD : WellKnown.cardSize.OVERSIZED);
}
