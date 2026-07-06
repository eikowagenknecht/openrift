/**
 * Helpers for the import flow's "replace vs add" choice when a target
 * collection already holds cards. Kept pure (no hooks) so they're unit-testable
 * and free of the React graph — {@link isReplaceableTarget} decides whether to
 * prompt, {@link copyIdsInCollection} collects the copies a replace disposes.
 */

/** Prefix marking a target-select value as a list (vs a collection id or `__new__`). */
export const LIST_TARGET_PREFIX = "list:";

/** The sentinel target value for "+ Create new collection". */
export const NEW_COLLECTION_TARGET = "__new__";

/**
 * Whether importing into this target could overwrite existing cards — i.e. the
 * target is an existing, non-empty collection. Lists (additive only), the
 * "create new" sentinel (always empty), and the empty selection never qualify,
 * so the replace prompt is only offered when there is actually something to
 * replace.
 * @returns True when the selected target is an existing collection that already has copies.
 */
export function isReplaceableTarget(
  collectionId: string,
  collections: readonly { id: string; copyCount: number }[],
): boolean {
  if (
    collectionId === "" ||
    collectionId === NEW_COLLECTION_TARGET ||
    collectionId.startsWith(LIST_TARGET_PREFIX)
  ) {
    return false;
  }
  const target = collections.find((col) => col.id === collectionId);
  return (target?.copyCount ?? 0) > 0;
}

/**
 * The ids of every copy currently in `collectionId`, drawn from the synced
 * copies store. These are the rows a "replace" disposes before the import adds
 * the new copies on top.
 * @returns The copy ids belonging to the given collection.
 */
export function copyIdsInCollection(
  copies: readonly { id: string; collectionId: string }[],
  collectionId: string,
): string[] {
  return copies.filter((copy) => copy.collectionId === collectionId).map((copy) => copy.id);
}
