import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DroppableSidebarListProps {
  listId: string;
  listName: string;
  children: ReactNode;
}

/**
 * Sidebar list row that accepts a drop of dragged collection copies. Mirrors
 * `DroppableCollection`'s wiring: useDroppable with a typed data payload
 * (`type: "list"`) so the route-level drag-end handler can branch on it.
 *
 * Mounted for every list kind — the collection drag carries copy IDs, and
 * the server's /entries/from-copies endpoint derives the right entry shape
 * (card / printing / copy) from the list's kind.
 * @returns The wrapper with drop highlighting when a drag hovers.
 */
export function DroppableSidebarList({ listId, listName, children }: DroppableSidebarListProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `list-${listId}`,
    data: { type: "list", listId, listName },
  });

  const showHighlight = isOver && Boolean(active);

  return (
    <div
      ref={setNodeRef}
      className={cn(showHighlight && "bg-primary/10 ring-primary/60 rounded-md ring-2 ring-inset")}
    >
      {children}
    </div>
  );
}
