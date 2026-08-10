import type { PointerEvent } from "react";
import { useState } from "react";

/**
 * Hover state for an element that reveals something extra on hover (a card
 * preview, a peek panel) and must stay inert under touch.
 *
 * `onMouseEnter` is the wrong signal for that: iOS Safari synthesizes a hover
 * on the first tap of any element with hover styling, so a mouse-only affordance
 * pops open on tap with no matching leave event to close it. Pointer events
 * carry the input type, so the guard is exact and hybrid devices keep their
 * mouse hover.
 *
 * Spread `hoverProps` onto the element whose hover you're tracking.
 *
 * @returns The live hover state and the pointer handlers that drive it.
 */
export function useMouseHover(): {
  hovering: boolean;
  hoverProps: {
    onPointerEnter: (event: PointerEvent) => void;
    onPointerLeave: (event: PointerEvent) => void;
  };
} {
  const [hovering, setHovering] = useState(false);

  return {
    hovering,
    hoverProps: {
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType === "mouse") {
          setHovering(true);
        }
      },
      onPointerLeave: (event: PointerEvent) => {
        if (event.pointerType === "mouse") {
          setHovering(false);
        }
      },
    },
  };
}
