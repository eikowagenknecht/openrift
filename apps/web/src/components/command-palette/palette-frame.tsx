import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface PaletteFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

export function PaletteFrame({ open, onOpenChange, title, children }: PaletteFrameProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent>
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col p-4">{open && children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-0 overflow-visible p-0 sm:max-w-md"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {open && children}
      </DialogContent>
    </Dialog>
  );
}
