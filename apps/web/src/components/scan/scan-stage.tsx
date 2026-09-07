import type { ReactNode, RefObject } from "react";

import { ScanTrayShell } from "@/components/scan/scan-tray-shell";
import type { ScanLayout } from "@/hooks/use-scan-layout";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const PORTRAIT_BOTTOM_STACK = "bottom-[calc(11.5rem+0.75rem)]";

const LANDSCAPE_PANEL_INSET = "right-72";

interface ScanStageProps {
  layout: ScanLayout;
  immersive: boolean;
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
  viewfinder,
  chrome,
  controls,
  notices,
  tray,
  trayAnchorRef,
}: ScanStageProps) {
  const landscape = layout === "landscape";

  return (
    <div className={cn(immersive ? "contents" : cn(PAGE_WIDTH.capped, "px-safe px-4 pt-3 pb-12"))}>
      <div className={cn(immersive ? "contents" : "flex flex-col gap-3")}>
        <div className="empty:hidden">{immersive ? null : notices}</div>

        <div
          className={cn(
            "bg-muted relative overflow-hidden",
            immersive
              ? // Below the tray's z-50; the app header is hidden separately
                // via the `data-scan-immersive` rules in index.css.
                cn("fixed inset-y-0 left-0 z-40", landscape ? LANDSCAPE_PANEL_INSET : "right-0")
              : "mt-4 aspect-3/4 rounded-lg sm:aspect-video",
          )}
        >
          {viewfinder}

          {immersive && (
            <>
              <div className="px-safe pt-safe absolute inset-x-0 top-0 z-10 flex items-center gap-2 pb-3">
                {chrome}
              </div>

              {landscape && (
                <div className="pl-safe absolute top-1/2 left-0 z-10 flex max-w-36 -translate-y-1/2 flex-col items-start gap-2">
                  {controls}
                </div>
              )}

              <div
                className={cn(
                  "absolute z-10 flex flex-col items-center gap-2",
                  landscape
                    ? "px-safe inset-x-0 bottom-2 [&>*]:max-w-md"
                    : cn("inset-x-0 px-3", PORTRAIT_BOTTOM_STACK),
                )}
              >
                <div className="w-full empty:hidden">{notices}</div>
                {!landscape && (
                  <div className="flex flex-wrap items-center justify-center gap-2">{controls}</div>
                )}
              </div>
            </>
          )}
        </div>

        <div className={cn("flex-wrap items-center gap-2", immersive ? "hidden" : "flex")}>
          {immersive ? null : controls}
        </div>

        {/* Must stay the last child: only later siblings may change shape
            without disturbing the viewfinder's position above it. */}
        <ScanTrayShell layout={immersive ? layout : "boxed"} anchorRef={trayAnchorRef}>
          {tray}
        </ScanTrayShell>
      </div>
    </div>
  );
}
