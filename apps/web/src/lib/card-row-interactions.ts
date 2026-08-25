import type { DeckZone } from "@openrift/shared";

/**
 * What opening a card's detail takes: which card, which printing to show, and
 * which zone the click came from, so a card sitting in two zones anchors at the
 * one clicked. Deliberately narrower than `DeckBuilderCard` — a row standing
 * for a loose copy rather than a deck entry can still open the card.
 */
export interface CardOpenTarget {
  cardId: string;
  preferredPrintingId: string | null;
  zone?: DeckZone;
}

/** Reports which card the cursor is on, so a host can float its preview. */
export type HoverHandler = (cardId: string | null, preferredPrintingId?: string | null) => void;

/**
 * Pointer handlers that drive the floating card preview. Passing no handler
 * yields an empty object, so a row spreads the result either way.
 * @returns The enter/leave pair, or nothing.
 */
export function cardHoverProps(
  onHover: HoverHandler | undefined,
  cardId: string,
  preferredPrintingId?: string | null,
): Pick<React.HTMLAttributes<HTMLElement>, "onMouseEnter" | "onMouseLeave"> {
  if (!onHover) {
    return {};
  }
  return {
    onMouseEnter: () => onHover(cardId, preferredPrintingId),
    onMouseLeave: () => onHover(null),
  };
}

/**
 * Button semantics for a card row that opens the card's detail. A row holds its
 * own controls, so it can't be a `<button>` — this gives the div the role, the
 * tab stop, and the Enter/Space activation a button would have brought.
 * @returns The activation props, or nothing when the row isn't clickable.
 */
export function rowActivateProps(onActivate?: () => void): React.HTMLAttributes<HTMLElement> {
  if (!onActivate) {
    return {};
  }
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event) => {
      // Only the row's own keys. A control inside it (the box tick, a menu
      // trigger) is focusable too, and its Space would otherwise both work the
      // control and open the card.
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}

/**
 * Wraps a row control's own click so it doesn't also open the card detail. A
 * row that opens on click still holds controls of its own — a tick, a menu, a
 * link — and none of their clicks mean "open the card".
 * @returns The guarded handler.
 */
export function rowControlClick<E extends React.MouseEvent>(
  onClick?: (event: E) => void,
): (event: E) => void {
  return (event) => {
    event.stopPropagation();
    onClick?.(event);
  };
}
