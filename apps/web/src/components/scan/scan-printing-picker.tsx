import type { Printing } from "@openrift/shared";
import { getOrientation, legendDisplayName } from "@openrift/shared";

import { PrintingLanguageTabs } from "@/components/cards/printing-language-tabs";
import { PrintingVariantLine } from "@/components/cards/printing-row";
import { ScanCandidateRow } from "@/components/scan/scan-candidate-row";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useScanPrefsStore } from "@/stores/scan-prefs-store";

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
  const cardLanguage = useScanPrefsStore((state) => state.cardLanguage);
  const open = request !== null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onDismiss();
    }
  };

  const candidates = request?.candidates ?? [];
  const languages = candidates.map((candidate) => candidate.language);
  // The stated card language wins when the card was printed in it; English is
  // the fallback because it is the language most stacks are in.
  const statedLanguage =
    cardLanguage !== null && languages.includes(cardLanguage) ? cardLanguage : null;
  const defaultLanguage = statedLanguage ?? (languages.includes("EN") ? "EN" : languages[0]);

  const renderList = (items: Printing[]) => (
    <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
      {items.map((candidate) => (
        <ScanCandidateRow
          key={candidate.id}
          imageId={candidate.images[0]?.imageId}
          landscape={getOrientation(candidate.card.types) === "landscape"}
          rarity={candidate.rarity}
          domains={candidate.card.domains}
          title={legendDisplayName(candidate.card)}
          // The full candidate set, not the tab's: the variant label needs
          // every sibling to know what distinguishes this printing.
          detail={<PrintingVariantLine printing={candidate} siblings={candidates} />}
          onClick={() => onPick(candidate)}
        />
      ))}
    </div>
  );

  // Only the list scrolls, never the tab row above it, so the height cap sits
  // on the container the drawer and dialog each provide.
  const body =
    request === null ? null : (
      // Keyed on the request so a new one re-derives its default tab. Candidates
      // arrive sorted language-first, so no language order is handed over and
      // the grouping keeps that order rather than the taxonomy's.
      <PrintingLanguageTabs
        key={`${request.label}:${candidates[0]?.id}`}
        printings={candidates}
        defaultLanguage={defaultLanguage}
        className="min-h-0"
        contentClassName="flex min-h-0 flex-col"
      >
        {renderList}
      </PrintingLanguageTabs>
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
            <div className="flex min-h-0 flex-col">{body}</div>
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
        <div className="flex max-h-96 flex-col">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
