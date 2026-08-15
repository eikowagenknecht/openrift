/**
 * Drag payloads for the stage builder. Two sources (a card in the catalogue
 * browser, a stop already in the queue) and three targets (the queue as a
 * whole, a stop as a place to insert before, a stop as a place to reorder to),
 * which between them cover adding a card, placing it, and reordering.
 */

import type { Printing } from "@openrift/shared";

import { asDragData } from "@/lib/dnd-data";

/** A card dragged out of the catalogue browser. */
export interface StagePoolCardDragData {
  type: "stage-pool-card";
  /**
   * The printing itself rather than its id. The drag ghost is rendered by the
   * context, which sits above the browser's Suspense boundary and so has no
   * catalogue of its own to look an id up in.
   */
  printing: Printing;
}

/**
 * A stop dragged by its grip. Doubles as the drop payload of every other stop,
 * since `useSortable` hands one `data` object to both halves of a row.
 */
export interface StageQueueRowData {
  type: "stage-queue-row";
  /** The stop's position in the queue. */
  index: number;
}

export type StageDragData = StagePoolCardDragData | StageQueueRowData;

/** The queue as a whole. A card released here goes on the end. */
interface StageQueueDropData {
  type: "stage-queue";
}

/**
 * A stop, as a target for a card from the browser: a release here inserts
 * before it.
 *
 * Deliberately a second droppable rather than the row's own sortable one. The
 * two drags mean different things by "over this stop" — one reorders, the other
 * inserts — and a single target would have to guess which from the drag alone.
 * Two of them lets the context's collision detection hand each drag the one it
 * is for, and a target the other drag can never accidentally land on.
 */
interface StageQueueSlotDropData {
  type: "stage-queue-slot";
  /** Where the card lands, i.e. the position of the stop it was dropped on. */
  index: number;
}

export type StageDropData = StageQueueDropData | StageQueueSlotDropData | StageQueueRowData;

const DRAG_TYPES = ["stage-pool-card", "stage-queue-row"] as const;
const DROP_TYPES = ["stage-queue", "stage-queue-slot", "stage-queue-row"] as const;

/** @returns The drag payload carried by an active drag, when it is one of ours. */
export function asStageDragData(data: unknown): StageDragData | undefined {
  return asDragData<StageDragData>(data, DRAG_TYPES);
}

/** @returns The drop payload of the hovered target, when it is one of ours. */
export function asStageDropData(data: unknown): StageDropData | undefined {
  return asDragData<StageDropData>(data, DROP_TYPES);
}
