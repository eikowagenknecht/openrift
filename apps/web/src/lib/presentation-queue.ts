import type { Printing } from "@openrift/shared";

/**
 * Upper bound on how many printings a `?cards=` queue may carry. Keeps a
 * hand-edited or pathological URL from building a strip of thousands of
 * thumbnails, and keeps the URL itself inside what proxies will forward.
 */
export const MAX_QUEUE_LENGTH = 60;

/**
 * Resolves the queue's printing ids against the catalog, preserving the order
 * the ids were given in. Ids the catalog doesn't know (a stale bookmark, a
 * printing that was removed) are dropped rather than rendering a hole, and a
 * repeated id is kept — a creator may legitimately want to come back to a card
 * later in the same run.
 *
 * @returns The resolved printings, in queue order.
 */
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

/**
 * Clamps a URL-supplied index into the queue's bounds. An out-of-range `i`
 * (deck edited since the link was made, hand-typed number) lands on the
 * nearest real card instead of a blank stage.
 *
 * @returns A valid index, or 0 when the queue is empty.
 */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  if (!Number.isFinite(index)) {
    return 0;
  }
  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
}

/**
 * Next index when stepping through the queue. Stops at both ends rather than
 * wrapping: on stream, silently looping back to the first card reads as the
 * app having lost its place.
 *
 * @returns The index to move to, unchanged at the ends.
 */
export function stepIndex(index: number, length: number, delta: number): number {
  return clampIndex(index + delta, length);
}
