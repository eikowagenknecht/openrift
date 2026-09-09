import type { Card } from "@openrift/shared/types/catalog";
import { WellKnown } from "@openrift/shared/well-known";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CardSearchDropdown } from "@/features/cards/components/card-search-dropdown";
import { cardSearchLeading } from "@/features/cards/components/printing-option-content";
import { useCatalogCardSearch } from "@/features/cards/hooks/use-catalog-card-search";

export interface LegendTarget {
  participantId: string;
  name: string;
  legendName: string | null;
}

const isLegend = (card: Card): boolean => card.types.includes(WellKnown.cardType.LEGEND);

export function LegendPickerDialog({
  target,
  pending,
  onOpenChange,
  onPick,
}: {
  target: LegendTarget | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (participantId: string, legendCardId: string | null) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Legend for {target?.name}</DialogTitle>
          <DialogDescription>
            The Legend this player brings. It shows in the standings and the participant list.
          </DialogDescription>
        </DialogHeader>
        {target ? (
          <Suspense fallback={<Input placeholder="Loading cards…" disabled />}>
            <LegendSearch onPick={(legendCardId) => onPick(target.participantId, legendCardId)} />
          </Suspense>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {target?.legendName ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => onPick(target.participantId, null)}
            >
              Clear Legend
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Split out so useCards suspends inside the boundary, not on the dialog's first render.
function LegendSearch({ onPick }: { onPick: (legendCardId: string) => void }) {
  const [search, setSearch] = useState("");
  const results = useCatalogCardSearch(search, isLegend, cardSearchLeading);
  return (
    <CardSearchDropdown
      results={results}
      onSearch={setSearch}
      onSelect={onPick}
      placeholder="Search Legends…"
      className="w-full"
      emptyMessage="No matching Legends"
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- the dialog opens onto this single field
      autoFocus
    />
  );
}
