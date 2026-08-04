import { useDndContext, useDroppable } from "@dnd-kit/core";
import { useEffect } from "react";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { SidebarGroupKey } from "@/stores/sidebar-fold-store";
import { useSidebarFoldStore } from "@/stores/sidebar-fold-store";

interface SidebarShowMoreRowProps {
  foldKey: SidebarGroupKey;
  /** How many rows are still folded away; 0 means the group is fully revealed. */
  hiddenCount: number;
  shown: boolean;
}

/**
 * The "Show N more" / "Show less" row at the foot of a sidebar group that has
 * rows hidden behind it.
 *
 * Deliberately slimmer than a list row (h-6, no icon): it is chrome, not a
 * destination, and one of these can sit under every group. Its label is
 * indented to `pl-8` so it starts where the rows' labels start, keeping the
 * column edge clean without an icon of its own.
 *
 * It is also a drop target, but only to reveal: a hidden row can't receive a
 * card while it isn't rendered, so hovering a dragged card here opens the
 * group and the real rows underneath take the drop. Dropping on the row itself
 * does nothing (the route's drag handler ignores it).
 * @returns The toggle row.
 */
export function SidebarShowMoreRow({ foldKey, hiddenCount, shown }: SidebarShowMoreRowProps) {
  const toggleMoreShown = useSidebarFoldStore((state) => state.toggleMoreShown);
  const setMoreShown = useSidebarFoldStore((state) => state.setMoreShown);

  const { active } = useDndContext();
  const activeType = active?.data.current?.type;
  const isCardDrag = activeType === "collection-card" || activeType === "list-entry";
  const { setNodeRef, isOver } = useDroppable({
    id: `sidebar-more-${foldKey}`,
    disabled: !isCardDrag || shown,
  });

  useEffect(() => {
    if (isOver && isCardDrag && !shown) {
      setMoreShown(foldKey, true);
    }
  }, [isOver, isCardDrag, shown, foldKey, setMoreShown]);

  return (
    <SidebarMenuItem ref={setNodeRef}>
      <SidebarMenuButton
        className="text-muted-foreground h-6 py-0 pl-8 text-xs"
        onClick={() => toggleMoreShown(foldKey)}
      >
        <span>{shown ? "Show less" : `Show ${hiddenCount} more`}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
