import { CheckIcon } from "lucide-react";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/features/cards/hooks/use-cards";
import {
  collectLegendOptions,
  filterLegendOptions,
  toTrackedLegend,
} from "@/features/match-tracker/lib/match-legends";
import type { TrackedLegend } from "@/features/match-tracker/lib/match-legends";
import { cn } from "@/lib/utils";

// The catalog only loads while this dialog is open; the board itself renders from
// the denormalized snapshot on the seat, so the tracker stays usable offline.
export function LegendPickerDialog({
  open,
  onOpenChange,
  playerName,
  selectedCardId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerName: string;
  selectedCardId: string | null;
  onSelect: (legend: TrackedLegend | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-3 overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a legend for {playerName}</DialogTitle>
          <DialogDescription>
            Sets the art and colors on this player&apos;s side of the board.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={<LegendGridSkeleton />}>
            <LegendGrid
              selectedCardId={selectedCardId}
              onSelect={(legend) => {
                onSelect(legend);
                onOpenChange(false);
              }}
              onClear={() => {
                onSelect(null);
                onOpenChange(false);
              }}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LegendGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="aspect-card w-full rounded-md" />
      ))}
    </div>
  );
}

function LegendGrid({
  selectedCardId,
  onSelect,
  onClear,
}: {
  selectedCardId: string | null;
  onSelect: (legend: TrackedLegend) => void;
  onClear: () => void;
}) {
  const { allPrintings } = useCards();
  const [query, setQuery] = useState("");
  const options = collectLegendOptions(allPrintings);
  const shown = filterLegendOptions(options, query);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          placeholder="Search legends"
          aria-label="Search legends"
          onChange={(event) => setQuery(event.target.value)}
        />
        {selectedCardId !== null && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          No legends match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="grid min-h-0 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {shown.map((option) => (
            <Pressable
              key={option.cardId}
              aria-label={option.name}
              aria-pressed={option.cardId === selectedCardId}
              onClick={() => onSelect(toTrackedLegend(option))}
              className={cn(
                "bg-muted aspect-card relative flex items-end overflow-hidden rounded-md border p-1.5",
                option.cardId === selectedCardId && "border-primary ring-primary ring-2",
              )}
            >
              {option.thumbnail && (
                <img
                  src={option.thumbnail}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover"
                />
              )}
              <span className="absolute inset-0 bg-linear-to-t from-black/90 via-black/25 to-transparent" />
              <span className="text-2xs relative w-full truncate font-semibold text-white">
                {option.name}
              </span>
              {option.cardId === selectedCardId && (
                <CheckIcon className="text-primary absolute top-1 right-1 size-4" />
              )}
            </Pressable>
          ))}
        </div>
      )}
    </div>
  );
}
