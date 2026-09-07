import type { CardType } from "./types/enums.js";
import { WellKnown } from "./well-known.js";

type PlaysetSize = 1 | 3;

/** `keywords` must be the canonical English keyword names from `Card.keywords`. */
export function getPlaysetSize(
  cardTypes: readonly CardType[],
  keywords: readonly string[],
): PlaysetSize {
  if (
    cardTypes.includes(WellKnown.cardType.LEGEND) ||
    cardTypes.includes(WellKnown.cardType.BATTLEFIELD)
  ) {
    return 1;
  }
  if (keywords.includes(WellKnown.keyword.UNIQUE)) {
    return 1;
  }
  return 3;
}
