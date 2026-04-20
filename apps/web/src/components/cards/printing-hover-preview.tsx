import type { Printing } from "@openrift/shared";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const CURSOR_OFFSET_PX = 24;

/**
 * Cursor-following large preview of a printing. Rendered via portal to body so
 * it can float above the host menu/popover without being clipped.
 * @returns The portal'd preview element, or null when no front image exists.
 */
export function PrintingHoverPreview({ printing }: { printing: Printing }) {
  const front = printing.images.find((image) => image.face === "front");
  const thumbnail = front?.thumbnail ?? null;
  const fullUrl = front?.full ?? null;
  const landscape = printing.card.type === "Battlefield";
  const [fullLoaded, setFullLoaded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setFullLoaded(false);
  }, [fullUrl]);

  useEffect(() => {
    const previewWidth = landscape ? 560 : 400;
    const previewHeight = landscape ? 400 : 560;

    const applyPosition = (clientX: number, clientY: number) => {
      const preview = previewRef.current;
      if (!preview) {
        return;
      }
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const right = clientX + CURSOR_OFFSET_PX + previewWidth;
      const left =
        right <= viewportWidth
          ? clientX + CURSOR_OFFSET_PX
          : clientX - CURSOR_OFFSET_PX - previewWidth;
      const top = Math.min(
        Math.max(0, clientY - previewHeight / 2),
        Math.max(0, viewportHeight - previewHeight),
      );
      preview.style.left = `${Math.max(0, left)}px`;
      preview.style.top = `${top}px`;
    };

    applyPosition(cursorRef.current.x, cursorRef.current.y);

    const handler = (event: globalThis.MouseEvent) => {
      cursorRef.current = { x: event.clientX, y: event.clientY };
      applyPosition(event.clientX, event.clientY);
    };
    globalThis.addEventListener("mousemove", handler);
    return () => globalThis.removeEventListener("mousemove", handler);
  }, [landscape]);

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
