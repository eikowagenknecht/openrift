import { useDraggable } from "@dnd-kit/core";
import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import type { CardDragData } from "./dnd-types";

interface DraggableCardProps {
  id: string;
  copyIds: string[];
  printing: Printing;
  previewPrintings: Printing[];
  sourceCollectionId: string | undefined;
  children: ReactNode;
}

export function DraggableCard({
  id,
  copyIds,
  printing,
  previewPrintings,
  sourceCollectionId,
  children,
}: DraggableCardProps) {
  const data: CardDragData = {
    type: "collection-card",
    copyIds,
    printing,
    previewPrintings,
    sourceCollectionId,
  };

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id, data });

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
