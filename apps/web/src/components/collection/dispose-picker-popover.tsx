import type { CollectionResponse, Printing } from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { BookOpenIcon, InboxIcon } from "lucide-react";
import { useState } from "react";

import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useRequiredUserId } from "@/lib/auth-session";
import { useCopiesCollection } from "@/lib/copies-collection";

interface DisposePickerPopoverProps {
  printing: Printing;
  onPick: (printing: Printing, collectionId: string) => void;
}

interface Row {
  collection: CollectionResponse;
  count: number;
}

/**
 * Computes the per-collection rows for a "Remove from" picker — collections
 * the user owns at least one copy of `printing` in, ordered server-canonical
 * (inbox first, then user-ordered).
 * @returns Rows of `{ collection, count }`.
 */
function useDisposeRows(printing: Printing): Row[] {
  const userId = useRequiredUserId();
  const copiesCollection = useCopiesCollection();
  const { data: collections } = useQuery(collectionsQueryOptions(userId));
  const { data: copies } = useLiveQuery(
    (q) => (copiesCollection ? q.from({ copy: copiesCollection }) : null),
    [copiesCollection],
  );

  const rows: Row[] = [];
  if (collections && copies) {
    const countByCollection = new Map<string, number>();
    for (const copy of copies) {
      if (copy.printingId !== printing.id) {
        continue;
      }
      countByCollection.set(copy.collectionId, (countByCollection.get(copy.collectionId) ?? 0) + 1);
    }
    for (const collection of collections) {
      const count = countByCollection.get(collection.id) ?? 0;
      if (count > 0) {
        rows.push({ collection, count });
      }
    }
  }
  return rows;
}

interface DisposeListBodyProps {
  printing: Printing;
  onPick: (printing: Printing, collectionId: string) => void;
}

/**
 * Just the rows of a "Remove from" picker (no PickerList wrapper). Used both
 * by the standalone `DisposePickerPopover` and as the dispose-page children
 * of `VariantAddPopover`, so a single Command root stays mounted across the
 * variants ↔ dispose page swap and the popover never loses focus.
 * @returns A fragment of `PickerRow`s, one per collection that owns a copy.
 */
export function DisposeListBody({ printing, onPick }: DisposeListBodyProps) {
  const rows = useDisposeRows(printing);
  return (
    <>
      {rows.map(({ collection, count }) => (
        <PickerRow
          key={collection.id}
          value={collection.id}
          onSelect={() => onPick(printing, collection.id)}
        >
          {collection.isInbox ? (
            <InboxIcon className="size-3.5 shrink-0" />
          ) : (
            <BookOpenIcon className="size-3.5 shrink-0" />
          )}
          <span className="flex-1">{collection.name}</span>
          <span className="text-muted-foreground tabular-nums">×{count}</span>
        </PickerRow>
      ))}
    </>
  );
}

/**
 * Header label for the "Remove from" sub-picker. Exported so the variants
 * popover can swap to it without re-declaring the styling.
 * @returns The header element.
 */
export function DisposeListHeader() {
  return (
    <div className="px-2.5 pt-2 pb-0.5">
      <p className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
        Remove from
      </p>
    </div>
  );
}

export function DisposePickerPopover({ printing, onPick }: DisposePickerPopoverProps) {
  const [highlightedId, setHighlightedId] = useState("");

  return (
    <PickerList
      highlightedId={highlightedId}
      onHighlightChange={setHighlightedId}
      onKeyDown={(event, id) => {
        if (event.key === "-" && id) {
          event.preventDefault();
          onPick(printing, id);
        }
      }}
      header={<DisposeListHeader />}
    >
      <DisposeListBody printing={printing} onPick={onPick} />
    </PickerList>
  );
}
