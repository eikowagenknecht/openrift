import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState } from "react";

import type { ReorderMoves } from "@/features/admin/lib/admin-reorder";

export interface AdminReorderConfig {
  moves: ReorderMoves;
  onReorder: (keys: string[]) => Promise<unknown> | void;
  isPending?: boolean;
}

export function useAdminReorder({
  reorder,
  rowKeys,
}: {
  reorder?: AdminReorderConfig;
  rowKeys: string[];
}) {
  const [pendingOrder, setPendingOrder] = useState<{ keys: string[]; from: string } | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const sensors = useSensors(
    // A distance threshold so a click on the handle isn't read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // The reorder mutation only invalidates, so rows would snap back to the old
  // order until the refetch lands.
  const orderSignature = rowKeys.join("\u0000");
  const showsPendingOrder = pendingOrder !== null && pendingOrder.from === orderSignature;
  const orderedKeys = showsPendingOrder ? pendingOrder.keys : rowKeys;
  // While the dropped order is unconfirmed, `reorder.moves` still describes the
  // pre-move order, so a second move would compute from the wrong list.
  const locked = Boolean(reorder?.isPending) || showsPendingOrder;

  async function commitReorder(keys: string[] | null) {
    if (!reorder || !keys) {
      return;
    }
    setPendingOrder({ keys, from: orderSignature });
    try {
      await reorder.onReorder(keys);
    } catch {
      setPendingOrder(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveKey(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveKey(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveKey(null);
    if (!reorder || !over || active.id === over.id) {
      return;
    }
    void commitReorder(reorder.moves.moveTo(String(active.id), String(over.id)));
  }

  return {
    sensors,
    activeKey,
    orderedKeys,
    locked,
    commitReorder,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  };
}
