import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type {
  SidebarReorderCollectionDragData,
  SidebarReorderListDragData,
} from "@/components/collection/dnd-types";
import { SidebarMenuAction } from "@/components/ui/sidebar";

interface SortableSidebarRowProps {
  /** Unique sortable id; namespaced ("sortable-collection-…" / "sortable-list-…"). */
  id: string;
  data: SidebarReorderCollectionDragData | SidebarReorderListDragData;
  /** Used for the grip handle's accessible label. */
  label: string;
  /**
   * Render-prop: receives the grip handle and is expected to render it as a
   * sibling of the row's `SidebarMenuButton` inside `SidebarMenuItem`. That
   * placement lets shadcn's sidebar styles (peer/group selectors on
   * menu-item) reserve right-padding and hide-on-hover the action.
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
    <SidebarMenuAction
      showOnHover
      render={
        <button
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={`Reorder ${label}`}
          type="button"
        />
      }
    >
      <GripVerticalIcon className="cursor-grab active:cursor-grabbing" />
    </SidebarMenuAction>
  );

  return (
    <div ref={sortable.setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}
