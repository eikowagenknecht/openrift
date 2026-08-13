import { describe, expect, it } from "vitest";

import { selectAdminCardPrevNext, selectPrevNextSlug } from "./admin-card-nav";
import { ALL_ASSIGNABLE_SCOPE } from "./marketplace-coverage";
import type { PriceAssignBucket } from "./marketplace-coverage";

function bucket(overrides: Partial<PriceAssignBucket> = {}): PriceAssignBucket {
  return {
    marketplace: "cardmarket",
    language: null,
    unbound: 1,
    assignable: true,
    ...overrides,
  };
}

// A CardTrader bucket in a language with no matching printing — umbrella noise.
function unassignableCtBucket(language: string): PriceAssignBucket {
  return bucket({ marketplace: "cardtrader", language, assignable: false });
}

describe("selectPrevNextSlug", () => {
  const cards = ["ahri", "braum", "caitlyn", "darius"];

  it("returns the immediate neighbours without a predicate", () => {
    expect(selectPrevNextSlug(cards, "braum")).toEqual({ prev: "ahri", next: "caitlyn" });
  });

  it("has no prev at the start and no next at the end", () => {
    expect(selectPrevNextSlug(cards, "ahri")).toEqual({ prev: null, next: "braum" });
    expect(selectPrevNextSlug(cards, "darius")).toEqual({ prev: "caitlyn", next: null });
  });

  it("returns nothing for a single-card ordering", () => {
    expect(selectPrevNextSlug(["ahri"], "ahri")).toEqual({ prev: null, next: null });
  });

  it("returns nothing for an empty ordering", () => {
    expect(selectPrevNextSlug([], "ahri")).toEqual({ prev: null, next: null });
  });

  it("returns nothing when the current slug is not in the ordering", () => {
    expect(selectPrevNextSlug(cards, "ezreal")).toEqual({ prev: null, next: null });
  });

  it("skips over non-matching slugs in both directions", () => {
    const matches = (slug: string) => slug === "ahri" || slug === "darius";
    expect(selectPrevNextSlug(cards, "braum", matches)).toEqual({ prev: "ahri", next: "darius" });
  });

  it("finds neighbours even when the current slug does not match", () => {
    const matches = (slug: string) => slug !== "braum";
    expect(selectPrevNextSlug(cards, "braum", matches)).toEqual({ prev: "ahri", next: "caitlyn" });
  });

  it("does not wrap around when only one side matches", () => {
    const matches = (slug: string) => slug === "ahri";
    expect(selectPrevNextSlug(cards, "caitlyn", matches)).toEqual({ prev: "ahri", next: null });
  });
});

