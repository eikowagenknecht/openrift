import { useDroppable } from "@dnd-kit/core";
import type { ListIntent, ListKind } from "@openrift/shared";
import type { ReactNode } from "react";

import type { AnyDragData } from "@/components/collection/dnd-types";
import { cn } from "@/lib/utils";

interface DroppableSidebarListProps {
  listId: string;
  listName: string;
  listKind: ListKind;
  listIntent: ListIntent;
  children: ReactNode;
}

export interface SidebarListDropData {
  type: "list";
  listId: string;
  listName: string;
  listKind: ListKind;
  listIntent: ListIntent;
}

/**
 * Sidebar list row that accepts two drag types:
 *   - `collection-card` drops add copies to the list (the server's
 *     /entries/from-copies endpoint derives card/printing/copy entries from
 *     the list's kind), always non-destructive.
 *   - `list-entry` drops move entries between lists, but only when the
 *     destination matches the source on `kind` + `intent` (and isn't the
 *     same list). Mismatched targets don't highlight, so the user gets the
 *     standard "no drop" cursor.
 *
 * @returns The wrapper with drop highlighting when a compatible drag hovers.
 */
export function DroppableSidebarList({
  listId,
  listName,
  listKind,
  listIntent,
  children,
}: DroppableSidebarListProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `list-${listId}`,
    data: {
      type: "list",
      listId,
      listName,
      listKind,
      listIntent,
    } satisfies SidebarListDropData,
  });

  const dragData = active?.data.current as AnyDragData | undefined;
  const compatible = isCompatibleDrop(dragData, { listId, listKind, listIntent });
  const showHighlight = isOver && compatible;

  return (
    <div
      ref={setNodeRef}
      className={cn(showHighlight && "bg-primary/10 ring-primary/60 rounded-md ring-2 ring-inset")}
    >
      {children}
    </div>
  );
}

/**
 * Whether the given drag is allowed to land on the given sidebar list target.
 * Mirrored on the server in `moveListEntries`; the client predicate exists so
 * the highlight matches the server's accept/reject without an extra round-trip.
 * @returns `true` if the drop should highlight and the route handler should fire.
 */
export function isCompatibleDrop(
  drag: AnyDragData | undefined,
  target: { listId: string; listKind: ListKind; listIntent: ListIntent },
): boolean {
  if (!drag) {
    return false;
  }
  if (drag.type === "collection-card") {
    return true;
  }
  // list-entry: same kind + intent + different list. The destination intent /
  // kind constraints mirror the server-side check in moveListEntries — keeping
  // the same rule in the highlight so the user can't drag onto a target the
  // server will then reject.
  return (
    drag.sourceKind === target.listKind &&
    drag.sourceIntent === target.listIntent &&
    drag.sourceListId !== target.listId
  );
}
