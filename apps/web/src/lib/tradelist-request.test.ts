import type { FriendGroupShareableListResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { WishlistRequestOption } from "./tradelist-request";
import {
  preferredWishlistId,
  wishEntryForPrinting,
  wishlistRequestOptions,
} from "./tradelist-request";

const EMPTY_PREF = { pricePref: null, priceAbsoluteCents: null, tradeType: null };

function stubShareable(
  overrides: Partial<FriendGroupShareableListResponse> = {},
): FriendGroupShareableListResponse {
  return {
    listId: "list-1",
    listName: "Wishlist",
    listIntent: "wish",
    listKind: "card",
    entryCount: 3,
    sharedAt: null,
    tradeDefaults: EMPTY_PREF,
    currency: null,
    ...overrides,
  };
}

describe("wishlistRequestOptions", () => {
  it("keeps only wish-intent lists, preserving order", () => {
    const options = wishlistRequestOptions([
      stubShareable({ listId: "w1", listIntent: "wish" }),
      stubShareable({ listId: "t1", listIntent: "trade", listKind: "copy" }),
      stubShareable({ listId: "o1", listIntent: "organize" }),
      stubShareable({ listId: "w2", listIntent: "wish", listKind: "printing" }),
    ]);
    expect(options.map((option) => option.listId)).toEqual(["w1", "w2"]);
  });

  it("flags shared lists from sharedAt", () => {
    const [unshared, shared] = wishlistRequestOptions([
      stubShareable({ listId: "w1", sharedAt: null }),
      stubShareable({ listId: "w2", sharedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(unshared.isShared).toBe(false);
    expect(shared.isShared).toBe(true);
  });

  it("normalises kind to card or printing", () => {
    const [card, printing] = wishlistRequestOptions([
      stubShareable({ listId: "w1", listKind: "card" }),
      stubShareable({ listId: "w2", listKind: "printing" }),
    ]);
    expect(card.listKind).toBe("card");
    expect(printing.listKind).toBe("printing");
  });

  it("returns an empty array when nothing is a wishlist", () => {
    expect(
      wishlistRequestOptions([stubShareable({ listIntent: "trade", listKind: "copy" })]),
    ).toEqual([]);
  });
});

describe("wishEntryForPrinting", () => {
  const printing = { id: "printing-9", cardId: "card-9" };

  it("keys card-kind lists by card id", () => {
    expect(wishEntryForPrinting("card", printing, 2)).toEqual({ cardId: "card-9", quantity: 2 });
  });

  it("keys printing-kind lists by printing id", () => {
    expect(wishEntryForPrinting("printing", printing, 1)).toEqual({
      printingId: "printing-9",
      quantity: 1,
    });
  });

  it("clamps quantity to a positive integer", () => {
    expect(wishEntryForPrinting("card", printing, 0).quantity).toBe(1);
    expect(wishEntryForPrinting("card", printing, -5).quantity).toBe(1);
    expect(wishEntryForPrinting("card", printing, 2.9).quantity).toBe(2);
  });
});

describe("preferredWishlistId", () => {
  const option = (overrides: Partial<WishlistRequestOption>): WishlistRequestOption => ({
    listId: "w",
    listName: "Wishlist",
    listKind: "card",
    entryCount: 0,
    isShared: false,
    ...overrides,
  });

  it("prefers a shared wishlist over an earlier unshared one", () => {
    expect(
      preferredWishlistId([
        option({ listId: "w1", isShared: false }),
        option({ listId: "w2", isShared: true }),
      ]),
    ).toBe("w2");
  });

  it("falls back to the first list when none are shared", () => {
    expect(
      preferredWishlistId([
        option({ listId: "w1", isShared: false }),
        option({ listId: "w2", isShared: false }),
      ]),
    ).toBe("w1");
  });

  it("returns null when there are no wishlists", () => {
    expect(preferredWishlistId([])).toBeNull();
  });
});
