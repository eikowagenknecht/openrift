import type { ReactNode, RefObject } from "react";

import { SCAN_TRAY_PEEK, ScanTrayShell } from "@/components/scan/scan-tray-shell";
import type { ScanLayout } from "@/hooks/use-scan-layout";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const LANDSCAPE_PANEL_INSET = "right-72";

const BOXED_GRID =
  "flex flex-col gap-3 md:grid md:h-[calc(100dvh-var(--header-height)-7.25rem)] md:min-h-112 md:grid-cols-[minmax(0,1fr)_28rem] md:grid-rows-[auto_minmax(0,1fr)] md:gap-4";

interface ScanStageProps {
  layout: ScanLayout;
  immersive: boolean;
  fullscreen: boolean;
  viewfinder: ReactNode;
  chrome: ReactNode;
  controls: ReactNode;
  notices: ReactNode;
  tray: ReactNode;
  trayAnchorRef: RefObject<HTMLDivElement | null>;
}

/**
 * The element tree is the same across all three layouts; the `<video>`
 * carries a live `srcObject`, and moving it between trees would unmount it
 * and drop the camera.
 */
export function ScanStage({
  layout,
  immersive,
  fullscreen,
  viewfinder,
  chrome,
  controls,
  notices,
  tray,
  trayAnchorRef,
}: ScanStageProps) {
  const landscape = immersive && layout === "landscape";

  return (
    <div className={cn(immersive ? "contents" : cn(PAGE_WIDTH.capped, "px-safe px-4 pt-3 pb-12"))}>
      <div className={cn(immersive ? "contents" : BOXED_GRID)}>
        <div className="empty:hidden md:col-span-2 md:row-start-1">
          {immersive ? null : notices}
        </div>

        <div
          className={cn(
            "bg-muted relative overflow-hidden",
            immersive
              ? // Below the tray's z-50; the app header is hidden separately
                // via the `data-scan-immersive` rules in index.css.
                cn(
                  "fixed bottom-0 left-0 z-40",
                  fullscreen ? "top-0" : "top-(--header-height)",
                  landscape ? LANDSCAPE_PANEL_INSET : "right-0",
                )
              : "aspect-3/4 rounded-lg sm:aspect-video md:col-start-1 md:row-start-2 md:aspect-auto md:h-full",
          )}
        >
          {viewfinder}

          {immersive && (
            <div
              className={cn(
                "px-safe absolute inset-x-0 top-0 z-10 flex items-start gap-2 pb-3",
                fullscreen ? "pt-safe" : "pt-3",
              )}
            >
              {chrome}
            </div>
          )}

          {landscape && (
            <div className="pl-safe absolute top-1/2 left-0 z-10 flex max-w-36 -translate-y-1/2 flex-col items-start gap-2">
              {controls}
            </div>
          )}

          <div
            className={cn(
              "absolute z-10 flex flex-col items-center gap-2",
              landscape && "px-safe inset-x-0 bottom-2 [&>*]:max-w-md",
              !landscape && immersive && "inset-x-0 px-3",
              !immersive && "inset-x-0 bottom-4 px-3",
            )}
            style={
              !landscape && immersive ? { bottom: `calc(${SCAN_TRAY_PEEK} + 0.75rem)` } : undefined
            }
          >
            <div className="w-full empty:hidden">{immersive ? notices : null}</div>
            {!landscape && <div className="flex flex-col items-center gap-2">{controls}</div>}
          </div>
        </div>

        {/* Must stay the last child: only later siblings may change shape
            without disturbing the viewfinder's position above it. */}
        <ScanTrayShell
          layout={immersive ? layout : "boxed"}
          fullscreen={fullscreen}
          anchorRef={trayAnchorRef}
        >
          {tray}
        </ScanTrayShell>
      </div>
    </div>
  );
}
