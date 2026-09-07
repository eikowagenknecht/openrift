import type { PointerEvent } from "react";
import { useState } from "react";

/**
 * iOS Safari synthesizes a hover on the first tap of any hoverable element
 * with no matching leave event, so `onMouseEnter` alone would stick open.
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
