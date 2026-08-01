import type { Printing } from "@openrift/shared";
import { WellKnown, imageUrl, legendDisplayName } from "@openrift/shared";
import { ArrowLeftRightIcon, MinusIcon, PlusIcon, SparklesIcon } from "lucide-react";

import { FoilOverlay } from "@/components/cards/foil-overlay";
import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { Button } from "@/components/ui/button";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatCardId } from "@/lib/format";
import type { ScanPrintingIndex } from "@/lib/scan-resolve";
import { finishSiblingsOf } from "@/lib/scan-resolve";
import { cn } from "@/lib/utils";
import type { ScanSessionRow } from "@/stores/scan-session-store";
import { useScanSessionStore } from "@/stores/scan-session-store";

interface ScanSessionTrayProps {
  index: ScanPrintingIndex | null;
  /** Move one copy of the row's printing to the given finish sibling. */
  onSwitchFinish: (row: ScanSessionRow, sibling: Printing) => void;
  /** Add one more copy of the row's printing without rescanning. */
  onAddOne: (row: ScanSessionRow) => void;
  /** Remove one copy of the row's printing from the collection. */
  onRemoveOne: (row: ScanSessionRow) => void;
  /** Open the printing swap for the row (all printings of that card). */
  onChangePrinting: (row: ScanSessionRow) => void;
}

/**
 * The session log under the camera: what this scan session added, newest
 * first. Every row is already in the collection — the controls here fix the
 * exceptions (a foil pull, a mis-scan) without leaving the page.
 *
 * @returns The tray, or a hint while the session is still empty.
 */
export function ScanSessionTray({
  index,
  onSwitchFinish,
  onAddOne,
  onRemoveOne,
  onChangePrinting,
}: ScanSessionTrayProps) {
  const rows = useScanSessionStore((state) => state.rows);
  const { labels } = useEnumOrders();

  if (rows.size === 0) {
    return (
      <p className="text-muted-foreground">
        Nothing scanned yet. Cards land in your collection the moment they are recognised, and show
        up here so you can undo or mark a foil.
      </p>
    );
  }

  const newestFirst = [...rows.values()].toReversed();
  const total = newestFirst.reduce((sum, row) => sum + row.copyIds.length, 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        {total} {total === 1 ? "card" : "cards"} added this session
      </p>
      <ul className="flex flex-col gap-2">
        {newestFirst.map((row) => {
          const printing = row.printing;
          const siblings = index ? finishSiblingsOf(printing, index) : [];
          const isFoil = printing.finish !== WellKnown.finish.NORMAL;
          return (
            <li key={printing.id} className="flex items-center gap-3">
              {/* Radius and clipping stay on this wrapper; the foil overlay's
                  3D transform lives two levels in. Combining them on one
                  element mis-sizes the overlay in Firefox. */}
              <span
                className={cn(
                  "relative block h-14 w-10 shrink-0 overflow-hidden rounded",
                  isFoil && "ring-1 ring-amber-400/60",
                )}
              >
                <img
                  src={imageUrl(printing.images[0]?.imageId ?? "", "120w")}
                  alt=""
                  className="size-full object-cover"
                />
                {/* Static rainbow, never the shimmer keyframe — the camera
                    pipeline needs every frame of CPU it can get. */}
                {isFoil && <FoilOverlay active shimmer={false} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {legendDisplayName(printing.card)}
                  {row.copyIds.length > 1 && (
                    <span className="text-muted-foreground tabular-nums">
                      {" "}
                      ×{row.copyIds.length}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <span className="font-mono">{formatCardId(printing)}</span>
                  <PrintingVariantLabel printing={printing} siblings={siblings} />
                </span>
              </span>
              {siblings.map((sibling) => {
                const toFoil = sibling.finish !== WellKnown.finish.NORMAL;
                return (
                  <Button
                    key={sibling.id}
                    size="sm"
                    variant={isFoil ? "secondary" : "outline"}
                    // The button that makes a card foil carries the same amber
                    // cue as a foil thumbnail. A rainbow wash sat over the
                    // label and cost it contrast, so the ring gets it instead.
                    className={cn(toFoil && "ring-1 ring-amber-400/60")}
                    onClick={() => onSwitchFinish(row, sibling)}
                    aria-label={`Mark one ${legendDisplayName(printing.card)} as ${labels.finishes[sibling.finish]}`}
                  >
                    <SparklesIcon className={cn("size-4", toFoil && "text-amber-500")} />
                    {labels.finishes[sibling.finish]}
                  </Button>
                );
              })}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onChangePrinting(row)}
                aria-label={`Change the printing of ${legendDisplayName(printing.card)}`}
              >
                <ArrowLeftRightIcon className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onAddOne(row)}
                aria-label={`Add another ${legendDisplayName(printing.card)}`}
              >
                <PlusIcon className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onRemoveOne(row)}
                aria-label={`Remove one ${legendDisplayName(printing.card)}`}
              >
                <MinusIcon className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
