import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type {
  SidebarReorderCollectionDragData,
  SidebarReorderListDragData,
} from "@/components/collection/dnd-types";
import { cn } from "@/lib/utils";

/**
 * Apply to a reorderable sidebar row's leading icon so it yields its slot to the
 * drag handle, which sits on top of it. The grip and the icon share the same
 * left position; this class swaps which one is visible. It mirrors the handle's
 * reveal logic: on touch (below `md`) the handle is always shown, so the icon
 * stays hidden; on desktop the icon shows at rest and fades out while the row is
 * hovered or focused.
 */
export const SIDEBAR_ROW_ICON_CLASS =
  "opacity-0 transition-opacity md:opacity-100 md:group-hover/menu-item:opacity-0 md:group-focus-within/menu-item:opacity-0";

interface SortableSidebarRowProps {
  /** Unique sortable id; namespaced ("sortable-collection-…" / "sortable-list-…"). */
  id: string;
  data: SidebarReorderCollectionDragData | SidebarReorderListDragData;
  /** Used for the grip handle's accessible label. */
  label: string;
  /**
   * Render-prop: receives the grip handle and is expected to render it as a
   * sibling of the row's `SidebarMenuButton` inside `SidebarMenuItem`. The
   * handle is absolutely positioned over the row's leading icon, so the
   * menu-item's `group/menu-item` hover state drives the icon↔grip swap — the
   * row's icon must carry `SIDEBAR_ROW_ICON_CLASS` for the swap to work.
   */
  children: (handle: ReactNode) => ReactNode;
}

/**
 * Wraps a sidebar row so it can be reordered via dnd-kit. The drop side is
 * disabled when the active drag isn't a sidebar-reorder drag — that way card
 * drops keep going to the row's `DroppableCollection` / `DroppableSidebarList`
 * wrapper instead of being intercepted by the sortable.
 *
 * @returns The wrapping `<div>` (with sortable transform / transition / drag
 *   opacity) plus whatever the children render with the injected handle.
 */
export function SortableSidebarRow({ id, data, label, children }: SortableSidebarRowProps) {
  const { active } = useDndContext();
  const activeType = active?.data.current?.type;
  const isReorderActive =
    activeType === "sidebar-reorder-collection" || activeType === "sidebar-reorder-list";

  const sortable = useSortable({
    id,
    data,
    disabled: { droppable: !isReorderActive, draggable: false },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.3 : undefined,
  };

  const handle = (
    <button
      ref={sortable.setActivatorNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      aria-label={`Reorder ${label}`}
      type="button"
      className={cn(
        // Sits exactly over the row's leading icon (button p-2 + size-4 icon).
        // No background of its own, so it never paints a mismatched patch over
        // the row's hover highlight — the hidden icon underneath is all it covers.
        "absolute top-1.5 left-1.5 flex aspect-square w-5 items-center justify-center rounded-md outline-hidden",
        "cursor-grab transition-opacity active:cursor-grabbing",
        "text-sidebar-foreground group-hover/menu-item:text-sidebar-accent-foreground group-focus-within/menu-item:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground",
        // Hidden at rest on desktop; revealed on hover/focus. Always shown on touch (below md).
        "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 md:opacity-0",
        // While hidden on desktop, stay click-through so clicking the icon still follows the row link.
        "md:pointer-events-none md:group-focus-within/menu-item:pointer-events-auto md:group-hover/menu-item:pointer-events-auto",
        // Enlarge the touch target on mobile, where the grip is always shown.
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
    <div ref={sortable.setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}
