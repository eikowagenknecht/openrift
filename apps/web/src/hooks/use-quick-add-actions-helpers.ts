import type { CopyResponse } from "@openrift/shared";
import { copyHasMetadata } from "@openrift/shared";

import type { CopyViewRow } from "@/lib/copies-collection";

/**
 * Picks the newest copy among the given copies. Copy ids are uuidv7, so
 * lexicographic id ordering matches creation order.
 * @returns The newest copy, or undefined if the list is empty.
 */
export function pickNewestCopy(copies: readonly CopyResponse[]): CopyResponse | undefined {
  if (copies.length === 0) {
    return undefined;
  }
  return copies.toSorted((a, b) => b.id.localeCompare(a.id))[0];
}

/**
 * Picks the copy the minus button should remove: the newest copy WITHOUT
 * recorded details (ADR-038), so conditions/notes survive routine count
 * adjustments. Only when every copy is annotated does it fall back to the
 * newest annotated one — callers confirm that removal with the user.
 * @returns The removal candidate, or undefined if the list is empty.
 */
export function pickRemovalCopy(copies: readonly CopyResponse[]): CopyResponse | undefined {
  const bare = copies.filter((copy) => !copyHasMetadata(copy));
  return pickNewestCopy(bare.length > 0 ? bare : copies);
}

type RemovalDecision =
  | { kind: "none" }
  | { kind: "dispose"; copyId: string }
  // The only removable copies carry recorded details (ADR-038) — the caller
  // must ask before destroying them.
  | { kind: "confirmDispose"; copyId: string }
  | { kind: "picker" };

/**
 * Decides what the minus button should do given the user's copies of a
 * printing. When scoped to a single collection (viewCollectionId set), only
 * copies in that collection are considered. When unscoped (All Cards view),
 * only the viewer's personal copies are considered — copies in a friend-group
 * collection belong to the group, not the viewer, so the personal minus must
 * not remove them (matching the personal-only owned badge). Single collection →
 * silent dispose of the newest bare copy, or a confirm request when only
 * annotated copies remain (ADR-038). Multiple collections → open the picker.
 * @returns The removal decision for the caller to act on.
 */
export function decideRemoval(
  allCopies: readonly CopyViewRow[],
  printingId: string,
  viewCollectionId?: string,
): RemovalDecision {
  const filtered = allCopies.filter((c) => {
    if (c.printingId !== printingId) {
      return false;
    }
    // Unsynced rows are optimistic overlays whose add hasn't round-tripped
    // yet; the minus button must not target them, or dispose would 404 on
    // the API (the server doesn't know the id yet) or race with the
    // in-flight add and "delete" a row that then comes back when it commits.
    if (!c.synced) {
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
