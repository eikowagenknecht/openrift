import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DroppableCollectionProps {
  collectionId: string;
  disabled: boolean;
  children: ReactNode;
}

export function DroppableCollection({
  collectionId,
  disabled,
  children,
}: DroppableCollectionProps) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `collection-${collectionId}`,
    data: { type: "collection", collectionId },
    disabled,
  });

  const showHighlight = isOver && Boolean(active) && !disabled;

  return (
    <div
      ref={setNodeRef}
      className={cn(showHighlight && "bg-primary/10 ring-primary/60 rounded-md ring-2")}
    >
      {children}
    </div>
  );
}
