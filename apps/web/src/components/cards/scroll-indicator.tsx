import type { Virtualizer } from "@tanstack/react-virtual";

import { IS_COARSE_POINTER } from "@/lib/pointer";
import { cn } from "@/lib/utils";

import type { VRow } from "./card-grid-types";
import { useScrollIndicator } from "./use-scroll-indicator";

interface ScrollIndicatorProps {
  virtualRows: VRow[];
  rowStarts: number[];
  virtualizer: Virtualizer<Window, Element>;
  scrollMargin: number;
  multipleGroups: boolean;
  stickyOffset: number;
}

export function ScrollIndicator({
  virtualRows,
  rowStarts,
  virtualizer,
  scrollMargin,
  multipleGroups,
  stickyOffset,
}: ScrollIndicatorProps) {
  const {
    indicator,
    indicatorRef,
    cardIdRef,
    badgeRef,
    isDraggingRef,
    handleIndicatorPointerDown,
    snapPointElsRef,
    handleMoveRef,
    handleUpRef,
    handleMouseEnter,
    handleMouseLeave,
    snapPoints,
  } = useScrollIndicator({
    virtualRows,
    rowStarts,
    virtualizer,
    scrollMargin,
    multipleGroups,
    stickyOffset,
  });

  return (
    <>
      {/* Scroll position indicator — appears while scrolling, fades out after idle.
          Draggable: grab to scrub through the page; snaps to set headers on release. */}
      <div
        ref={indicatorRef}
        className={cn(
          "fixed z-30 transition-opacity duration-300",
          indicator.visible ? "pointer-events-auto" : "pointer-events-none",
          IS_COARSE_POINTER && "-m-2 p-2",
        )}
        style={{
          right: 20,
          top: 0,
          // During drag, the pointer-move handler sets transform directly on
          // indicatorRef to avoid React re-renders per mousemove. The render
          // value here only matters at drag-start/end — both moments sync
          // indicator.indicatorTop with the ref (see use-scroll-indicator).
          transform: `translateY(calc(${indicator.indicatorTop}px - 50%))`,
          willChange: "transform",
          opacity: indicator.visible ? 1 : 0,
          touchAction: "none",
        }}
        onPointerDown={handleIndicatorPointerDown}
        onPointerMove={(e) => {
          if (isDraggingRef.current) {
            handleMoveRef.current(e.clientY);
          }
        }}
        onPointerUp={() => {
          if (isDraggingRef.current) {
            handleUpRef.current();
          }
        }}
        onPointerCancel={() => {
          if (isDraggingRef.current) {
            handleUpRef.current();
          }
        }}
        onLostPointerCapture={() => {
          if (isDraggingRef.current) {
            handleUpRef.current();
          }
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className={cn(
            "flex origin-right items-center gap-1.5 transition-transform duration-200 ease-out",
            indicator.dragging ? "scale-110" : "scale-100",
          )}
        >
          <div
            ref={badgeRef}
            className={cn(
              "bg-popover/90 text-popover-foreground inline-flex items-center rounded-md font-mono font-medium whitespace-nowrap shadow-md ring-1 backdrop-blur-sm select-none",
              IS_COARSE_POINTER ? "px-5 py-2 text-base" : "px-5 py-2 text-sm",
              indicator.dragging
                ? "ring-primary/60 cursor-grabbing"
                : "ring-primary/40 cursor-grab",
            )}
          >
            <span ref={cardIdRef}>{indicator.cardId || "\u00A0"}</span>
          </div>
          <div className="bg-primary/70 size-2 shrink-0 rounded-full" />
        </div>
      </div>

      {/* Ghost badges — set-section marks, visible only while dragging */}
      {indicator.dragging &&
        multipleGroups &&
        snapPoints.map((pt) => (
          <div
            key={pt.rowIndex}
            ref={(el) => {
              if (el) {
                snapPointElsRef.current.set(pt.rowIndex, el);
              } else {
                snapPointElsRef.current.delete(pt.rowIndex);
              }
            }}
            className={cn(
              "pointer-events-none fixed z-29 transition-opacity duration-300",
              IS_COARSE_POINTER && "-m-2 p-2",
            )}
            style={{
              right: 20,
              top: pt.screenY,
              transform: "translateY(-50%)",
              opacity: indicator.dragging ? 1 : 0,
            }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "bg-popover/80 text-popover-foreground/70 ring-border/50 rounded-md font-mono font-medium whitespace-nowrap ring-1 backdrop-blur-sm select-none",
                  IS_COARSE_POINTER ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs",
                )}
              >
                {pt.group.name}
              </div>
              <div className="bg-muted-foreground/60 size-1.5 shrink-0 rounded-full" />
            </div>
          </div>
        ))}
    </>
  );
}