describe("selectAdminCardPrevNext", () => {
  const cards = ["ahri", "braum", "caitlyn", "darius"];

  it("walks every card when the price filter is off", () => {
    const buckets = new Map([["darius", [bucket()]]]);
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        priceScope: null,
        assignBucketsBySlug: buckets,
      }),
    ).toEqual({
      prev: "ahri",
      next: "caitlyn",
    });
  });

  it("falls back to the unfiltered ordering while the corpus data is loading", () => {
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        priceScope: ALL_ASSIGNABLE_SCOPE,
        assignBucketsBySlug: null,
      }),
    ).toEqual({
      prev: "ahri",
      next: "caitlyn",
    });
  });

  it("visits only cards with unassigned products in the active scope", () => {
    const buckets = new Map([
      ["ahri", [bucket()]],
      ["braum", [bucket()]],
      ["caitlyn", []],
      ["darius", [bucket()]],
    ]);
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        priceScope: ALL_ASSIGNABLE_SCOPE,
        assignBucketsBySlug: buckets,
      }),
    ).toEqual({
      prev: "ahri",
      next: "darius",
    });
  });

  it("keeps navigating after the current card's last product is assigned", () => {
    // The current card dropped out of the filter, so a naive findIndex on the
    // filtered list would return -1 and strand both buttons.
    const buckets = new Map([
      ["ahri", [bucket()]],
      ["braum", [bucket({ unbound: 0 })]],
      ["caitlyn", [bucket()]],
      ["darius", [bucket()]],
    ]);
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        priceScope: ALL_ASSIGNABLE_SCOPE,
        assignBucketsBySlug: buckets,
      }),
    ).toEqual({
      prev: "ahri",
      next: "caitlyn",
    });
  });

  it("disables both directions when no card matches the filter", () => {
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        priceScope: ALL_ASSIGNABLE_SCOPE,
        assignBucketsBySlug: new Map(),
      }),
    ).toEqual({
      prev: null,
      next: null,
    });
  });

  it("has no next once the last matching card is reached", () => {
    const buckets = new Map([["ahri", [bucket()]]]);
    expect(
      selectAdminCardPrevNext(cards, "caitlyn", {
        priceScope: ALL_ASSIGNABLE_SCOPE,
        assignBucketsBySlug: buckets,
      }),
    ).toEqual({
      prev: "ahri",
      next: null,
    });
  });

  it("stays inside the set scope, which the caller applies to the ordering", () => {
    const setScoped = ["braum", "caitlyn"];
    const buckets = new Map([
      ["ahri", [bucket()]],
      ["braum", [bucket()]],
      ["caitlyn", [bucket()]],
      ["darius", [bucket()]],
    ]);
    expect(
      selectAdminCardPrevNext(setScoped, "braum", {
        priceScope: ALL_ASSIGNABLE_SCOPE,
        assignBucketsBySlug: buckets,
      }),
    ).toEqual({
      prev: null,
      next: "caitlyn",
    });
  });

  it("skips unassignable CardTrader buckets under the umbrella scope", () => {
    const buckets = new Map([
      ["ahri", [unassignableCtBucket("FR")]],
      ["braum", [bucket()]],
      ["caitlyn", [unassignableCtBucket("FR")]],
      ["darius", [bucket()]],
    ]);
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        priceScope: ALL_ASSIGNABLE_SCOPE,
        assignBucketsBySlug: buckets,
      }),
    ).toEqual({
      prev: null,
      next: "darius",
    });
  });

  it("counts an explicitly selected scope even when it is unassignable", () => {
    const buckets = new Map([
      ["ahri", [unassignableCtBucket("FR")]],
      ["braum", [bucket()]],
      ["caitlyn", [unassignableCtBucket("FR")]],
      ["darius", [bucket()]],
    ]);
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        priceScope: "cardtrader:FR",
        assignBucketsBySlug: buckets,
      }),
    ).toEqual({
      prev: "ahri",
      next: "caitlyn",
    });
  });

  it("visits only cards with new printings when that filter is on", () => {
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        newPrintingSlugs: new Set(["ahri", "braum", "darius"]),
      }),
    ).toEqual({ prev: "ahri", next: "darius" });
  });

  it("keeps navigating after the current card's new printings are accepted", () => {
    // Same trap as the price filter: the current card is no longer in the set,
    // so the position has to be resolved in the full ordering.
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        newPrintingSlugs: new Set(["ahri", "caitlyn"]),
      }),
    ).toEqual({ prev: "ahri", next: "caitlyn" });
  });

  it("falls back to the unfiltered ordering while the card list is loading", () => {
    expect(selectAdminCardPrevNext(cards, "braum", { newPrintingSlugs: null })).toEqual({
      prev: "ahri",
      next: "caitlyn",
    });
  });

  it("ignores buckets from a different scope than the selected one", () => {
    const buckets = new Map([
      ["ahri", [bucket({ marketplace: "tcgplayer" })]],
      ["caitlyn", [bucket({ marketplace: "cardmarket" })]],
    ]);
    expect(
      selectAdminCardPrevNext(cards, "braum", {
        priceScope: "cardmarket",
        assignBucketsBySlug: buckets,
      }),
    ).toEqual({
      prev: null,
      next: "caitlyn",
    });
  });
});
