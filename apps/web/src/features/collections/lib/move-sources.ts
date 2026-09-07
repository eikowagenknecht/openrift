import { copyMetadataWeight } from "@openrift/shared/copy-metadata";
import type { CopyResponse } from "@openrift/shared/types/api/collection";

import { isTempCopyId } from "@/features/collections/lib/temp-copy-id";

export const MOVE_FROM_ANYWHERE = "anywhere";

export interface MoveSource {
  collectionId: string;
  copyIds: string[];
}

interface MovableScope {
  excludeCollectionId: string;
  onlyCollectionId?: string;
}

/**
 * Drops copies already in the target, ones reserved by a live trade (the move
 * API rejects the whole batch for them), and temp rows still in flight from a batched add.
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

/** Moves the "plainest" copy first; graded, noted, or altered copies stay put unless nothing else is left. */
function metadataWeight(copy: CopyResponse): number {
  return copyMetadataWeight(copy) + (copy.onLoan ? 100 : 0);
}

/** Orders sources inbox-first, then largest stash; `sources[0].copyIds[0]` is the default copy to move. */
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

export function movableCountsByPrinting(
  grouped: Map<string, CopyResponse[]>,
): Record<string, number> {
  return Object.fromEntries(
    [...grouped.entries()].map(([printingId, list]) => [printingId, list.length]),
  );
}
