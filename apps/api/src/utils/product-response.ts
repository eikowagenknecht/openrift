import type { ProductCoverCard, ProductSummary } from "@openrift/shared/contracts";

import type { ProductCoverRow, ProductWithCounts } from "../repositories/products.js";

/** @returns The API response shape for a product row with counts. */
export function toProductSummary(
  product: ProductWithCounts,
  coverCards: ProductCoverCard[],
): ProductSummary {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    printingCount: product.printingCount,
    cardTotal: product.cardTotal,
    coverCards,
    updatedAt: product.updatedAt.toISOString(),
  };
}

/** @returns Repo cover rows mapped to the response shape (productId dropped). */
export function toCoverCards(rows: ProductCoverRow[] = []): ProductCoverCard[] {
  return rows.map(({ printingId, imageId, name }) => ({ printingId, imageId, name }));
}
