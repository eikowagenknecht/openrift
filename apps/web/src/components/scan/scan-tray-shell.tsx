import type { ReactNode, RefObject } from "react";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ScanLayout } from "@/hooks/use-scan-layout";
import { cn } from "@/lib/utils";

/**
 * The peeking height of the portrait sheet: enough for the newest row *with
 * its actions out*, so the last scan is both legible and correctable without a
 * drag. Sized against the parts (swipe handle 12px, row padding 16, thumbnail
 * 56, then two 32px lines of actions plus their gaps), which is why it is not a
 * round number of rows. Two lines because the actions wrap on a narrow phone,
 * and a peek sized for one leaves the second half off the bottom of the screen.
 */
const PEEK_SNAP_POINT = "11.5rem";

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
      // The sheet has no close state, but Base UI still reads a downward swipe
      // as a dismiss candidate before it picks a snap point: a flick past
      // FAST_SWIPE_VELOCITY dismisses outright, and below that the release
      // point is projected forward by velocity, which overshoots the peek.
      // The rejected dismiss then restores the snap point the drag *started*
      // from, so a downward swing left the sheet stuck open. Cancelling here
      // takes the synchronous rejection path instead of the deferred one,
      // which would otherwise dip the sheet for a frame before springing back.
      onOpenChange={(_open, details) => {
        details.cancel();
      }}
      modal={false}
      snapPoints={[PEEK_SNAP_POINT, 1]}
      defaultSnapPoint={PEEK_SNAP_POINT}
      // Drag distance alone picks the next snap point. Without this, velocity
      // projection turns any downward swing into the dismiss described above.
      // Nothing is lost with two snap points — there is none to skip past.
      snapToSequentialPoints
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
