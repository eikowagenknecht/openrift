import { useDraggable } from "@dnd-kit/core";
import type { ReactNode } from "react";

import type { ListEntryDragData } from "@/components/collection/dnd-types";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface DraggableListEntryProps {
  id: string;
  data: ListEntryDragData;
  children: ReactNode;
}

/**
 * List-page mirror of `DraggableCard`. The fan / stack-trim mechanics from
 * the collection drag don't apply here — each tile is one entry (with its
 * own quantity), and a move always carries the whole entry. Disabled on
 * mobile for the same reason as the collection drag: touch users get the
 * tap-and-tap flows via the context menu instead.
 *
 * @returns A drag handle around the cell, or just the cell on mobile.
 */
export function DraggableListEntry({ id, data, children }: DraggableListEntryProps) {
  const isMobile = useIsMobile();
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, data });

  if (isMobile) {
    return children;
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={isDragging ? { opacity: 0.4 } : undefined}
    >
      {children}
    </div>
  );
}
