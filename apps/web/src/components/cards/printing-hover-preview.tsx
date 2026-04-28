import type { Printing } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const GAP_PX = 12;

/**
 * Large preview of a printing, anchored beside the given element (the
 * dropdown/menu popup) so it doesn't overlap it. Picks whichever horizontal
 * side has the most room and centers vertically on the anchor, clamped to the
 * viewport. Rendered via portal to body so it can float above the host popup
 * without being clipped.
 * @returns The portal'd preview element, or null when no front image exists.
 */
export function PrintingHoverPreview({
  printing,
  anchorRef,
}: {
  printing: Printing;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const front = printing.images.find((image) => image.face === "front");
  const thumbnail = front ? imageUrl(front.imageId, "400w") : null;
  const fullUrl = front ? imageUrl(front.imageId, "full") : null;
  const landscape = printing.card.type === "Battlefield";
  const [fullLoaded, setFullLoaded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFullLoaded(false);
  }, [fullUrl]);

  useEffect(() => {
    const previewWidth = landscape ? 560 : 400;
    const previewHeight = landscape ? 400 : 560;

    const applyPosition = () => {
      const preview = previewRef.current;
      const anchor = anchorRef.current;
      if (!preview || !anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const spaceRight = viewportWidth - rect.right;
      const spaceLeft = rect.left;
      const placeRight = spaceRight >= previewWidth + GAP_PX || spaceRight >= spaceLeft;
      const rawLeft = placeRight ? rect.right + GAP_PX : rect.left - GAP_PX - previewWidth;
      const left = Math.max(GAP_PX, Math.min(rawLeft, viewportWidth - previewWidth - GAP_PX));
      const top = Math.min(
        Math.max(GAP_PX, rect.top + rect.height / 2 - previewHeight / 2),
        Math.max(GAP_PX, viewportHeight - previewHeight - GAP_PX),
      );
      preview.style.left = `${left}px`;
      preview.style.top = `${top}px`;
    };

    applyPosition();
    globalThis.addEventListener("scroll", applyPosition, true);
    globalThis.addEventListener("resize", applyPosition);
    return () => {
      globalThis.removeEventListener("scroll", applyPosition, true);
      globalThis.removeEventListener("resize", applyPosition);
    };
  }, [anchorRef, landscape]);

  if (!thumbnail) {
    return null;
  }

  return createPortal(
    <div
      ref={previewRef}
      className={cn("pointer-events-none fixed z-[100]", landscape ? "w-[560px]" : "w-[400px]")}
    >
      <div className="relative">
        <img src={thumbnail} alt="" className="w-full rounded-lg shadow-lg" />
        {fullUrl && (
          <img
            src={fullUrl}
            alt=""
            onLoad={() => setFullLoaded(true)}
            className={cn(
              "absolute inset-0 w-full rounded-lg shadow-lg transition-opacity duration-150",
              fullLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
