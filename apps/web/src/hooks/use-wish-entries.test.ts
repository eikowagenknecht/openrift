import type { ListDetailResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildWishMembership } from "./use-wish-entries";

const EMPTY_PREF = { pricePref: null, priceAbsoluteCents: null, tradeType: null } as const;

function wishList(
  id: string,
  name: string,
  kind: "card" | "printing",
  entries: ListDetailResponse["entries"],
): ListDetailResponse {
  return {
    list: {
      id,
      name,
      intent: "wish",
      kind,
      entryCount: entries.length,
      sidebarHidden: false,
      isPublic: false,
      shareToken: null,
      createdAt: "",
      updatedAt: "",
      tradeDefaults: EMPTY_PREF,
      currency: null,
      hasRule: false,
      rules: [],
      ruleCombine: null,
    },
    entries,
  };
}

describe("buildWishMembership", () => {
  it("returns no matches for empty input", () => {
    const membership = buildWishMembership([]);
    expect(membership.matches("card-1", "printing-1")).toBe(false);
    expect(membership.entriesForPrinting("card-1", "printing-1")).toEqual([]);
  });

  it("matches a card-kind wish against any printing of that card", () => {
    const membership = buildWishMembership([
      wishList("list-1", "Wants", "card", [
        {
          id: "e1",
          listId: "list-1",
          quantity: 2,
          tradeOverride: EMPTY_PREF,
          ruleQuantity: 0,
          source: "manual",
          kind: "card",
          cardId: "card-1",
          cardName: "Ahri",
        },
      ]),
    ]);
    expect(membership.matches("card-1", "any-printing")).toBe(true);
    expect(membership.matches("card-2", "any-printing")).toBe(false);
    const entries = membership.entriesForPrinting("card-1", "any-printing");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      entryId: "e1",
      listName: "Wants",
      kind: "card",
      quantity: 2,
    });
  });

  it("matches a printing-kind wish only against the exact printing", () => {
    const membership = buildWishMembership([
      wishList("list-2", "Foils", "printing", [
        {
          id: "e2",
          listId: "list-2",
          quantity: 1,
          tradeOverride: EMPTY_PREF,
          ruleQuantity: 0,
          source: "manual",
          kind: "printing",
          printingId: "printing-9",
          cardName: "Ahri",
          setId: "set-1",
          rarity: "rare",
          finish: "foil",
          shortCode: "OGN-001",
          language: "en",
          imageId: null,
        },
      ]),
    ]);
    expect(membership.matches("card-1", "printing-9")).toBe(true);
    expect(membership.matches("card-1", "printing-other")).toBe(false);
  });

  it("aggregates matches across multiple wish lists for the same card", () => {
    const membership = buildWishMembership([
      wishList("list-1", "Wants", "card", [
        {
          id: "e1",
          listId: "list-1",
          quantity: 1,
          tradeOverride: EMPTY_PREF,
          ruleQuantity: 0,
          source: "manual",
          kind: "card",
          cardId: "card-1",
          cardName: "Ahri",
        },
      ]),
      wishList("list-3", "Trade bait", "card", [
        {
          id: "e3",
          listId: "list-3",
          quantity: 4,
          tradeOverride: EMPTY_PREF,
          ruleQuantity: 0,
          source: "manual",
          kind: "card",
          cardId: "card-1",
          cardName: "Ahri",
        },
      ]),
    ]);
    const entries = membership.entriesForPrinting("card-1", "printing-1");
    expect(entries.map((entry) => entry.listName).sort()).toEqual(["Trade bait", "Wants"]);
  });

  it("sums wished quantity across matching entries", () => {
    const membership = buildWishMembership([
      wishList("list-1", "Wants", "card", [
        {
          id: "e1",
          listId: "list-1",
          quantity: 1,
          tradeOverride: EMPTY_PREF,
          ruleQuantity: 0,
          source: "manual",
          kind: "card",
          cardId: "card-1",
          cardName: "Ahri",
        },
      ]),
      wishList("list-3", "Trade bait", "card", [
        {
          id: "e3",
          listId: "list-3",
          quantity: 4,
          tradeOverride: EMPTY_PREF,
          ruleQuantity: 0,
          source: "manual",
          kind: "card",
          cardId: "card-1",
          cardName: "Ahri",
        },
      ]),
    ]);
    expect(membership.wishedQuantity("card-1", "printing-1")).toBe(5);
    expect(membership.wishedQuantity("card-2", "printing-1")).toBe(0);
  });

  it("combines a card-kind and printing-kind wish that both cover one printing", () => {
    const membership = buildWishMembership([
      wishList("list-1", "Wants", "card", [
        {
          id: "e1",
          listId: "list-1",
          quantity: 1,
          tradeOverride: EMPTY_PREF,
          ruleQuantity: 0,
          source: "manual",
          kind: "card",
          cardId: "card-1",
          cardName: "Ahri",
        },
      ]),
      wishList("list-2", "Foils", "printing", [
        {
          id: "e2",
          listId: "list-2",
          quantity: 1,
          tradeOverride: EMPTY_PREF,
          ruleQuantity: 0,
          source: "manual",
          kind: "printing",
          printingId: "printing-9",
          cardName: "Ahri",
          setId: "set-1",
          rarity: "rare",
          finish: "foil",
          shortCode: "OGN-001",
          language: "en",
          imageId: null,
        },
      ]),
    ]);
    const entries = membership.entriesForPrinting("card-1", "printing-9");
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.kind).sort()).toEqual(["card", "printing"]);
  });
});
