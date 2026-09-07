import type { Printing } from "@openrift/shared";

import { asDragData } from "@/lib/dnd-data";

/** Carries the printing itself, not its id: the drag ghost renders above the browser's Suspense boundary and has no catalogue to look an id up in. */
export interface StagePoolCardDragData {
  type: "stage-pool-card";
  printing: Printing;
}

/** Doubles as the drop payload of every other stop, since `useSortable` hands one `data` object to both halves of a row. */
export interface StageQueueRowData {
  type: "stage-queue-row";
  index: number;
}

export type StageDragData = StagePoolCardDragData | StageQueueRowData;

interface StageQueueDropData {
  type: "stage-queue";
}

/** A second droppable, distinct from the row's own sortable one: keeps a reorder from being confused with an insert-before-this-stop. */
interface StageQueueSlotDropData {
  type: "stage-queue-slot";
  index: number;
}

export type StageDropData = StageQueueDropData | StageQueueSlotDropData | StageQueueRowData;

const DRAG_TYPES = ["stage-pool-card", "stage-queue-row"] as const;
const DROP_TYPES = ["stage-queue", "stage-queue-slot", "stage-queue-row"] as const;

export function asStageDragData(data: unknown): StageDragData | undefined {
  return asDragData<StageDragData>(data, DRAG_TYPES);
}

export function asStageDropData(data: unknown): StageDropData | undefined {
  return asDragData<StageDropData>(data, DROP_TYPES);
}
