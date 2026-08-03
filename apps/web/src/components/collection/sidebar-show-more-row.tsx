import { useDndContext, useDroppable } from "@dnd-kit/core";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
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
      <SidebarMenuButton className="text-muted-foreground" onClick={() => toggleMoreShown(foldKey)}>
        {shown ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
        <span>{shown ? "Show less" : `Show ${hiddenCount} more`}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
