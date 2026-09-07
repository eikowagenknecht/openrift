import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import type { CSSProperties, ReactNode, TouchEvent } from "react";

import type {
  AnyDragData,
  SidebarReorderCollectionDragData,
  SidebarReorderListDragData,
} from "@/components/collection/dnd-types";
import { SIDEBAR_REORDER_DRAG_TYPES } from "@/components/collection/dnd-types";
import { asDragData } from "@/lib/dnd-data";
import { cn } from "@/lib/utils";

// On desktop the grip covers the icon and only appears on row hover; on touch
// (below `md`) there's no hover, so both the icon and the grip show.
export const SIDEBAR_ROW_ICON_CLASS = "transition-opacity md:group-hover/menu-item:opacity-0";

interface SortableSidebarRowProps {
  id: string;
  data: SidebarReorderCollectionDragData | SidebarReorderListDragData;
  label: string;
  /** The row's icon must carry `SIDEBAR_ROW_ICON_CLASS` for the injected handle's hover swap to work. */
  children: (handle: ReactNode) => ReactNode;
}

// The drop side is disabled when the active drag isn't a sidebar-reorder
// drag, so card drops keep going to the row's Droppable wrapper instead.
export function SortableSidebarRow({ id, data, label, children }: SortableSidebarRowProps) {
  const { active } = useDndContext();
  const isReorderActive =
    asDragData<AnyDragData>(active?.data.current, SIDEBAR_REORDER_DRAG_TYPES) !== undefined;

  // Destructure into locals: the React Compiler treats member access on the
  // hook's return object as a ref read during render and bails.
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data,
    disabled: { droppable: !isReorderActive, draggable: false },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : undefined,
  };

  // A touch drag off the grip looks exactly like the context menu's long-press
  // trigger; stopping propagation of onTouchStart here keeps that timer from
  // starting (right-click still opens the menu on desktop).
  const stopTouchStart = (event: TouchEvent) => event.stopPropagation();

  const handle = (
    // oxlint-disable-next-line react/forbid-elements -- dnd-kit drag activator with bespoke reveal/positioning
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      onTouchStart={stopTouchStart}
      aria-label={`Reorder ${label}`}
      type="button"
      className={cn(
        "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md outline-hidden md:right-auto md:left-1.5",
        "cursor-grab transition-opacity active:cursor-grabbing",
        // Without this, the sidebar's default touch-action starts panning on
        // the first move and the resulting pointercancel aborts the drag.
        "touch-none",
        "text-sidebar-foreground group-hover/menu-item:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground",
        "focus-visible:opacity-100 md:opacity-0 md:group-hover/menu-item:opacity-100",
        // Click-through while hidden on desktop, so clicking the icon still follows the row link.
        "md:pointer-events-none md:group-hover/menu-item:pointer-events-auto",
        "after:absolute after:-inset-2 md:after:hidden",
        "focus-visible:ring-sidebar-ring focus-visible:ring-2",
        "group-data-[collapsible=icon]:hidden",
        "[&>svg]:size-4 [&>svg]:shrink-0",
      )}
    >
      <GripVerticalIcon />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}
