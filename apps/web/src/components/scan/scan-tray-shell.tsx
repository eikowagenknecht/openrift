import type { ReactNode, RefObject } from "react";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ScanLayout } from "@/hooks/use-scan-layout";
import { cn } from "@/lib/utils";

// Fits the handle, the header, one row and the pinned footer. The portrait
// viewfinder ends at this line.
export const SCAN_TRAY_PEEK = "15rem";

const LANDSCAPE_PANEL_WIDTH = "w-72";

interface ScanTrayShellProps {
  layout: ScanLayout;
  fullscreen: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

export function ScanTrayShell({ layout, fullscreen, anchorRef, children }: ScanTrayShellProps) {
  if (layout === "boxed") {
    return (
      <div
        ref={anchorRef}
        className="md:bg-card/40 flex min-h-0 flex-col md:col-start-2 md:row-start-2 md:h-full md:rounded-lg md:border md:px-3 md:pb-3"
      >
        {children}
      </div>
    );
  }

  if (layout === "landscape") {
    return (
      <div
        ref={anchorRef}
        className={cn(
          "bg-background/80 pr-safe fixed right-0 bottom-0 z-50 flex min-h-0 flex-col border-l px-3 pb-3 backdrop-blur-lg",
          fullscreen ? "top-0" : "top-(--header-height)",
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
      // Base UI still treats a downward swipe as a dismiss candidate even
      // though the sheet has no close state; cancel it here.
      onOpenChange={(_open, details) => {
        details.cancel();
      }}
      modal={false}
      snapPoints={[SCAN_TRAY_PEEK, 1]}
      defaultSnapPoint={SCAN_TRAY_PEEK}
      snapToSequentialPoints
      showSwipeHandle
    >
      <DrawerContent>
        <div ref={anchorRef} className="px-safe pb-safe flex min-h-0 flex-1 flex-col px-4">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
