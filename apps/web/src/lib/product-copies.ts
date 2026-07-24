import type { ProductDetailResponse } from "@openrift/shared/contracts";

/** One row of the POST /copies payload built from a product's contents. */
export interface ProductCopyRow {
  printingId: string;
  collectionId: string;
}

/** POST /copies accepts at most 500 copies per request. */
export const PRODUCT_COPY_BATCH_SIZE = 500;

/**
 * Total number of physical cards `productCount` copies of a product contain.
 * Non-positive or fractional counts are clamped the same way
 * {@link expandProductContents} clamps them, so the summary the dialog shows
 * always matches what a confirm would add.
 * @returns The card total.
 */
export function productCopyTotal(
  contents: ProductDetailResponse["contents"],
  productCount: number,
): number {
  const kits = Math.max(0, Math.floor(productCount));
  return kits * contents.reduce((sum, content) => sum + content.quantity, 0);
}

/**
 * Expands a product's `{printingId, quantity}` manifest into individual copy
 * rows for POST /copies — one row per physical card, repeated for each of the
 * `productCount` copies of the product the user owns.
 * @returns The copy rows, ready to batch with {@link chunkProductCopies}.
 */
export function expandProductContents(
  contents: ProductDetailResponse["contents"],
  collectionId: string,
  productCount: number,
): ProductCopyRow[] {
  const kits = Math.max(0, Math.floor(productCount));
  const rows: ProductCopyRow[] = [];
  for (let kit = 0; kit < kits; kit++) {
    for (const content of contents) {
      for (let index = 0; index < content.quantity; index++) {
        rows.push({ printingId: content.printingId, collectionId });
      }
    }
  }
  return rows;
}

/**
 * Splits copy rows into batches the add endpoint accepts (max 500 per call).
 * @returns The batches, in order; empty input yields no batches.
 */
export function chunkProductCopies(rows: ProductCopyRow[]): ProductCopyRow[][] {
  const batches: ProductCopyRow[][] = [];
  for (let offset = 0; offset < rows.length; offset += PRODUCT_COPY_BATCH_SIZE) {
    batches.push(rows.slice(offset, offset + PRODUCT_COPY_BATCH_SIZE));
  }
  return batches;
}
