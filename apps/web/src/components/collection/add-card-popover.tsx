import type { Card } from "@openrift/shared";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAddCopies } from "@/hooks/use-copies";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AddCardPopoverProps {
  card: Card;
  printings?: Card[];
  collectionId: string;
  sourceId?: string;
  onDone: () => void;
}

export function AddCardPopover({
  card,
  printings,
  collectionId,
  sourceId,
  onDone,
}: AddCardPopoverProps) {
  const allPrintings = printings && printings.length > 1 ? printings : [card];
  const [selectedPrinting, setSelectedPrinting] = useState<Card>(card);
  const [quantity, setQuantity] = useState(1);
  const addCopies = useAddCopies();

  const handleAdd = () => {
    const copies = Array.from({ length: quantity }, () => ({
      printingId: selectedPrinting.id,
      collectionId,
      sourceId,
    }));

    addCopies.mutate(
      { copies },
      {
        onSuccess: () => {
          toast.success(`Added ${quantity}× ${card.name}`);
          onDone();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const hasMixedRarities = new Set(allPrintings.map((p) => p.rarity)).size > 1;

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- popover content, not a standalone interactive element
    <div
      className="flex w-64 flex-col gap-3 rounded-lg border bg-background p-3 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="truncate text-xs font-medium">{card.name}</p>

      {/* Printing picker (when multiple variants exist) */}
      {allPrintings.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Version</span>
          <div className="max-h-32 space-y-0.5 overflow-y-auto">
            {allPrintings.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPrinting(p)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors",
                  selectedPrinting.id === p.id ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatCardId(p)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {formatPrintingLabel(p, allPrintings) || p.set}
                </span>
                {hasMixedRarities && (
                  <img
                    src={`/images/rarities/${p.rarity.toLowerCase()}-28x28.webp`}
                    alt={p.rarity}
                    title={p.rarity}
                    width={28}
                    height={28}
                    className="size-3.5"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantity */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Qty</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
          >
            <Minus className="size-3" />
          </Button>
          <span className="w-6 text-center text-sm font-medium">{quantity}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setQuantity((q) => q + 1)}>
            <Plus className="size-3" />
          </Button>
        </div>
      </div>

      <Button size="sm" className="w-full" onClick={handleAdd} disabled={addCopies.isPending}>
        {addCopies.isPending ? "Adding…" : `Add ${quantity}×`}
      </Button>
    </div>
  );
}
