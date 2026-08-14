import type { Printing } from "@openrift/shared";

/**
 * One stop in a presentation run.
 *
 * Deliberately not `CardViewerItem`: that type carries grid concerns (the deck
 * zone the highlight anchors at, the holding collection) that mean nothing on a
 * stage, and it has no room for the corner marker's context line. What that
 * line says is the source's business — a deck walk puts the zone there, a tier
 * list puts the tier — so the stage never has to know where its queue came from.
 *
 * It stays structurally assignable to `CardViewerItem`, so a queue built here
 * can still feed the detail overlay on a surface that has one.
 */
export interface PresentationItem {
  /** Unique key for this stop. A printing may appear more than once in a run. */
  id: string;
  printing: Printing;
  /** Short context for the corner marker, e.g. "Main deck" or "S". */
  contextLabel?: string;
}

/**
 * Upper bound on how many printings a `?cards=` queue may carry. Keeps a
 * hand-edited or pathological URL from building a strip of thousands of
 * thumbnails, and keeps the URL itself inside what proxies will forward.
 *
 * Only the ad-hoc queue is bounded, because only it spells every printing id
 * out in the URL. A `?deck=` walk carries one id and resolves the cards from
 * the catalog, so a deck of any size presents in full.
 *
 * 120 ids is roughly 5.4KB once JSON-encoded and percent-escaped, which stays
 * inside nginx's stock 8KB `large_client_header_buffers` with room for the
 * rest of the request line. Raise it further only alongside a proxy that is
 * known to accept the longer URL.
 */
export const MAX_QUEUE_LENGTH = 120;

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

/** The outcome of filling a queue from a source, for the caller's message. */
export interface QueueAppendResult {
  /** The queue after the append, truncated at the cap. */
  ids: string[];
  /** How many of `incoming` landed. */
  added: number;
  /** How many the queue had no room for. */
  dropped: number;
}

/**
 * Appends a batch of printing ids to a queue, stopping at the cap.
 *
 * Duplicates are kept: a source may legitimately contribute a card the creator
 * already queued by hand, and the queue allows repeats anyway. The counts come
 * back with the new list so the caller can say what happened — a partial add is
 * the one outcome a creator must not discover mid-stream.
 *
 * @returns The new queue and how many ids landed versus were dropped.
 */
export function appendToQueue(
  current: readonly string[],
  incoming: readonly string[],
  cap: number = MAX_QUEUE_LENGTH,
): QueueAppendResult {
  const room = Math.max(cap - current.length, 0);
  const taken = incoming.slice(0, room);
  return {
    ids: [...current, ...taken],
    added: taken.length,
    dropped: incoming.length - taken.length,
  };
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
