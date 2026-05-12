import type { CollectionResponse, Printing } from "@openrift/shared";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { BookOpenIcon, InboxIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { collectionsQueryOptions } from "@/hooks/use-collections";
import { useRequiredUserId } from "@/lib/auth-session";
import { useCopiesCollection } from "@/lib/copies-collection";
import { cn } from "@/lib/utils";

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

  const [highlightedIndex, setHighlightedIndex] = useState(0);
  // Clamp the highlight if rows shrink (e.g. after the user removes the last
  // copy in a collection while the picker is still open).
  useEffect(() => {
    if (highlightedIndex >= rows.length && rows.length > 0) {
      setHighlightedIndex(rows.length - 1);
    }
  }, [highlightedIndex, rows.length]);

  useEffect(() => {
    if (rows.length === 0) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex((idx) => (idx < rows.length - 1 ? idx + 1 : 0));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex((idx) => (idx > 0 ? idx - 1 : rows.length - 1));
        return;
      }
      if (event.key === "Enter" || event.key === "-") {
        const row = rows[highlightedIndex];
        if (!row) {
          return;
        }
        event.preventDefault();
        onPick(printing, row.collection.id);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the `rows` array is freshly built each render but its contents are derived from collections/copies/printing.id, and the React Compiler caches it accordingly; we want re-bind when rows actually change
  }, [rows, highlightedIndex, onPick, printing]);

  return (
    <>
      <div className="px-2.5 pt-2 pb-0.5">
        <p className="text-muted-foreground text-2xs font-medium tracking-wide uppercase">
          Remove from
        </p>
      </div>
      <div className="px-1 pb-1">
        {rows.map(({ collection, count }, idx) => (
          <button
            key={collection.id}
            type="button"
            data-highlighted={idx === highlightedIndex}
            onClick={() => onPick(printing, collection.id)}
            onMouseEnter={() => setHighlightedIndex(idx)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm whitespace-nowrap transition-colors",
              idx === highlightedIndex ? "bg-accent" : "hover:bg-accent",
            )}
          >
            {collection.isInbox ? (
              <InboxIcon className="size-3.5 shrink-0" />
            ) : (
              <BookOpenIcon className="size-3.5 shrink-0" />
            )}
            <span className="flex-1">{collection.name}</span>
            <span className="text-muted-foreground tabular-nums">×{count}</span>
          </button>
        ))}
      </div>
    </>
  );
}
