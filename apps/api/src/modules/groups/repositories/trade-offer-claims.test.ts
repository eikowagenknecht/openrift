import { describe, expect, it } from "vitest";

import { claimCopiesForOffers } from "./trade-offer-claims.js";

function offer(
  id: string,
  groupId: string,
  quantity = 1,
): { id: string; groupId: string; quantity: number } {
  return { id, groupId, quantity };
}

describe("claimCopiesForOffers", () => {
  it("claims nothing when there are no offers", () => {
    const { claimed, unfillable } = claimCopiesForOffers([], new Map([["g", ["cp-1"]]]));
    expect(claimed.size).toBe(0);
    expect(unfillable).toEqual([]);
  });

  it("claims one copy per single-quantity offer, oldest first", () => {
    const { claimed, unfillable } = claimCopiesForOffers(
      [offer("t-1", "g"), offer("t-2", "g")],
      new Map([["g", ["cp-1", "cp-2", "cp-3"]]]),
    );
    expect([...claimed]).toEqual(["cp-1", "cp-2"]);
    expect(unfillable).toEqual([]);
  });

  it("claims as many copies as the offer promises", () => {
    const { claimed } = claimCopiesForOffers(
      [offer("t-1", "g", 2)],
      new Map([["g", ["cp-1", "cp-2", "cp-3"]]]),
    );
    expect([...claimed]).toEqual(["cp-1", "cp-2"]);
  });

  it("reports an offer that no longer fits and lets it claim nothing", () => {
    const { claimed, unfillable } = claimCopiesForOffers(
      [offer("t-1", "g"), offer("t-2", "g", 2)],
      new Map([["g", ["cp-1", "cp-2"]]]),
    );
    expect([...claimed]).toEqual(["cp-1"]);
    expect(unfillable.map((row) => row.id)).toEqual(["t-2"]);
  });

  it("keeps a later offer that still fits after an unfillable one", () => {
    const { claimed, unfillable } = claimCopiesForOffers(
      [offer("t-1", "g", 5), offer("t-2", "g")],
      new Map([["g", ["cp-1", "cp-2"]]]),
    );
    expect([...claimed]).toEqual(["cp-1"]);
    expect(unfillable.map((row) => row.id)).toEqual(["t-1"]);
  });

  it("allocates each offer within its own group", () => {
    const { claimed, unfillable } = claimCopiesForOffers(
      [offer("t-1", "g-a"), offer("t-2", "g-b")],
      new Map([
        ["g-a", ["cp-a"]],
        ["g-b", ["cp-b"]],
      ]),
    );
    expect([...claimed].toSorted()).toEqual(["cp-a", "cp-b"]);
    expect(unfillable).toEqual([]);
  });

  it("spends one shared copy once across two groups that both see it", () => {
    const { claimed, unfillable } = claimCopiesForOffers(
      [offer("t-1", "g-a"), offer("t-2", "g-b")],
      new Map([
        ["g-a", ["cp-1"]],
        ["g-b", ["cp-1"]],
      ]),
    );
    expect([...claimed]).toEqual(["cp-1"]);
    expect(unfillable.map((row) => row.id)).toEqual(["t-2"]);
  });

  it("treats a group with no known supply as empty", () => {
    const { claimed, unfillable } = claimCopiesForOffers([offer("t-1", "g-x")], new Map());
    expect(claimed.size).toBe(0);
    expect(unfillable.map((row) => row.id)).toEqual(["t-1"]);
  });
});
