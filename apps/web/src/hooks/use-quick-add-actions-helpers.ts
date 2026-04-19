import type { CopyResponse } from "@openrift/shared";

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

type RemovalDecision = { kind: "none" } | { kind: "dispose"; copyId: string } | { kind: "picker" };

/**
 * Decides what the minus button should do given the user's copies of a
 * printing. When scoped to a single collection (viewCollectionId set), only
 * copies in that collection are considered. Single collection → silent
 * dispose of the newest. Multiple collections → open the picker.
 * @returns The removal decision for the caller to act on.
 */
export function decideRemoval(
  allCopies: readonly CopyResponse[],
  printingId: string,
  viewCollectionId?: string,
): RemovalDecision {
  const filtered = allCopies.filter((c) => {
    if (c.printingId !== printingId) {
      return false;
    }
    return viewCollectionId ? c.collectionId === viewCollectionId : true;
  });
  if (filtered.length === 0) {
    return { kind: "none" };
  }
  const collectionIds = new Set(filtered.map((c) => c.collectionId));
  if (collectionIds.size === 1) {
    const newest = pickNewestCopy(filtered);
    return newest ? { kind: "dispose", copyId: newest.id } : { kind: "none" };
  }
  return { kind: "picker" };
}
