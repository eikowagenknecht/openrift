import type { CollectionResponse, Printing } from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { BookOpenIcon, InboxIcon } from "lucide-react";

import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useRequiredUserId } from "@/lib/auth-session";
import { useCopiesCollection } from "@/lib/copies-collection";

interface DisposePickerPopoverProps {
  printing: Printing;
  onPick: (printing: Printing, collectionId: string) => void;
}

interface PickerRow {
  collection: CollectionResponse;
  count: number;
}

export function DisposePickerPopover({ printing, onPick }: DisposePickerPopoverProps) {
  const userId = useRequiredUserId();
  const copiesCollection = useCopiesCollection();
  const { data: collections } = useQuery(collectionsQueryOptions(userId));
  const { data: copies } = useLiveQuery(
    (q) => (copiesCollection ? q.from({ copy: copiesCollection }) : null),
    [copiesCollection],
  );

  const rows: PickerRow[] = [];
  if (collections && copies) {
    const countByCollection = new Map<string, number>();
    for (const copy of copies) {
      if (copy.printingId !== printing.id) {
        continue;
      }
      countByCollection.set(copy.collectionId, (countByCollection.get(copy.collectionId) ?? 0) + 1);
    }
    // Collection order is authoritative here (server returns inbox-first, then
    // user-ordered). Filter to ones that actually own copies of this printing.
    for (const collection of collections) {
      const count = countByCollection.get(collection.id) ?? 0;
      if (count > 0) {
        rows.push({ collection, count });
      }
    }
  }

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- popover content, not a standalone interactive element
    <div
      className="bg-background flex w-56 flex-col gap-0.5 rounded-lg border p-1.5 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-muted-foreground px-2 pt-1 pb-1 text-[11px] font-medium">
        Remove from which?
      </div>
      {rows.map(({ collection, count }) => (
        <button
          key={collection.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPick(printing, collection.id);
          }}
          className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors"
        >
          {collection.isInbox ? (
            <InboxIcon className="size-3.5 shrink-0" />
          ) : (
            <BookOpenIcon className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">{collection.name}</span>
          <span className="text-muted-foreground">×{count}</span>
        </button>
      ))}
    </div>
  );
}
