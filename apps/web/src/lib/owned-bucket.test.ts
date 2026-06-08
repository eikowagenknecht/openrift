import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";

import {
  applyOwnedBucketFilter,
  applyOwnedCountFilter,
  bucketFor,
  maxOwnedCount,
} from "./owned-bucket";

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

describe("applyOwnedCountFilter", () => {
  it("keeps cards whose owned total is within an inclusive range", () => {
    const one = stubPrinting();
    const three = stubPrinting();
    const five = stubPrinting();
    const counts = { [one.id]: 1, [three.id]: 3, [five.id]: 5 };

    const result = applyOwnedCountFilter([one, three, five], 2, 4, counts);

    expect(result.map((p) => p.id)).toEqual([three.id]);
  });

  it("treats a null min as zero-and-up and a null max as no upper limit", () => {
    const zero = stubPrinting();
    const two = stubPrinting();
    const ten = stubPrinting();
    const counts = { [zero.id]: 0, [two.id]: 2, [ten.id]: 10 };

    // min only: everything with at least 2 copies.
    expect(applyOwnedCountFilter([zero, two, ten], 2, null, counts).map((p) => p.id)).toEqual([
      two.id,
      ten.id,
    ]);
    // max only: everything with at most 2 copies (includes the unowned card).
    expect(applyOwnedCountFilter([zero, two, ten], null, 2, counts).map((p) => p.id)).toEqual([
      zero.id,
      two.id,
    ]);
    // both null: no constraint.
    expect(applyOwnedCountFilter([zero, two, ten], null, null, counts)).toHaveLength(3);
  });

  it("aggregates copies across variants in card mode but ranges each printing in printing mode", () => {
    // One card, two variants: 2 + 1 = 3 copies total.
    const cardId = "card-foo";
    const variantA = stubPrinting({ cardId });
    const variantB = stubPrinting({ cardId });
    const counts = { [variantA.id]: 2, [variantB.id]: 1 };

    // Card mode: the card's total (3) is in range, so both variants survive.
    expect(applyOwnedCountFilter([variantA, variantB], 3, 3, counts)).toHaveLength(2);
    // Printing mode: only variantA (2 copies) falls in [2, 2].
    expect(
      applyOwnedCountFilter([variantA, variantB], 2, 2, counts, "printing").map((p) => p.id),
    ).toEqual([variantA.id]);
  });

  it("treats a missing count as zero copies owned", () => {
    const tracked = stubPrinting();
    const untracked = stubPrinting();

    // Only `tracked` is in the map; `untracked` defaults to 0 and is excluded
    // by a min of 1.
    expect(
      applyOwnedCountFilter([tracked, untracked], 1, null, { [tracked.id]: 1 }).map((p) => p.id),
    ).toEqual([tracked.id]);
  });
});

describe("maxOwnedCount", () => {
  it("returns 0 when nothing is owned", () => {
    const printing = stubPrinting();
    expect(maxOwnedCount([printing], {})).toBe(0);
    expect(maxOwnedCount([], { whatever: 5 })).toBe(0);
  });

  it("returns the largest per-card total in card mode (summed across variants)", () => {
    const cardId = "card-foo";
    const variantA = stubPrinting({ cardId });
    const variantB = stubPrinting({ cardId });
    const other = stubPrinting();
    const counts = { [variantA.id]: 2, [variantB.id]: 3, [other.id]: 4 };

    // card-foo totals 5 across its two variants, beating `other`'s 4.
    expect(maxOwnedCount([variantA, variantB, other], counts)).toBe(5);
  });

  it("returns the largest single-printing count in printing mode", () => {
    const cardId = "card-foo";
    const variantA = stubPrinting({ cardId });
    const variantB = stubPrinting({ cardId });
    const counts = { [variantA.id]: 2, [variantB.id]: 3 };

    // Printing mode never sums variants, so the max is the largest single count.
    expect(maxOwnedCount([variantA, variantB], counts, "printing")).toBe(3);
  });
});
