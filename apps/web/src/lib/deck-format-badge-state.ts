import { WellKnown } from "@openrift/shared";

export type DeckFormatBadgeKind = "draft" | "invalid" | "building" | "settled";

export interface DeckFormatBadgeState {
  kind: DeckFormatBadgeKind;
  /** The "48/56" figure, present only while the deck is incomplete. */
  progress?: string;
}

/**
 * Which state the deck's format badge is in, shared by the deck page, the grid
 * tile and the list row so a deck reads the same on all three:
 *
 * - `draft`: an empty deck in a format with rules, which is a start rather than
 *   a failure (an empty Freeform deck has no target, so it settles instead);
 * - `invalid`: the deck breaks its format's rules, carrying the figure when it
 *   is also incomplete;
 * - `building`: incomplete with nothing known to be wrong, which is the state
 *   Freeform and Custom-Region decks land in (the deck-list endpoint reports
 *   them valid without running the detailed checks) and the reason they still
 *   show a card figure;
 * - `settled`: complete, so the badge is just the format.
 *
 * The figure counts the format's required zones and excludes the sideboard, so
 * it is deliberately not the deck's total card count.
 * @returns The badge state and its optional progress figure.
 */
export function deckFormatBadgeState({
  format,
  totalCards,
  requiredProgress,
  requiredTotal,
  isValid,
}: {
  format: string;
  totalCards: number;
  requiredProgress: number;
  requiredTotal: number;
  isValid: boolean;
}): DeckFormatBadgeState {
  const isFreeform = format === WellKnown.deckFormat.FREEFORM;
  const progress =
    requiredTotal > 0 && requiredProgress < requiredTotal
      ? `${requiredProgress}/${requiredTotal}`
      : undefined;

  // An empty deck never shows a figure: "0/56" is noise on a deck nobody has
  // started, and Freeform has no target to be a draft against.
  if (totalCards === 0) {
    return isFreeform ? { kind: "settled" } : { kind: "draft" };
  }
  if (!isValid && !isFreeform) {
    return { kind: "invalid", progress };
  }
  if (progress) {
    return { kind: "building", progress };
  }
  return { kind: "settled" };
}
