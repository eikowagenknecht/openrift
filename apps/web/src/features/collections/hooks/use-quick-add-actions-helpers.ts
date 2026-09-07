import { copyHasMetadata } from "@openrift/shared/copy-metadata";
import type { CopyResponse } from "@openrift/shared/types/api/collection";

import { isTempCopyId } from "@/features/collections/lib/temp-copy-id";

// Copy ids are uuidv7, so lexicographic id ordering matches creation order.
export function pickNewestCopy(copies: readonly CopyResponse[]): CopyResponse | undefined {
  if (copies.length === 0) {
    return undefined;
  }
  return copies.toSorted((a, b) => b.id.localeCompare(a.id))[0];
}

// Prefers the newest copy without recorded details, so conditions/notes survive
// routine count adjustments. Trade-reserved copies are never candidates.
export function pickRemovalCopy(copies: readonly CopyResponse[]): CopyResponse | undefined {
  const removable = copies.filter((copy) => !copy.reserved);
  const bare = removable.filter((copy) => !copyHasMetadata(copy));
  return pickNewestCopy(bare.length > 0 ? bare : removable);
}

type RemovalDecision =
  | { kind: "none" }
  | { kind: "dispose"; copyId: string }
  | { kind: "confirmDispose"; copyId: string }
  | { kind: "picker" };

// Single collection: dispose the newest bare copy, or confirm when only
// annotated copies remain. Multiple collections: open the picker.
export function decideRemoval(
  allCopies: readonly CopyResponse[],
  printingId: string,
  viewCollectionId?: string,
): RemovalDecision {
  const filtered = allCopies.filter((c) => {
    if (c.printingId !== printingId) {
      return false;
    }
    // Optimistic temp rows aren't real copies; dispose would 400 on the API or
    // race the in-flight add.
    if (isTempCopyId(c.id)) {
      return false;
    }
    if (viewCollectionId) {
      return c.collectionId === viewCollectionId;
    }
    // Unscoped: personal copies only (group copies aren't the viewer's).
    return c.groupId === null;
  });
  if (filtered.length === 0) {
    return { kind: "none" };
  }
  const collectionIds = new Set(filtered.map((c) => c.collectionId));
  if (collectionIds.size === 1) {
    const candidate = pickRemovalCopy(filtered);
    if (!candidate) {
      return { kind: "none" };
    }
    return copyHasMetadata(candidate)
      ? { kind: "confirmDispose", copyId: candidate.id }
      : { kind: "dispose", copyId: candidate.id };
  }
  return { kind: "picker" };
}
