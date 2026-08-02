import type { ProductSet, ProductSummary } from "@openrift/shared/contracts/products";

/** Grouping key for products without a set (set ids are UUIDs, no collision). */
const NO_SET_KEY = "no-set";

/** One /products index section: a set (or none) and its products. */
export interface ProductSetGroup {
  key: string;
  set: ProductSet | null;
  products: ProductSummary[];
}

/**
 * Groups products into /products index sections by their set, preserving the
 * API's product ordering (set release order, then name). Products without a
 * set collapse into a single `set: null` group that always sorts last.
 *
 * @returns The ordered groups; empty for an empty input.
 */
export function groupProductsBySet(products: ProductSummary[]): ProductSetGroup[] {
  const byKey = Map.groupBy(products, (product) => product.set?.id ?? NO_SET_KEY);
  const groups = [...byKey.entries()].map(([key, grouped]) => ({
    key,
    set: grouped[0]?.set ?? null,
    products: grouped,
  }));
  // The API already orders products without a set last; re-assert it here so
  // the "Other products" section can't drift into the middle.
  return groups.toSorted((a, b) => Number(a.set === null) - Number(b.set === null));
}
