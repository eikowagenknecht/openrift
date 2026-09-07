import { WellKnown } from "./well-known.js";

export interface SetOrderInfo {
  id: string;
  setType?: "main" | "supplemental";
}

export const UNKNOWN_SET_INDEX = Number.MAX_SAFE_INTEGER;

// The app's one definition of set order: grid headers, filters, and SSR
// previews all rely on it staying consistent with each other.
export function orderSetsMainFirst<SetLike extends { setType?: string }>(
  sets: readonly SetLike[],
): SetLike[] {
  return sets.toSorted((a, b) =>
    a.setType === b.setType ? 0 : a.setType === WellKnown.setType.MAIN ? -1 : 1,
  );
}

export function setIndexById(sets: readonly SetOrderInfo[]): Map<string, number> {
  return new Map(orderSetsMainFirst(sets).map((set, index) => [set.id, index]));
}
