import { useDndContext } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type HoverOrigin = "sidebar" | "main";

const SIDEBAR_PREVIEW_LEFT_PX = 312; // 19.5rem
const CURSOR_OFFSET_PX = 24;

interface HoveredCardPreviewProps {
  hoveredCard: { thumbnailUrl: string; fullUrl: string; landscape: boolean } | null;
  origin: HoverOrigin;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Floating card preview that follows the cursor while hovering a deck card
 * thumbnail. Sidebar hovers anchor to a fixed x just right of the sidebar;
 * main-area hovers track the cursor and flip to the left side when the
 * preview would overflow the container on the right. Suppressed during DnD
 * (when there's an active drag) so it doesn't sit on top of the drag overlay.
 * @returns The floating preview, or null when there's nothing to show.
 */
export function HoveredCardPreview({ hoveredCard, origin, containerRef }: HoveredCardPreviewProps) {
  const { active } = useDndContext();
  const [fullLoaded, setFullLoaded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef({ x: 0, y: 0 });
  const fullUrl = hoveredCard?.fullUrl ?? null;

  // Reset the crossfade whenever the hovered card changes so the next
  // hover starts from the cached thumbnail and only fades in once the
  // new full-resolution image has finished loading.
  useEffect(() => {
    setFullLoaded(false);
  }, [fullUrl]);

  // Track the cursor imperatively — positioning via state would re-render
  // the entire host on every frame of a hover. Sidebar hovers get a fixed
  // x just right of the sidebar; main-area hovers follow the cursor with
  // a flip to the left side when the preview would overflow the container
  // on the right.
  useEffect(() => {
    if (!hoveredCard || active) {
      return;
    }
    const previewWidth = hoveredCard.landscape ? 560 : 400;
    const applyPosition = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      const preview = previewRef.current;
      if (!container || !preview) {
        return;
      }
      const rect = container.getBoundingClientRect();
      preview.style.top = `${Math.max(0, clientY - rect.top - 96)}px`;
      if (origin === "main") {
        const cursorX = clientX - rect.left;
        const rightEdge = cursorX + CURSOR_OFFSET_PX + previewWidth;
        const leftFlip = cursorX - CURSOR_OFFSET_PX - previewWidth;
        preview.style.left = `${rightEdge <= rect.width ? cursorX + CURSOR_OFFSET_PX : Math.max(0, leftFlip)}px`;
      } else {
        preview.style.left = `${SIDEBAR_PREVIEW_LEFT_PX}px`;
      }
    };

    // Paint once immediately using the last-known cursor so the preview
    // doesn't briefly appear at (0, 0) if the cursor is stationary.
    applyPosition(cursorRef.current.x, cursorRef.current.y);

    const handler = (event: MouseEvent) => {
      cursorRef.current = { x: event.clientX, y: event.clientY };
      applyPosition(event.clientX, event.clientY);
    };
    globalThis.addEventListener("mousemove", handler);
    return () => globalThis.removeEventListener("mousemove", handler);
  }, [hoveredCard, active, containerRef, origin]);

  // Always-on cheap cursor ref update so the first frame of a new hover has
  // a coordinate to use. Writes a ref only — no re-renders.
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      cursorRef.current = { x: event.clientX, y: event.clientY };
    };
    globalThis.addEventListener("mousemove", handler);
    return () => globalThis.removeEventListener("mousemove", handler);
  }, []);

  if (!hoveredCard || active) {
    return null;
  }
  return (
    <div
      ref={previewRef}
      className={cn(
        "pointer-events-none absolute z-50",
        hoveredCard.landscape ? "w-[560px]" : "w-[400px]",
      )}
    >
      <div className="relative">
        <img src={hoveredCard.thumbnailUrl} alt="" className="w-full rounded-lg shadow-lg" />
        <img
          src={hoveredCard.fullUrl}
          alt=""
          onLoad={() => setFullLoaded(true)}
          className={cn(
            "absolute inset-0 w-full rounded-lg shadow-lg transition-opacity duration-150",
            fullLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}
