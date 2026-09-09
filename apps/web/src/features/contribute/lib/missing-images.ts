import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";

export function otherMissingImages(
  items: readonly MissingImagePrinting[],
  currentPrintingId: string,
): MissingImagePrinting[] {
  return items.filter((item) => item.printingId !== currentPrintingId);
}
