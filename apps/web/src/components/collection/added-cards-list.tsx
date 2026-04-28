import type { Printing } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { useAddModeStore } from "@/stores/add-mode-store";

interface AddedCardsListProps {
  onCardClick: (printing: Printing) => void;
  onClose: () => void;
}

export function AddedCardsList({ onCardClick, onClose }: AddedCardsListProps) {
  const items = useAddModeStore((s) => s.addedItems);
  const entries = [...items.values()].toReversed();
  const totalCount = entries.reduce((sum, entry) => sum + entry.quantity + entry.pendingCount, 0);
  const { labels } = useEnumOrders();

  return (
    <div className="bg-background rounded-lg px-3">
      <div className="flex items-center justify-between pt-4 pb-3">
        <div>
          <h2 className="text-sm font-semibold">Added this session</h2>
          <p className="text-muted-foreground text-xs">
            {totalCount} {totalCount === 1 ? "copy" : "copies"}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="space-y-1 pb-4">
        {entries.map((entry) => {
          const firstImageId = entry.printing.images[0]?.imageId ?? null;
          const thumbnailUrl = firstImageId ? imageUrl(firstImageId, "400w") : null;

          return (
            <button
              key={entry.printing.id}
              type="button"
              onClick={() => onCardClick(entry.printing)}
              className="hover:bg-muted flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors"
            >
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={entry.printing.card.name}
                  className="h-12 w-auto rounded"
                />
              ) : (
                <div className="bg-muted h-12 w-9 rounded" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.printing.card.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {formatCardId(entry.printing)}
                  {" · "}
                  {formatPrintingLabel(entry.printing, undefined, labels)}
                </p>
              </div>
              {entry.quantity + entry.pendingCount > 1 && (
                <span className="text-muted-foreground shrink-0 text-sm font-medium">
                  ×{entry.quantity + entry.pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
