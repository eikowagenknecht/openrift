import { useDndContext } from "@dnd-kit/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CARD_ASPECT_INVERSE } from "@/components/cards/card-grid-constants";
import { cn } from "@/lib/utils";

/**
 * Where a hover came from. "main" and "main-right" are synonyms today — both
 * dock to the viewport half the cursor isn't in — but both values are kept so
 * the hosts' origin derivation doesn't have to change; collapsing them is a
 * follow-up in `deck-editor-page.tsx` and the share route.
 */
export type HoverOrigin = "sidebar" | "main" | "main-right";

/** Which half of the viewport the preview docks in. */
export type DockSide = "left" | "right";

const SIDEBAR_PREVIEW_LEFT_PX = 312; // 19.5rem
const CURSOR_OFFSET_PX = 24;
const VIEWPORT_MARGIN_PX = 8;
/**
 * How far past the midline the cursor must be before the dock switches sides.
 * Without it, a cursor drifting along the middle of the screen would flap the
 * preview left/right between hovers.
 */
const DOCK_DEADBAND_PX = 48;
/** The zone sidebar's scroll viewport — a left dock has to clear it. */
const SIDEBAR_VIEWPORT_SELECTOR = '[data-slot="sidebar-content"]';

/**
 * Picks the half of the viewport to dock the preview in: the side the cursor is
 * *not* on, so the card never covers what's being pointed at. The previous side
 * wins inside the deadband, so a cursor hovering near the midline doesn't make
 * the preview jump from hover to hover.
 * @returns The side to dock on.
 */
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

/**
 * Card preview shown while hovering a deck card. Main-area hovers dock it
 * against the viewport half the cursor is not in, vertically centered and
 * placed once per hover, so the card never covers what's being pointed at and
 * never chases the cursor across the page. Sidebar hovers keep their own
 * anchor just right of the sidebar, riding the cursor vertically. Suppressed
 * during DnD (when there's an active drag) so it doesn't sit on top of the
 * drag overlay.
 * @returns The floating preview, or null when there's nothing to show.
 */
