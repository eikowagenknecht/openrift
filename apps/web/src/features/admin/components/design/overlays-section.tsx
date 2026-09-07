import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { DemoRow, DemoSection } from "./demo-primitives";

export function OverlaysSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <DemoSection
      id="overlays"
      title="Overlays"
      note="Triggers pass primitives via the render prop. Every overlay needs a title for screen readers."
    >
      <DemoRow
        label="Dialogs & panels"
        hint="Dialog for tasks, AlertDialog for confirmations, Sheet for side panels, Drawer for mobile bottom sheets."
      >
        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          Dialog
        </Button>
        <Button variant="outline" onClick={() => setAlertOpen(true)}>
          Alert dialog
        </Button>
        <Button variant="outline" onClick={() => setSheetOpen(true)}>
          Sheet
        </Button>
        <Button variant="outline" onClick={() => setDrawerOpen(true)}>
          Drawer
        </Button>
      </DemoRow>
      <DemoRow
        label="Menus & popovers"
        hint="DropdownMenu for actions, Popover for rich content, Tooltip for icon labels, InfoHint for field explanations (tooltip on desktop, tap-open popover on touch), HoverCard for link previews, ContextMenu on right-click."
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline">
                Menu <ChevronDownIcon />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => toast("Renamed")}>Rename</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => toast("Deleted")}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger render={<Button variant="outline">Popover</Button>} />
          <PopoverContent className="w-56 text-sm">
            Anything can live here, like the owned-collections breakdown.
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline">Tooltip</Button>} />
          <TooltipContent>Exact copies owned, including foils.</TooltipContent>
        </Tooltip>
        <span className="flex items-center gap-1 text-sm font-medium">
          Info hint
          <InfoHint label="Info hint">
            Compares each printing&apos;s latest market price on the marketplace you pick.
          </InfoHint>
        </span>
        <HoverCard>
          <HoverCardTrigger render={<Button variant="link">Hover card</Button>} />
          <HoverCardContent className="text-sm">
            Rich preview content, like a card image on name hover.
          </HoverCardContent>
        </HoverCard>
        <ContextMenu>
          <ContextMenuTrigger className="text-muted-foreground rounded-lg border border-dashed px-4 py-2 text-sm">
            Right-click me
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => toast("Added to wishlist")}>
              Add to wishlist
            </ContextMenuItem>
            <ContextMenuItem onClick={() => toast("Added to tradelist")}>
              Add to tradelist
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </DemoRow>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogForm onSubmit={() => setDialogOpen(false)}>
            <DialogHeader>
              <DialogTitle>Rename deck</DialogTitle>
              <DialogDescription>Pick something your group will recognize.</DialogDescription>
            </DialogHeader>
            <Input placeholder="Jinx Aggro" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <DialogForm onSubmit={() => setAlertOpen(false)}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this deck?</AlertDialogTitle>
              <AlertDialogDescription>
                The deck and its plans are removed. Cards in your collection stay untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Side panel for secondary workflows.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerTitle className="p-4">Mobile drawer</DrawerTitle>
          <p className="text-muted-foreground px-4 pb-8 text-sm">
            Bottom sheet used for mobile flows like the quick-add palette.
          </p>
        </DrawerContent>
      </Drawer>
    </DemoSection>
  );
}
