import { useDraggable } from "@dnd-kit/core";
import type { ReactNode } from "react";

import type { ListEntryDragData } from "@/features/collections/components/dnd-types";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface DraggableListEntryProps {
  id: string;
  data: ListEntryDragData;
  children?: ReactNode;
}

/** Disabled on mobile: touch users get the tap-and-tap flows via the context menu instead. */
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