export function HoveredCardPreview({ hoveredCard, origin, containerRef }: HoveredCardPreviewProps) {
  const { active } = useDndContext();
  const [fullLoaded, setFullLoaded] = useState(false);
  // A failed thumbnail hides the preview entirely — the same behavior as a
  // card with no image (the host passes hoveredCard: null for those). Keyed
  // by URL so another card's hover retries fresh.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef({ x: 0, y: 0 });
  // Survives across hovers: the deadband compares against the side the last
  // hover picked, not against a fresh guess.
  const dockSideRef = useRef<DockSide | null>(null);

  // Bridge the few px of gap between adjacent thumbs: when the hover clears,
  // keep the last card up briefly instead of unmounting instantly — moving
  // the cursor across a grid gap would otherwise flicker the preview off and
  // back on. A new hover replaces the lingering card immediately. The origin
  // lingers with the card: hosts derive the origin prop from the hover state,
  // so it falls back to a default the moment the hover clears, and using that
  // default would reposition the preview mid-linger.
  const [linger, setLinger] = useState<{
    card: NonNullable<HoveredCardPreviewProps["hoveredCard"]>;
    origin: HoverOrigin;
  } | null>(null);
  useEffect(() => {
    if (hoveredCard) {
      // Guard against re-setting an identical value — a fresh object every
      // run would retrigger this effect forever.
      if (linger?.card !== hoveredCard || linger.origin !== origin) {
        setLinger({ card: hoveredCard, origin });
      }
      return;
    }
    if (!linger) {
      return;
    }
    const timer = setTimeout(() => setLinger(null), 150);
    return () => clearTimeout(timer);
  }, [hoveredCard, origin, linger]);
  const shownCard = hoveredCard ?? linger?.card ?? null;
  const shownOrigin = hoveredCard ? origin : (linger?.origin ?? origin);

  const fullUrl = shownCard?.fullUrl ?? null;

  // Reset the crossfade whenever the hovered card changes so the next
  // hover starts from the cached thumbnail and only fades in once the
  // new full-resolution image has finished loading.
  useEffect(() => {
    setFullLoaded(false);
  }, [fullUrl]);

  // Position imperatively — doing it via state would re-render the entire
  // host on every frame of a sidebar hover. Main hovers are placed once, at
  // hover start, from the last-known cursor; sidebar hovers keep following it.
  //
  // Runs as a layout effect so the first paint of a new hover already has
  // top/left applied — with a plain useEffect the browser paints one frame
  // at the container's (0, 0) before the positioning style is written, which
  // shows up as a flash in the top-left corner for stationary cursors.
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
      // Measured height once the image has a size; estimate from the width on
      // the first frame (CARD_ASPECT_INVERSE is height ÷ width for a portrait
      // card) so the bottom clamp is right even before layout.
      const previewHeight =
        preview.offsetHeight ||
        (shownCard.landscape
          ? previewWidth / CARD_ASPECT_INVERSE
          : previewWidth * CARD_ASPECT_INVERSE);

      // `top`/`left` are container-relative (the preview is absolutely
      // positioned in the container), so a viewport coordinate `v` maps to
      // `v - rect.top` / `v - rect.left`. Clamp both axes to the viewport
      // (minus a small margin) so the whole card stays on screen — when the
      // preview is larger than the viewport, pin it to the top/left margin.
      const clampAxis = (desired: number, offset: number, viewport: number, size: number) => {
        const min = VIEWPORT_MARGIN_PX - offset;
        const max = viewport - size - VIEWPORT_MARGIN_PX - offset;
        return Math.max(min, Math.min(desired, max));
      };

      // Sidebar hovers keep their original behavior: anchored just right of the
      // sidebar, riding the cursor vertically. Main hovers are a stationary
      // dock, vertically centered in the viewport.
      const isSidebar = shownOrigin === "sidebar";
      const desiredTop = isSidebar
        ? clientY - rect.top - 96
        : (globalThis.innerHeight - previewHeight) / 2 - rect.top;
      preview.style.top = `${clampAxis(desiredTop, rect.top, globalThis.innerHeight, previewHeight)}px`;

      let desiredLeft: number;
      if (isSidebar) {
        desiredLeft = SIDEBAR_PREVIEW_LEFT_PX;
      } else {
        // Dock in the half the cursor isn't in, decided once per hover so the
        // panel stays put while the cursor moves along the cards.
        const side = pickDockSide(clientX, dockSideRef.current, globalThis.innerWidth);
        dockSideRef.current = side;
        if (side === "right") {
          desiredLeft = rect.width - previewWidth - VIEWPORT_MARGIN_PX;
        } else {
          // A left dock has to clear the zone sidebar where there is one (the
          // editor); measured rather than assumed, so a collapsed sidebar gives
          // the space back and the share page — which has none — docks flush to
          // the container's left edge.
          const sidebar = container.querySelector<HTMLElement>(SIDEBAR_VIEWPORT_SELECTOR);
          desiredLeft = sidebar
            ? sidebar.getBoundingClientRect().right - rect.left + CURSOR_OFFSET_PX
            : 0;
        }
      }
      preview.style.left = `${clampAxis(desiredLeft, rect.left, globalThis.innerWidth, previewWidth)}px`;
    };

    // Paint once immediately using the last-known cursor so the preview
    // doesn't briefly appear at (0, 0) if the cursor is stationary.
    applyPosition(cursorRef.current.x, cursorRef.current.y);

    // The main dock is placed once per hover and stays put. Only sidebar
    // hovers keep following the cursor.
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

  // Always-on cheap cursor ref update so the first frame of a new hover has
  // a coordinate to use. Writes a ref only — no re-renders.
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
          className="w-full rounded-lg shadow-lg"
          onError={() => setFailedUrl(shownCard.thumbnailUrl)}
        />
        <img
          src={shownCard.fullUrl}
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
