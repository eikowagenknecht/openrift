import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";

export function otherMissingImages(
  items: readonly MissingImagePrinting[],
  currentPrintingId: string,
): MissingImagePrinting[] {
  return items.filter((item) => item.printingId !== currentPrintingId);
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
