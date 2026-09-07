import type { ProductCoverCard, ProductSummary } from "@openrift/shared/contracts/products";

import type { ProductCoverRow, ProductWithCounts } from "../repositories/products.js";

export function toProductSummary(
  product: ProductWithCounts,
  coverCards: ProductCoverCard[],
): ProductSummary {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    // The join guarantees slug and name whenever setId is present.
    set:
      product.setId !== null && product.setSlug !== null && product.setName !== null
        ? { id: product.setId, slug: product.setSlug, name: product.setName }
        : null,
    printingCount: product.printingCount,
    cardTotal: product.cardTotal,
    coverCards,
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function toCoverCards(rows: ProductCoverRow[] = []): ProductCoverCard[] {
  return rows.map(({ printingId, imageId, name }) => ({ printingId, imageId, name }));
}
