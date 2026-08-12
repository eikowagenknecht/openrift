import type { Printing } from "@openrift/shared";
import { getOrientation, legendDisplayName } from "@openrift/shared";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Pressable } from "@/components/ui/pressable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguageLabels } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { formatCardId } from "@/lib/format";
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
  const languageLabels = useLanguageLabels();
  const cardLanguage = useScanPrefsStore((state) => state.cardLanguage);
  const open = request !== null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onDismiss();
    }
  };

  const candidates = request?.candidates ?? [];
  // Candidates arrive sorted language-first, so the groups come out in that
  // same language order and each keeps its within-language order.
  const languageGroups = [...Map.groupBy(candidates, (printing) => printing.language)];
  const languages = languageGroups.map(([language]) => language);
  // The stated card language wins when the card was printed in it; English is
  // the fallback because it is the language most stacks are in.
  const statedLanguage =
    cardLanguage !== null && languages.includes(cardLanguage) ? cardLanguage : null;
  const defaultLanguage = statedLanguage ?? (languages.includes("EN") ? "EN" : languages[0]);

  const renderList = (items: Printing[]) => (
    <div className="flex flex-col gap-1">
      {items.map((candidate) => (
        <Pressable
          key={candidate.id}
          className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left"
          onClick={() => onPick(candidate)}
        >
          <CardArtThumb
            imageId={candidate.images[0]?.imageId}
            variant="120w"
            className="w-10"
            landscape={getOrientation(candidate.card.types) === "landscape"}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{legendDisplayName(candidate.card)}</span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <span className="font-mono">{formatCardId(candidate)}</span>
              {/* The full candidate set, not the tab's: the variant label needs
                  every sibling to know what distinguishes this printing. */}
              <PrintingVariantLabel printing={candidate} siblings={candidates} />
            </span>
          </span>
        </Pressable>
      ))}
    </div>
  );

  // Only the list scrolls, never the tab row above it, so the height cap sits
  // on the container the drawer and dialog each provide.
  const renderBody = () => {
    if (request === null) {
      return null;
    }
    if (languageGroups.length < 2) {
      return <div className="min-h-0 overflow-y-auto">{renderList(candidates)}</div>;
    }
    return (
      // Keyed on the request so a new one re-derives its default tab.
      <Tabs
        key={`${request.label}:${candidates[0]?.id}`}
        defaultValue={defaultLanguage}
        className="min-h-0"
      >
        {/* A card can be printed in more languages than fit one row, so the
            tabs wrap rather than scroll out of reach. */}
        <TabsList className="shrink-0 flex-wrap group-data-horizontal/tabs:h-auto">
          {languageGroups.map(([language, items]) => (
            <TabsTrigger key={language} value={language}>
              {languageLabels[language]}
              <span className="text-muted-foreground">{items.length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {languageGroups.map(([language, items]) => (
          <TabsContent key={language} value={language} className="min-h-0 overflow-y-auto">
            {renderList(items)}
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const body = renderBody();

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
