import type { ReactNode, RefObject } from "react";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ScanLayout } from "@/hooks/use-scan-layout";
import { cn } from "@/lib/utils";

/**
 * The peeking height of the portrait sheet: enough for the summary line and
 * the newest row, so the last scan is always legible without a drag.
 */
const PEEK_SNAP_POINT = "7rem";

/** Width of the landscape side panel, sized to fit a tray row without wrapping. */
const LANDSCAPE_PANEL_WIDTH = "w-72";

interface ScanTrayShellProps {
  layout: ScanLayout;
  /**
   * Marks where a locked card should land. The flight animation reads this
   * element's box at take-off, so it has to sit on the tray itself rather than
   * on a wrapper that moves with the sheet.
   */
  anchorRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

/**
 * Hosts the session tray in whichever container the current layout calls for:
 * a plain block on desktop, a sheet that peeks over the bottom edge on an
 * upright phone, and a fixed side panel when the phone is sideways (where a
 * bottom sheet would eat most of the short axis).
 *
 * The sheet is deliberately non-modal and never closes — it is a live log next
 * to a running camera, not a dialog. Dragging moves it between the peek and
 * full snap points.
 *
 * @returns The tray wrapped for the active layout.
 */
export function ScanTrayShell({ layout, anchorRef, children }: ScanTrayShellProps) {
  if (layout === "boxed") {
    return (
      <div ref={anchorRef} className="mt-2">
        {children}
      </div>
    );
  }

  if (layout === "landscape") {
    return (
      <div
        ref={anchorRef}
        className={cn(
          // Above the immersive viewfinder's z-40, matching the portalled
          // portrait sheet's own layer.
          "bg-background/90 pr-safe fixed inset-y-0 right-0 z-50 overflow-y-auto overscroll-contain border-l px-3 py-3 backdrop-blur-lg",
          LANDSCAPE_PANEL_WIDTH,
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <Drawer
      open
      modal={false}
      snapPoints={[PEEK_SNAP_POINT, 1]}
      defaultSnapPoint={PEEK_SNAP_POINT}
      showSwipeHandle
    >
      <DrawerContent>
        <div ref={anchorRef} className="px-safe overflow-y-auto overscroll-contain px-4 pt-1 pb-4">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
