import type { DragEndEvent, DragStartEvent, SensorDescriptor, SensorOptions } from "@dnd-kit/core";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Puts the table inside a dnd-kit sortable context, or renders it untouched on
 * the tables that don't reorder.
 */
export function ReorderProvider({
  enabled,
  sensors,
  items,
  onDragStart,
  onDragEnd,
  onDragCancel,
  children,
}: {
  enabled: boolean;
  sensors: SensorDescriptor<SensorOptions>[];
  items: string[];
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
  children: ReactNode;
}) {
  if (!enabled) {
    return children;
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // Rows only ever swap places in one column, so a drag has no business
      // leaving the vertical axis.
      modifiers={[restrictToVerticalAxis]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * A data row on a reorderable table: draggable by its grip, with the up/down
 * buttons beside it for single steps and keyboard use.
 */
export function ReorderableRow({
  id,
  locked,
  droppable,
  canMoveUp,
  canMoveDown,
  onMove,
  children,
}: {
  id: string;
  locked: boolean;
  droppable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  children: ReactNode;
}) {
  // Destructured into locals before the JSX: member access on the hook's return
  // object in render makes the React Compiler bail. Matches SortableSidebarRow.
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: locked ? true : { draggable: false, droppable: !droppable } });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      // The dragged row is lifted out of the flow visually, so it needs its own
      // background to stop the rows it passes showing through.
      className={cn(isDragging && "bg-background relative z-10 shadow-lg")}
    >
      <TableCell>
        <div className="flex items-center gap-0.5">
          {/* oxlint-disable-next-line react/forbid-elements -- dnd-kit drag activator, sized to sit with the two icon buttons */}
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            disabled={locked}
            aria-label="Drag to reorder"
            className={cn(
              "text-muted-foreground hover:text-foreground flex h-6 w-5 items-center justify-center rounded-md",
              // dnd-kit's PointerSensor needs the browser to keep sending
              // pointer events; the default touch-action pans the page instead
              // and the pointercancel that follows kills the drag.
              "touch-none outline-hidden",
              "focus-visible:ring-ring focus-visible:ring-2",
              locked ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing",
            )}
          >
            <GripVerticalIcon className="h-3.5 w-3.5" />
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Move up"
            disabled={!canMoveUp || locked}
            onClick={() => onMove(-1)}
          >
            <ArrowUpIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Move down"
            disabled={!canMoveDown || locked}
            onClick={() => onMove(1)}
          >
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
      {children}
    </TableRow>
  );
}
