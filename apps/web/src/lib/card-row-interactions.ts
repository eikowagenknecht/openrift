import type { DeckZone } from "@openrift/shared/types/enums";

export interface CardOpenTarget {
  cardId: string;
  preferredPrintingId: string | null;
  zone?: DeckZone;
}

export type HoverHandler = (cardId: string | null, preferredPrintingId?: string | null) => void;

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

export function rowActivateProps(onActivate?: () => void): React.HTMLAttributes<HTMLElement> {
  if (!onActivate) {
    return {};
  }
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event) => {
      // Ignores keydowns bubbled from a nested control (tick, menu) to avoid double-activating the row.
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

export function rowControlClick<E extends React.MouseEvent>(
  onClick?: (event: E) => void,
): (event: E) => void {
  return (event) => {
    event.stopPropagation();
    onClick?.(event);
  };
}
