import type { CopyResponse } from "@openrift/shared";

import { isTempCopyId } from "@/lib/temp-copy-id";

/** Sentinel `moveFrom` value meaning "any collection except the target". Collection ids are uuids, so this can't collide. */
export const MOVE_FROM_ANYWHERE = "anywhere";

export interface MoveSource {
  collectionId: string;
  /** Copy ids ordered plainest-first — index 0 is the next copy to move. */
  copyIds: string[];
}

interface MovableScope {
  /** The move target — copies already there are never movable. */
  excludeCollectionId: string;
  /** Restrict sources to one collection; omit for "move from anywhere". */
  onlyCollectionId?: string;
}

/**
 * Groups the viewer's movable copies by printing. Drops copies already in the
 * target collection, copies reserved by a live trade (the move API rejects the
 * whole batch for them), and optimistic temp rows still in flight from a
 * batched add (their ids aren't valid uuids yet).
 * @returns Map of printingId → movable copies (unordered).
 */
export function groupMovableCopies(
  copies: readonly CopyResponse[],
  scope: MovableScope,
): Map<string, CopyResponse[]> {
  const movable = copies.filter(
    (copy) =>
      copy.collectionId !== scope.excludeCollectionId &&
      (scope.onlyCollectionId === undefined || copy.collectionId === scope.onlyCollectionId) &&
      !copy.reserved &&
      !isTempCopyId(copy.id),
  );
  return Map.groupBy(movable, (copy) => copy.printingId);
}

/**
 * How much metadata a copy carries. The palette moves the "plainest" copy
 * first so graded, noted, or altered copies stay where the user filed them
 * unless nothing else is left. On-loan copies weigh heaviest — they're still
 * owned but physically absent, so they only move as a last resort.
 * @returns The weight; lower means plainer.
 */
function metadataWeight(copy: CopyResponse): number {
  let weight = 0;
  if (copy.condition !== null) {
    weight += 1;
  }
  if (copy.grader !== null || copy.grade !== null) {
    weight += 2;
  }
  if (copy.notesPublic !== null) {
    weight += 2;
  }
  if (copy.notesPrivate !== null) {
    weight += 2;
  }
  if (copy.isAltered) {
    weight += 2;
  }
  if (copy.links.length > 0) {
    weight += 2;
  }
  if (copy.onLoan) {
    weight += 100;
  }
  return weight;
}

/**
 * Orders one printing's movable copies into per-collection sources: inbox
 * first, then the largest stash, id as a stable tiebreak. Within each source,
 * copies are ordered plainest-first (see {@link metadataWeight}).
 * @returns The sources; `sources[0].copyIds[0]` is the default copy to move.
 */
export function buildMoveSources(copies: readonly CopyResponse[], inboxId?: string): MoveSource[] {
  const bySource = Map.groupBy(copies, (copy) => copy.collectionId);
  return [...bySource.entries()]
    .map(([collectionId, group]) => ({
      collectionId,
      copyIds: group
        .toSorted((a, b) => metadataWeight(a) - metadataWeight(b) || a.id.localeCompare(b.id))
        .map((copy) => copy.id),
    }))
    .toSorted((a, b) => {
      if ((a.collectionId === inboxId) !== (b.collectionId === inboxId)) {
        return a.collectionId === inboxId ? -1 : 1;
      }
      return b.copyIds.length - a.copyIds.length || a.collectionId.localeCompare(b.collectionId);
    });
}

/**
 * Collapses a movable-copies map into per-printing counts, in the shape the
 * quick-add search expects for its owned-count badges.
 * @returns Record of printingId → movable copy count.
 */
export function movableCountsByPrinting(
  grouped: Map<string, CopyResponse[]>,
): Record<string, number> {
  return Object.fromEntries(
    [...grouped.entries()].map(([printingId, list]) => [printingId, list.length]),
  );
}
