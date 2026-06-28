/**
 * Per-variant owned counts for the variant add/remove popover.
 *
 * The popover must show the same number the owned badge shows. On a specific
 * collection page (`collectionId` set) that is the in-collection count, which
 * `stackByPrintingId` already holds (its copies are scoped to that collection).
 * On the All Cards view (`collectionId` undefined) the badge is personal-only —
 * copies in the viewer's friend-group collections belong to the group, not the
 * viewer — so the count must come from the personal-only `personalCounts` map
 * (see `aggregateTotals`), NOT from `stackByPrintingId`, which stacks every
 * visible copy including group ones and would over-count.
 */

interface VariantStack {
  copyIds: readonly string[];
}

/**
 * Build the `ownedCounts` map the variant popover renders, matching the
 * owned-badge semantics for the current scope.
 * @returns A printingId → owned-count record for the given printings.
 */
export function buildVariantOwnedCounts(
  printings: readonly { id: string }[],
  collectionId: string | undefined,
  personalCounts: Record<string, number>,
  stackByPrintingId: ReadonlyMap<string, VariantStack>,
): Record<string, number> {
  return Object.fromEntries(
    printings.map((printing) => [
      printing.id,
      collectionId === undefined
        ? (personalCounts[printing.id] ?? 0)
        : (stackByPrintingId.get(printing.id)?.copyIds.length ?? 0),
    ]),
  );
}
