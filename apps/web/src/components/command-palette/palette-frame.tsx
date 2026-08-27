import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface PaletteFrameProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screen-reader name for the dialog. */
  title: string;
  children: ReactNode;
}

/**
 * The shell every palette opens in: the centered dialog on desktop, the
 * swipeable drawer on phones.
 *
 * Shared so the global palette and the two quick-adds are the same object to
 * the user rather than three dialogs that happen to answer the same key. The
 * body is only mounted while open, which is what keeps a palette's catalog
 * reads and search index off the closed route.
 *
 * Which quick-add you are inside is said by the search box's leading token, not
 * by anything here: a level marker on its own row repeated the placeholder
 * below it, and put the way out nowhere near the caret it answers to. See
 * `PaletteScopeToken`.
 *
 * @returns The dialog (desktop) or drawer (mobile) host.
 */
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
