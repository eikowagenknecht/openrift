import type { ReactNode, RefObject } from "react";

import { ScanTrayShell } from "@/components/scan/scan-tray-shell";
import type { ScanLayout } from "@/hooks/use-scan-layout";
import { cn } from "@/lib/utils";

/**
 * Clearance the portrait control bar keeps above the peeking tray sheet. Must
 * track `PEEK_SNAP_POINT` in scan-tray-shell, plus a little air.
 */
const PORTRAIT_BOTTOM_STACK = "bottom-[calc(7rem+0.75rem)]";

/** Width of the landscape side panel, mirroring scan-tray-shell's panel. */
const LANDSCAPE_PANEL_INSET = "right-72";

interface ScanStageProps {
  layout: ScanLayout;
  /**
   * True once the camera is running on a phone: the page drops its chrome and
   * the viewfinder takes the whole viewport. Before that the normal page
   * layout stays, so the user keeps the header, the loading rows and the way
   * back out.
   */
  immersive: boolean;
  /** The video, its overlay canvas and everything drawn over the picture. */
  viewfinder: ReactNode;
  /** Back, target collection and mute. Shown over the picture when immersive. */
  chrome: ReactNode;
  /** Scan, identify and stop, plus the card-language select. */
  controls: ReactNode;
  /** Load failures, the slow-device notice and camera errors. */
  notices: ReactNode;
  tray: ReactNode;
  /** Where a locked card flies to; sits on the tray container itself. */
  trayAnchorRef: RefObject<HTMLDivElement | null>;
}

/**
 * Arranges the scanning page for the room it has.
 *
 * Boxed is the familiar page: a camera card in the content column with the
 * controls and the session tray stacked below it. The two immersive layouts
 * hand the whole viewport to the camera and float everything else over the
 * picture, because on a phone the card in the guide is the thing that needs
 * pixels. Landscape keeps the tray beside the picture rather than under it and
 * runs the controls down the free left edge, so the short axis stays clear.
 *
 * The element tree is deliberately the SAME in all three layouts, with only
 * classes and slot contents changing: the `<video>` carries a live
 * `srcObject`, and moving it between two different trees would unmount it and
 * leave the user with a dead camera the moment the layout flipped. The
 * wrappers collapse to `display: contents` when immersive rather than
 * disappearing, and each slot renders an empty box rather than nothing, so
 * every child keeps its position for reconciliation.
 *
 * @returns The arranged scanning surface.
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
    <div
      className={cn(immersive ? "contents" : "px-safe mx-auto w-full max-w-4xl px-4 pt-3 pb-12")}
    >
      <div className={cn(immersive ? "contents" : "flex flex-col gap-3")}>
        <div className="empty:hidden">{immersive ? null : notices}</div>

        <div
          className={cn(
            "bg-muted relative overflow-hidden",
            immersive
              ? // Below the tray (z-50), which overlaps the picture. The app
                // header is not a factor: the page hides it while immersive
                // (see the `data-scan-immersive` rules in index.css).
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

              {/* Notices ride directly above the controls rather than at the
                    bottom edge, which the peeking tray sheet covers. */}
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

        {/* Last child on purpose: it changes shape between layouts (block,
              sheet, side panel) and only later siblings may do that without
              disturbing the viewfinder's position above it. Both immersive
              forms escape this wrapper anyway — the sheet portals to the body,
              the panel is fixed, and a `display: contents` wrapper creates no
              containing block to trap it. */}
        <ScanTrayShell layout={immersive ? layout : "boxed"} anchorRef={trayAnchorRef}>
          {tray}
        </ScanTrayShell>
      </div>
    </div>
  );
}
