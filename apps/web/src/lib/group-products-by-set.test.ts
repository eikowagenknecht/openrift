import type { ProductSet, ProductSummary } from "@openrift/shared/contracts";
import { describe, expect, it } from "vitest";

import { groupProductsBySet } from "./group-products-by-set";

let idCounter = 0;

function stubProduct(overrides: Partial<ProductSummary> = {}): ProductSummary {
  idCounter++;
  return {
    id: `00000000-0000-0000-0000-${String(idCounter).padStart(12, "0")}`,
    slug: `product-${idCounter}`,
    name: `Product ${idCounter}`,
    description: null,
    set: null,
    printingCount: 16,
    cardTotal: 16,
    coverCards: [],
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const OGN: ProductSet = { id: "set-ogn", slug: "OGN", name: "Origins" };
const SFD: ProductSet = { id: "set-sfd", slug: "SFD", name: "Spirit Forged" };

describe("groupProductsBySet", () => {
  it("returns no groups for an empty input", () => {
    expect(groupProductsBySet([])).toEqual([]);
  });

  it("groups consecutive products by set, preserving input order", () => {
    const a = stubProduct({ set: OGN });
    const b = stubProduct({ set: SFD });
    const c = stubProduct({ set: SFD });
    const groups = groupProductsBySet([a, b, c]);
    expect(groups.map((g) => g.set?.name)).toEqual(["Origins", "Spirit Forged"]);
    expect(groups[1]?.products).toEqual([b, c]);
  });

  it("collapses products without a set into one trailing group", () => {
    const noSetA = stubProduct();
    const withSet = stubProduct({ set: OGN });
    const noSetB = stubProduct();
    const groups = groupProductsBySet([noSetA, withSet, noSetB]);
    expect(groups.map((g) => g.set)).toEqual([OGN, null]);
    expect(groups[1]?.products).toEqual([noSetA, noSetB]);
  });

  it("keeps set groups in input order even when the no-set group comes first", () => {
    const noSet = stubProduct();
    const sfd = stubProduct({ set: SFD });
    const ogn = stubProduct({ set: OGN });
    const groups = groupProductsBySet([noSet, sfd, ogn]);
    expect(groups.map((g) => g.set?.name ?? "other")).toEqual([
      "Spirit Forged",
      "Origins",
      "other",
    ]);
  });

  it("returns a single null-set group when no product has a set", () => {
    const groups = groupProductsBySet([stubProduct(), stubProduct()]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.set).toBeNull();
    expect(groups[0]?.products).toHaveLength(2);
  });
});
