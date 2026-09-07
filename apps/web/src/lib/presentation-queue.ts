import type { Printing } from "@openrift/shared";

export interface PresentationItem {
  id: string;
  printing: Printing;
  contextLabel?: string;
}

/** 120 ids (~5.4KB encoded in the URL) stays under nginx's default 8KB `large_client_header_buffers`. */
export const MAX_QUEUE_LENGTH = 120;

/** Repeated ids are kept, not deduped: a creator may legitimately return to a card later in the run. */
export function resolveQueuePrintings(
  ids: readonly string[],
  printingsById: Record<string, Printing>,
): Printing[] {
  const resolved: Printing[] = [];
  for (const id of ids.slice(0, MAX_QUEUE_LENGTH)) {
    const printing = printingsById[id];
    if (printing) {
      resolved.push(printing);
    }
  }
  return resolved;
}

export function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (!Number.isFinite(index)) {
    return 0;
  }
  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
}

/** Does not wrap: stays at 0 or `length - 1` at the ends. */
export function stepIndex(index: number, length: number, delta: number): number {
  return clampIndex(index + delta, length);
}
