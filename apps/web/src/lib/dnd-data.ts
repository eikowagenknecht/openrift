/**
 * Narrowing for dnd-kit drag and drop payloads.
 *
 * Every surface keeps its own payload vocabulary (deck zones, collection copy
 * ids, tier rows); narrowing happens at the `unknown` boundary.
 */

import type { Collision, DroppableContainer } from "@dnd-kit/core";

interface TypedDragData {
  type: string;
}

/**
 * Contexts nest (the collections layout hosts the sidebar's sortable rows;
 * the deck editor hosts the card browser), so a handler can receive a
 * payload that isn't its own.
 */
export function asDragData<T extends TypedDragData>(
  data: unknown,
  types: readonly T["type"][],
): T | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  const candidate = data as T;
  return types.includes(candidate.type) ? candidate : undefined;
}

/** dnd-kit types `Collision["data"]` as `Record<string, any>`, but every built-in detector puts a `droppableContainer` there. */
export function collisionDropData(collision: Collision): unknown {
  const { droppableContainer } = (collision.data ?? {}) as {
    droppableContainer?: DroppableContainer;
  };
  return droppableContainer?.data.current;
}
