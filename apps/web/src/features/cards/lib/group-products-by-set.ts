import type { ProductSet, ProductSummary } from "@openrift/shared/contracts/products";

const NO_SET_KEY = "no-set";

export interface ProductSetGroup {
  key: string;
  set: ProductSet | null;
  products: ProductSummary[];
}

export function groupProductsBySet(products: ProductSummary[]): ProductSetGroup[] {
  const byKey = Map.groupBy(products, (product) => product.set?.id ?? NO_SET_KEY);
  const groups = [...byKey.entries()].map(([key, grouped]) => ({
    key,
    set: grouped[0]?.set ?? null,
    products: grouped,
  }));
  return groups.toSorted((a, b) => Number(a.set === null) - Number(b.set === null));
}
