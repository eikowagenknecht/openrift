import { WellKnown } from "@openrift/shared/well-known";

export function oversizeState(cardSizes: readonly string[]): boolean | null {
  if (cardSizes.length === 1 && cardSizes[0] === WellKnown.cardSize.OVERSIZED) {
    return true;
  }
  if (cardSizes.length > 0 && !cardSizes.includes(WellKnown.cardSize.OVERSIZED)) {
    return false;
  }
  return null;
}

/** Cycles null → oversized → non-oversized → null. */
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

export function oversizeCount(
  counts: Map<string, number> | undefined,
  state: boolean | null,
): number | undefined {
  return counts?.get(state === false ? WellKnown.cardSize.STANDARD : WellKnown.cardSize.OVERSIZED);
}
