import type { Printing } from "@openrift/shared";
import { imageUrl, legendDisplayName } from "@openrift/shared";

import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Pressable } from "@/components/ui/pressable";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { formatCardId } from "@/lib/format";

/** One unresolved lock waiting for the user to name its printing. */
export interface PickerRequest {
  artKey: string;
  label: string;
  candidates: Printing[];
}

interface ScanPrintingPickerProps {
  request: PickerRequest | null;
  onPick: (printing: Printing) => void;
  /** Dismissed without a pick: the lock is discarded (rescan to retry). */
  onDismiss: () => void;
  /** Dialog heading; defaults to the unresolved-lock copy. */
  title?: string;
  /** Dialog body copy; defaults to the unresolved-lock explanation. */
  description?: string;
}

/**
 * The immediate picker for locks the engine would not guess on (foils, and
 * variants no pixel evidence separates). Shows every candidate printing of
 * the locked artwork; picking adds that printing, dismissing discards the
 * lock entirely.
 *
 * @returns The picker dialog (a drawer on phones).
 */
export function ScanPrintingPicker({
  request,
  onPick,
  onDismiss,
  title = "Which printing is this?",
  description,
}: ScanPrintingPickerProps) {
  const isMobile = useIsMobile();
  const open = request !== null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onDismiss();
    }
  };

  const body = request && (
    <div className="flex flex-col gap-1">
      {request.candidates.map((candidate) => (
        <Pressable
          key={candidate.id}
          className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left"
          onClick={() => onPick(candidate)}
        >
          <img
            src={imageUrl(candidate.images[0]?.imageId ?? "", "120w")}
            alt=""
            className="h-14 w-10 shrink-0 rounded object-cover"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{legendDisplayName(candidate.card)}</span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <span className="font-mono">{formatCardId(candidate)}</span>
              <PrintingVariantLabel printing={candidate} siblings={request.candidates} />
            </span>
          </span>
        </Pressable>
      ))}
    </div>
  );

  const resolvedDescription =
    description ??
    (request
      ? `${request.label.split(" (")[0]} matched, but the exact printing needs your eyes (foils always do). Dismiss to skip this card.`
      : "");

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} showSwipeHandle>
        <DrawerContent>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{resolvedDescription}</DrawerDescription>
            <div className="min-h-0 overflow-y-auto">{body}</div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{resolvedDescription}</DialogDescription>
        <div className="max-h-96 overflow-y-auto">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
