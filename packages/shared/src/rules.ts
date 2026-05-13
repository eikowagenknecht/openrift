/**
 * Compares two rule numbers in their natural numeric/alphabetic order so that
 * `100 < 100.1 < 100.1.a < 200 < 1000`. Each dot-separated segment is parsed
 * as a number when possible; pure-digit segments sort before letter segments
 * at the same depth.
 *
 * @returns Negative if a < b, positive if a > b, 0 if equal.
 */
export function compareRuleNumbers(a: string, b: string): number {
  const partsA = a.split(".");
  const partsB = b.split(".");
  const len = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const partA = partsA[i];
    const partB = partsB[i];
    const numA = Number(partA);
    const numB = Number(partB);
    const aIsNum = !Number.isNaN(numA) && partA !== "";
    const bIsNum = !Number.isNaN(numB) && partB !== "";
    if (aIsNum && bIsNum) {
      if (numA !== numB) {
        return numA - numB;
      }
    } else if (aIsNum) {
      return -1;
    } else if (bIsNum) {
      return 1;
    } else {
      const cmp = partA.localeCompare(partB);
      if (cmp !== 0) {
        return cmp;
      }
    }
  }
  return partsA.length - partsB.length;
}
