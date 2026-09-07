import { useDroppable } from "@dnd-kit/core";
import type { ListIntent, ListKind } from "@openrift/shared";
import type { ReactNode } from "react";

import type { AnyDragData } from "@/components/collection/dnd-types";
import { COLLECTION_DRAG_TYPES } from "@/components/collection/dnd-types";
import { asDragData } from "@/lib/dnd-data";
import { cn } from "@/lib/utils";

interface DroppableSidebarListProps {
  listId: string;
  listName: string;
  listKind: ListKind;
  listIntent: ListIntent;
  disabled?: boolean;
  children: ReactNode;
}

export interface SidebarListDropData {
  type: "list";
  listId: string;
  listName: string;
  listKind: ListKind;
  listIntent: ListIntent;
}

/** Sidebar list row that accepts `collection-card` and `list-entry` drops. */
export function DroppableSidebarList({
  listId,
  listName,
  listKind,
  listIntent,
  disabled,
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
    disabled,
  });

  const dragData = asDragData<AnyDragData>(active?.data.current, COLLECTION_DRAG_TYPES);
  const compatible = isCompatibleDrop(dragData, { listId, listKind, listIntent });
  const showHighlight = !disabled && isOver && compatible;

  return (
    <div
      ref={setNodeRef}
      className={cn(showHighlight && "bg-primary/10 ring-primary/60 rounded-md ring-2 ring-inset")}
    >
      {children}
    </div>
  );
}

/** Mirrors the server's `moveListEntries` check so the highlight matches its accept/reject. */
export function isCompatibleDrop(
  drag: AnyDragData | undefined,
  target: { listId: string; listKind: ListKind; listIntent: ListIntent },
): boolean {
  if (!drag) {
    return false;
  }
  if (drag.type === "collection-card") {
    // Mirrors the server's personalOnly rule: group-only copies can't go on a trade/wish list.
    if (drag.sourceAllGroupCopies && target.listIntent !== "organize") {
      return false;
    }
    return true;
  }
  if (drag.type !== "list-entry") {
    return false;
  }
  return (
    drag.sourceKind === target.listKind &&
    drag.sourceIntent === target.listIntent &&
    drag.sourceListId !== target.listId
  );
}
