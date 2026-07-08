import type { ProductSummary } from "@openrift/shared/contracts";

import type { ProductWithCounts } from "../repositories/products.js";

/** @returns The API response shape for a product row with counts. */
export function toProductSummary(product: ProductWithCounts): ProductSummary {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    printingCount: product.printingCount,
    cardTotal: product.cardTotal,
    updatedAt: product.updatedAt.toISOString(),
  };
}
