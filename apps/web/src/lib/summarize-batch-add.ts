/**
 * Build a user-facing summary for a batch of copy adds. A batch can repeat
 * the same printing (Enter held) or mix different printings (several clicks).
 * @returns "Added N× Card Name" when the batch targets a single printing,
 *   "Added N cards" otherwise. Returns null when the batch is empty.
 */
export function summarizeBatchAdd(
  printingIds: string[],
  nameById: (printingId: string) => string | undefined,
): string | null {
  if (printingIds.length === 0) {
    return null;
  }
  const first = printingIds[0];
  const allSame = printingIds.every((id) => id === first);
  if (allSame) {
    const name = nameById(first) ?? "card";
    return `Added ${printingIds.length}× ${name}`;
  }
  return `Added ${printingIds.length} cards`;
}
