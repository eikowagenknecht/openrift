import { useDndContext, useDroppable } from "@dnd-kit/core";
import { useEffect } from "react";

import type { AnyDragData } from "@/components/collection/dnd-types";
import { CARD_CARRYING_DRAG_TYPES } from "@/components/collection/dnd-types";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { asDragData } from "@/lib/dnd-data";
import type { SidebarGroupKey } from "@/stores/sidebar-fold-store";
import { useSidebarFoldStore } from "@/stores/sidebar-fold-store";

interface SidebarShowMoreRowProps {
  foldKey: SidebarGroupKey;
  hiddenCount: number;
  shown: boolean;
}

// A drop target only to reveal: a hidden row can't receive a card while
// unrendered, so hovering a dragged card here opens the group and the real
// rows underneath take the drop. Dropping on the row itself does nothing.
export function SidebarShowMoreRow({ foldKey, hiddenCount, shown }: SidebarShowMoreRowProps) {
  const toggleMoreShown = useSidebarFoldStore((state) => state.toggleMoreShown);
  const setMoreShown = useSidebarFoldStore((state) => state.setMoreShown);

  const { active } = useDndContext();
  const isCardDrag =
    asDragData<AnyDragData>(active?.data.current, CARD_CARRYING_DRAG_TYPES) !== undefined;
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
