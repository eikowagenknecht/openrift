export const LIST_TARGET_PREFIX = "list:";

export const NEW_COLLECTION_TARGET = "__new__";

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

export function copyIdsInCollection(
  copies: readonly { id: string; collectionId: string }[],
  collectionId: string,
): string[] {
  return copies.filter((copy) => copy.collectionId === collectionId).map((copy) => copy.id);
}
