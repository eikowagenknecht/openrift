import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";

import { applyOwnedBucketFilter, bucketFor } from "./owned-bucket";

beforeEach(() => {
  resetIdCounter();
});

describe("bucketFor", () => {
  it("returns 'none' when no copies are owned", () => {
    expect(bucketFor(0, 3)).toBe("none");
  });

  it("returns 'partial' when below a full playset", () => {
    expect(bucketFor(1, 3)).toBe("partial");
    expect(bucketFor(2, 3)).toBe("partial");
  });

  it("returns 'full' when exactly at the playset size", () => {
    expect(bucketFor(3, 3)).toBe("full");
    expect(bucketFor(1, 1)).toBe("full");
  });

  it("returns 'extra' when over the playset size", () => {
    expect(bucketFor(4, 3)).toBe("extra");
    expect(bucketFor(2, 1)).toBe("extra");
  });

  it("never returns 'partial' for size-1 cards", () => {
    // Legends, battlefields, and [Unique] keyword cards have playset size 1 —
    // there is no intermediate state between "none" and "full".
    expect(bucketFor(0, 1)).toBe("none");
    expect(bucketFor(1, 1)).toBe("full");
    expect(bucketFor(2, 1)).toBe("extra");
  });
});

describe("applyOwnedBucketFilter", () => {
  it("returns nothing when no buckets are selected", () => {
    const printing = stubPrinting();
    expect(applyOwnedBucketFilter([printing], [], { [printing.id]: 1 })).toEqual([]);
  });

  it("aggregates copies across all variants of the same card", () => {
    // Two printings of the same card with 2 + 1 copies = full playset of 3.
    // Both printings should survive a "full" filter — this is option (c).
    const cardId = "card-foo";
    const variantA = stubPrinting({ cardId });
    const variantB = stubPrinting({ cardId });

    const result = applyOwnedBucketFilter([variantA, variantB], ["full"], {
      [variantA.id]: 2,
      [variantB.id]: 1,
    });

    expect(result.map((p) => p.id).toSorted()).toEqual([variantA.id, variantB.id].toSorted());
  });

  it("excludes cards whose bucket isn't in the selection", () => {
    const empty = stubPrinting();
    const full = stubPrinting();

    const result = applyOwnedBucketFilter([empty, full], ["partial"], {
      [empty.id]: 0,
      [full.id]: 3,
    });

    expect(result).toEqual([]);
  });

  it("respects per-card-type playset sizes when bucketing", () => {
    // Legends have playset size 1 — owning one copy is "full", not "extra".
    const legend = stubPrinting({ card: { type: "legend", keywords: [] } });

    const fullResult = applyOwnedBucketFilter([legend], ["full"], { [legend.id]: 1 });
    const extraResult = applyOwnedBucketFilter([legend], ["extra"], { [legend.id]: 1 });

    expect(fullResult).toHaveLength(1);
    expect(extraResult).toHaveLength(0);
  });
});

describe("applyOwnedBucketFilter — per-printing bucketing", () => {
  it("excludes a 0-owned variant even when another variant of the card is owned", () => {
    // The printings-view bug: selecting every bucket but "none" should hide
    // unowned printings, not surface them because a sibling variant is owned.
    const cardId = "card-foo";
    const owned = stubPrinting({ cardId });
    const unowned = stubPrinting({ cardId });

    const result = applyOwnedBucketFilter(
      [owned, unowned],
      ["partial", "full", "extra"],
      { [owned.id]: 1, [unowned.id]: 0 },
      "printing",
    );

    expect(result.map((p) => p.id)).toEqual([owned.id]);
  });

  it("buckets each printing on its own owned count", () => {
    const cardId = "card-foo";
    const partial = stubPrinting({ cardId });
    const full = stubPrinting({ cardId });

    expect(
      applyOwnedBucketFilter(
        [partial, full],
        ["partial"],
        {
          [partial.id]: 1,
          [full.id]: 3,
        },
        "printing",
      ).map((p) => p.id),
    ).toEqual([partial.id]);
    expect(
      applyOwnedBucketFilter(
        [partial, full],
        ["full"],
        {
          [partial.id]: 1,
          [full.id]: 3,
        },
        "printing",
      ).map((p) => p.id),
    ).toEqual([full.id]);
  });

  it("contrasts with card mode, which keeps both variants of a partly-owned card", () => {
    const cardId = "card-foo";
    const owned = stubPrinting({ cardId });
    const unowned = stubPrinting({ cardId });
    const counts = { [owned.id]: 1, [unowned.id]: 0 };

    // Default (card) mode: the card is "partial", so both variants survive.
    expect(applyOwnedBucketFilter([owned, unowned], ["partial"], counts)).toHaveLength(2);
    // Printing mode: only the owned variant survives.
    expect(applyOwnedBucketFilter([owned, unowned], ["partial"], counts, "printing")).toHaveLength(
      1,
    );
  });
});
