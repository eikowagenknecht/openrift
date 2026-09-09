import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";

export interface NextMissingImage {
  next: MissingImagePrinting | null;
  remaining: number;
}

export function nextMissingImage(
  items: readonly MissingImagePrinting[],
  currentPrintingId: string,
): NextMissingImage {
  const others = items.filter((item) => item.printingId !== currentPrintingId);
  const first = others[0];
  if (first === undefined) {
    return { next: null, remaining: 0 };
  }
  const currentIndex = items.findIndex((item) => item.printingId === currentPrintingId);
  const after = items.slice(currentIndex + 1).find((item) => item.printingId !== currentPrintingId);
  return { next: after ?? first, remaining: others.length };
}

export function remainingMissingImagesLine(remaining: number): string | null {
  if (remaining <= 0) {
    return null;
  }
  if (remaining === 1) {
    return "1 more card you own has no image yet";
  }
  return `${remaining} more cards you own have no image yet`;
}
