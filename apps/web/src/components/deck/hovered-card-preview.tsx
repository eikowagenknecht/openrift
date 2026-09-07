import { useDndContext } from "@dnd-kit/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CARD_ASPECT_INVERSE, CARD_BORDER_RADIUS } from "@/components/cards/card-grid-constants";
import { cn } from "@/lib/utils";

/**
 * "main" and "main-right" are synonyms (both dock opposite the cursor); kept
 * separate so callers' origin derivation doesn't need to change.
 */
export type HoverOrigin = "sidebar" | "main" | "main-right";

export type DockSide = "left" | "right";

const SIDEBAR_PREVIEW_LEFT_PX = 312;
const CURSOR_OFFSET_PX = 24;
const VIEWPORT_MARGIN_PX = 8;
/** Past this many px from the midline, the dock switches sides, so a cursor near center doesn't flap it. */
const DOCK_DEADBAND_PX = 48;
const SIDEBAR_VIEWPORT_SELECTOR = '[data-slot="sidebar-content"]';

export function pickDockSide(
  cursorX: number,
  previous: DockSide | null,
  viewportWidth: number,
): DockSide {
  const middle = viewportWidth / 2;
  if (previous === null) {
    return cursorX < middle ? "right" : "left";
  }
  if (cursorX < middle - DOCK_DEADBAND_PX) {
    return "right";
  }
  if (cursorX > middle + DOCK_DEADBAND_PX) {
    return "left";
  }
  return previous;
}

interface HoveredCardPreviewProps {
  hoveredCard: { thumbnailUrl: string; fullUrl: string; landscape: boolean } | null;
  origin: HoverOrigin;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function HoveredCardPreview({ hoveredCard, origin, containerRef }: HoveredCardPreviewProps) {
  const { active } = useDndContext();
  const [fullLoaded, setFullLoaded] = useState(false);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef({ x: 0, y: 0 });
  const dockSideRef = useRef<DockSide | null>(null);

  // 150ms linger avoids a flicker when the cursor crosses a grid gap between
  // thumbs; the origin lingers with the card since hosts reset it on clear.
  const [linger, setLinger] = useState<{
    card: NonNullable<HoveredCardPreviewProps["hoveredCard"]>;
    origin: HoverOrigin;
  } | null>(null);
  if (hoveredCard && (linger?.card !== hoveredCard || linger.origin !== origin)) {
    setLinger({ card: hoveredCard, origin });
  }
  useEffect(() => {
    if (hoveredCard || !linger) {
      return;
    }
    const timer = setTimeout(() => setLinger(null), 150);
    return () => clearTimeout(timer);
  }, [hoveredCard, linger]);
  const shownCard = hoveredCard ?? linger?.card ?? null;
  const shownOrigin = hoveredCard ? origin : (linger?.origin ?? origin);

  const fullUrl = shownCard?.fullUrl ?? null;

  const [loadedUrl, setLoadedUrl] = useState(fullUrl);
  if (fullUrl !== loadedUrl) {
    setLoadedUrl(fullUrl);
    setFullLoaded(false);
  }

  // Positioned imperatively (not via state) to avoid re-rendering the host
  // every frame; a plain effect would paint one frame at (0,0) before the
  // position style lands, so this runs as a layout effect instead.
  useLayoutEffect(() => {
    if (!shownCard || active) {
      return;
    }
    const previewWidth = shownCard.landscape ? 560 : 400;
    const applyPosition = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      const preview = previewRef.current;
      if (!container || !preview) {
        return;
      }
      const rect = container.getBoundingClientRect();
      // Falls back to an estimate (CARD_ASPECT_INVERSE = height/width) before
      // the image has laid out, so the clamp below is right on first paint.
      const previewHeight =
        preview.offsetHeight ||
        (shownCard.landscape
          ? previewWidth / CARD_ASPECT_INVERSE
          : previewWidth * CARD_ASPECT_INVERSE);

      const clampAxis = (desired: number, offset: number, viewport: number, size: number) => {
        const min = VIEWPORT_MARGIN_PX - offset;
        const max = viewport - size - VIEWPORT_MARGIN_PX - offset;
        return Math.max(min, Math.min(desired, max));
      };

      const isSidebar = shownOrigin === "sidebar";
      const desiredTop = isSidebar
        ? clientY - rect.top - 96
        : (globalThis.innerHeight - previewHeight) / 2 - rect.top;
      preview.style.top = `${clampAxis(desiredTop, rect.top, globalThis.innerHeight, previewHeight)}px`;

      let desiredLeft: number;
      if (isSidebar) {
        desiredLeft = SIDEBAR_PREVIEW_LEFT_PX;
      } else {
        const side = pickDockSide(clientX, dockSideRef.current, globalThis.innerWidth);
        dockSideRef.current = side;
        if (side === "right") {
          desiredLeft = rect.width - previewWidth - VIEWPORT_MARGIN_PX;
        } else {
          const sidebar = container.querySelector<HTMLElement>(SIDEBAR_VIEWPORT_SELECTOR);
          desiredLeft = sidebar
            ? sidebar.getBoundingClientRect().right - rect.left + CURSOR_OFFSET_PX
            : 0;
        }
      }
      preview.style.left = `${clampAxis(desiredLeft, rect.left, globalThis.innerWidth, previewWidth)}px`;
    };

    applyPosition(cursorRef.current.x, cursorRef.current.y);

    if (shownOrigin !== "sidebar") {
      return;
    }
    const handler = (event: MouseEvent) => {
      cursorRef.current = { x: event.clientX, y: event.clientY };
      applyPosition(event.clientX, event.clientY);
    };
    globalThis.addEventListener("mousemove", handler);
    return () => globalThis.removeEventListener("mousemove", handler);
  }, [shownCard, active, containerRef, shownOrigin]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      cursorRef.current = { x: event.clientX, y: event.clientY };
    };
    globalThis.addEventListener("mousemove", handler);
    return () => globalThis.removeEventListener("mousemove", handler);
  }, []);

  if (!shownCard || active || shownCard.thumbnailUrl === failedUrl) {
    return null;
  }
  return (
    <div
      ref={previewRef}
      className={cn(
        "pointer-events-none absolute z-50",
        shownCard.landscape ? "w-[560px]" : "w-[400px]",
      )}
    >
      <div className="relative">
        <img
          src={shownCard.thumbnailUrl}
          alt=""
          style={{ borderRadius: CARD_BORDER_RADIUS }}
          className="w-full shadow-lg"
          onError={() => setFailedUrl(shownCard.thumbnailUrl)}
        />
        <img
          src={shownCard.fullUrl}
          alt=""
          onLoad={() => setFullLoaded(true)}
          style={{ borderRadius: CARD_BORDER_RADIUS }}
          className={cn(
            "absolute inset-0 w-full shadow-lg transition-opacity duration-150",
            fullLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}
