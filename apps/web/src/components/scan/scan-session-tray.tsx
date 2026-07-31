import type { Printing } from "@openrift/shared";
import { imageUrl, legendDisplayName } from "@openrift/shared";
import { MinusIcon, SparklesIcon } from "lucide-react";

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
  /** Remove one copy of the row's printing from the collection. */
  onRemoveOne: (row: ScanSessionRow) => void;
}

/**
 * The session log under the camera: what this scan session added, newest
 * first. Every row is already in the collection — the controls here fix the
 * exceptions (a foil pull, a mis-scan) without leaving the page.
 *
 * @returns The tray, or a hint while the session is still empty.
 */
export function ScanSessionTray({ index, onSwitchFinish, onRemoveOne }: ScanSessionTrayProps) {
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
          return (
            <li key={printing.id} className="flex items-center gap-3">
              <img
                src={imageUrl(printing.images[0]?.imageId ?? "", "120w")}
                alt=""
                className="h-14 w-10 shrink-0 rounded object-cover"
              />
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
              {siblings.map((sibling) => (
                <Button
                  key={sibling.id}
                  size="sm"
                  variant={printing.finish === "normal" ? "outline" : "secondary"}
                  onClick={() => onSwitchFinish(row, sibling)}
                  aria-label={`Mark one ${legendDisplayName(printing.card)} as ${labels.finishes[sibling.finish]}`}
                >
                  <SparklesIcon
                    className={cn("size-4", printing.finish !== "normal" && "text-amber-500")}
                  />
                  {labels.finishes[sibling.finish]}
                </Button>
              ))}
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
