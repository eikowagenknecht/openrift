/** "Added N× Card Name" for a single-printing batch, "Added N cards" otherwise. */
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
