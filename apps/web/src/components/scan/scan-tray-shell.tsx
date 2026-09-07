import type { ReactNode, RefObject } from "react";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ScanLayout } from "@/hooks/use-scan-layout";
import { cn } from "@/lib/utils";

const PEEK_SNAP_POINT = "11.5rem";

const LANDSCAPE_PANEL_WIDTH = "w-72";

interface ScanTrayShellProps {
  layout: ScanLayout;
  anchorRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

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
          "bg-background/80 pr-safe fixed inset-y-0 right-0 z-50 overflow-y-auto overscroll-contain border-l px-3 py-3 backdrop-blur-lg",
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
      snapPoints={[PEEK_SNAP_POINT, 1]}
      defaultSnapPoint={PEEK_SNAP_POINT}
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
