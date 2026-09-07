import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Pressable } from "@/components/ui/pressable";
import { PrintingLanguageTabs } from "@/features/cards/components/printing-language-tabs";
import { PrintingRowContent } from "@/features/cards/components/printing-row";
import { useScanPrefsStore } from "@/features/scan/stores/scan-prefs-store";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

/** One unresolved lock waiting for the user to name its printing. */
export interface PickerRequest {
  artKey: string;
  label: string;
  candidates: Printing[];
  currentId?: string;
}

interface ScanPrintingPickerProps {
  request: PickerRequest | null;
  onPick: (printing: Printing) => void;
  onDismiss: () => void;
  title?: string;
  description?: string;
}

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
  // EN is the fallback default: most stacks are in it.
  const statedLanguage =
    cardLanguage !== null && languages.includes(cardLanguage) ? cardLanguage : null;
  const defaultLanguage = statedLanguage ?? (languages.includes("EN") ? "EN" : languages[0]);

  const renderList = (items: Printing[]) => (
    <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
      {items.map((candidate) => {
        const isCurrent = candidate.id === request?.currentId;
        return (
          <Pressable
            key={candidate.id}
            aria-current={isCurrent ? "true" : undefined}
            className={cn(
              "hover:bg-muted flex w-full items-center rounded-md px-2 py-1.5",
              isCurrent && "bg-muted",
            )}
            onClick={() => onPick(candidate)}
          >
            <PrintingRowContent
              printing={candidate}
              // Full candidate set, not the tab's: the variant label needs every sibling.
              siblings={candidates}
              name={legendDisplayName(candidate.card)}
              right={
                isCurrent ? (
                  <span className="text-muted-foreground shrink-0 text-xs">Current</span>
                ) : null
              }
            />
          </Pressable>
        );
      })}
    </div>
  );

  const body =
    request === null ? null : (
      // Keyed on the request so a new one re-derives its default tab.
      // Candidates arrive sorted language-first; no order is passed separately.
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
