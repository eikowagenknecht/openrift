import { EMPTY_CARD_FILTERS } from "@openrift/shared";
import { listDetailResponseSchema } from "@openrift/shared/contracts/lists";
import { describe, expect, it } from "vitest";

import {
  toList,
  toListDetail,
  toListEntry,
  toListEntryDetail,
  toPublicList,
} from "./list-presenters.js";

const NOW = new Date("2025-06-15T12:00:00.000Z");
const LATER = new Date("2025-06-16T08:30:00.000Z");

describe("toList", () => {
  it("maps a list row including intent, kind, and entry count", () => {
    const result = toList({
      id: "lst-1",
      userId: "user-1",
      name: "Demacia binder",
      intent: "organize",
      kind: "card",
      isPublic: false,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
      entryCount: 12,
      defaultPricePref: null,
      defaultPriceAbsoluteCents: null,
      defaultTradeType: null,
      currency: null,
      rules: [],
      ruleCombine: null,
      sortOrder: 0,
      sidebarHidden: false,
    });
    expect(result).toEqual({
      id: "lst-1",
      name: "Demacia binder",
      intent: "organize",
      kind: "card",
      entryCount: 12,
      isPublic: false,
      shareToken: null,
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
      tradeDefaults: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
      currency: null,
      hasRule: false,
      sidebarHidden: false,
    });
  });

  it("carries the sidebar-hidden flag so the sidebar can fold the list away", () => {
    const result = toList({
      id: "lst-1",
      userId: "user-1",
      name: "Old Piltover trades",
      intent: "trade",
      kind: "copy",
      isPublic: false,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
      defaultPricePref: null,
      defaultPriceAbsoluteCents: null,
      defaultTradeType: null,
      currency: null,
      rules: [],
      ruleCombine: null,
      sortOrder: 0,
      sidebarHidden: true,
    });
    expect(result.sidebarHidden).toBe(true);
  });

  it("defaults entryCount to 0 when the caller doesn't supply one (e.g. after create)", () => {
    const result = toList({
      id: "lst-1",
      userId: "user-1",
      name: "Wants",
      intent: "wish",
      kind: "printing",
      isPublic: true,
      shareToken: "tok-abc",
      createdAt: NOW,
      updatedAt: LATER,
      defaultPricePref: null,
      defaultPriceAbsoluteCents: null,
      defaultTradeType: null,
      currency: null,
      rules: [],
      ruleCombine: null,
      sortOrder: 0,
      sidebarHidden: false,
    });
    expect(result.entryCount).toBe(0);
    expect(result.isPublic).toBe(true);
    expect(result.shareToken).toBe("tok-abc");
    expect(result.kind).toBe("printing");
  });

  it("carries through trade defaults and currency", () => {
    const result = toList({
      id: "lst-1",
      userId: "user-1",
      name: "For trade",
      intent: "trade",
      kind: "copy",
      isPublic: false,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
      defaultPricePref: "cm_lowest",
      defaultPriceAbsoluteCents: null,
      defaultTradeType: "cards",
      currency: "EUR",
      rules: [],
      ruleCombine: null,
      sortOrder: 0,
      sidebarHidden: false,
    });
    expect(result.tradeDefaults).toEqual({
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: "cards",
    });
    expect(result.currency).toBe("EUR");
  });
});

describe("toListDetail", () => {
  it("re-hydrates a rule saved before a newer filter dimension without failing output validation", () => {
    const staleFilter = { ...EMPTY_CARD_FILTERS, hasAnyMarker: null } as Record<string, unknown>;
    delete staleFilter.presence;
    delete staleFilter.keywords;
    delete staleFilter.keywordsExclude;
    const storedRules = [
      {
        kind: "trade",
        filter: staleFilter,
        collectionIds: ["019e2fa1-8cdc-7a3a-810e-d5a09f31c19e"],
        keepPerCard: { mode: "fixed", n: 0 },
        excludeCopyIds: [],
      },
    ];

    const detail = toListDetail({
      id: "lst-1",
      userId: "user-1",
      name: "My Little Trade Binder",
      intent: "trade",
      kind: "copy",
      isPublic: false,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
      defaultPricePref: null,
      defaultPriceAbsoluteCents: null,
      defaultTradeType: null,
      currency: "EUR",
      sortOrder: 0,
      sidebarHidden: false,
      rules: storedRules as never,
      ruleCombine: null,
    });

    expect(detail.rules[0].filter.presence).toEqual({});
    expect(detail.rules[0].filter.keywords).toEqual([]);
    expect(detail.rules[0].filter.keywordsExclude).toEqual([]);
    expect(detail.hasRule).toBe(true);

    const result = listDetailResponseSchema.safeParse({ list: detail, entries: [] });
    expect(result.success).toBe(true);
  });
});

describe("toPublicList", () => {
  it("excludes shareToken and isPublic but keeps intent + kind", () => {
    const result = toPublicList({
      id: "lst-1",
      userId: "user-1",
      name: "Demacia binder",
      intent: "organize",
      kind: "card",
      isPublic: true,
      shareToken: "tok-abc",
      createdAt: NOW,
      updatedAt: LATER,
      defaultPricePref: null,
      defaultPriceAbsoluteCents: null,
      defaultTradeType: null,
      currency: null,
      rules: [],
      ruleCombine: null,
      sortOrder: 0,
      sidebarHidden: false,
    });
    expect(result).toEqual({
      id: "lst-1",
      name: "Demacia binder",
      intent: "organize",
      kind: "card",
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
      tradeDefaults: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
      currency: null,
    });
    expect((result as Record<string, unknown>).shareToken).toBeUndefined();
    expect((result as Record<string, unknown>).isPublic).toBeUndefined();
  });
});

describe("toListEntry", () => {
  it("maps a card-kind entry to the card variant", () => {
    const result = toListEntry({
      id: "le-1",
      listId: "lst-1",
      userId: "user-1",
      kind: "card",
      cardId: "card-1",
      printingId: null,
      copyId: null,
      quantity: 4,
      createdAt: NOW,
      updatedAt: LATER,
      pricePref: null,
      priceAbsoluteCents: null,
      tradeType: null,
    });
    expect(result).toEqual({
      id: "le-1",
      listId: "lst-1",
      kind: "card",
      cardId: "card-1",
      quantity: 4,
      tradeOverride: { pricePref: null, priceAbsoluteCents: null, tradeType: null },
    });
  });

  it("maps a copy-kind entry to the copy variant", () => {
    const result = toListEntry({
      id: "le-2",
      listId: "lst-1",
      userId: "user-1",
      kind: "copy",
      cardId: null,
      printingId: null,
      copyId: "copy-1",
      quantity: 1,
      createdAt: NOW,
      updatedAt: LATER,
      pricePref: "absolute",
      priceAbsoluteCents: 450,
      tradeType: "money",
    });
    expect(result).toEqual({
      id: "le-2",
      listId: "lst-1",
      kind: "copy",
      copyId: "copy-1",
      quantity: 1,
      tradeOverride: { pricePref: "absolute", priceAbsoluteCents: 450, tradeType: "money" },
    });
  });
});

const NO_TRADE_OVERRIDE = { pricePref: null, priceAbsoluteCents: null, tradeType: null };

describe("toListEntryDetail", () => {
  it("maps a card-kind entry with just card identity + name", () => {
    const result = toListEntryDetail({
      kind: "card",
      id: "le-1",
      listId: "lst-1",
      quantity: 2,
      source: "manual",
      ruleQuantity: 0,
      cardId: "card-1",
      cardName: "Fire Dragon",
      tradeOverride: NO_TRADE_OVERRIDE,
    });
    expect(result).toEqual({
      kind: "card",
      id: "le-1",
      listId: "lst-1",
      quantity: 2,
      source: "manual",
      ruleQuantity: 0,
      cardId: "card-1",
      cardName: "Fire Dragon",
      tradeOverride: NO_TRADE_OVERRIDE,
    });
  });

  it("maps a printing-kind entry with printing details", () => {
    const result = toListEntryDetail({
      kind: "printing",
      id: "le-2",
      listId: "lst-1",
      quantity: 1,
      source: "manual",
      ruleQuantity: 0,
      printingId: "p-1",
      cardName: "Fire Dragon",
      setId: "set-1",
      rarity: "rare",
      finish: "foil",
      shortCode: "OGS-005",
      language: "EN",
      imageId: "img-1",
      tradeOverride: NO_TRADE_OVERRIDE,
    });
    expect(result).toEqual({
      kind: "printing",
      id: "le-2",
      listId: "lst-1",
      quantity: 1,
      source: "manual",
      ruleQuantity: 0,
      printingId: "p-1",
      cardName: "Fire Dragon",
      setId: "set-1",
      rarity: "rare",
      finish: "foil",
      shortCode: "OGS-005",
      language: "EN",
      imageId: "img-1",
      tradeOverride: NO_TRADE_OVERRIDE,
    });
  });

  it("maps a copy-kind entry with the underlying printing for rendering", () => {
    const result = toListEntryDetail({
      kind: "copy",
      id: "le-3",
      listId: "lst-1",
      quantity: 1,
      source: "manual",
      ruleQuantity: 0,
      copyId: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      cardName: "Fire Dragon",
      setId: "set-1",
      rarity: "rare",
      finish: "foil",
      shortCode: "OGS-005",
      language: "EN",
      imageId: "img-1",
      reserved: true,
      onLoan: false,
      tradeOverride: NO_TRADE_OVERRIDE,
    });
    expect(result).toEqual({
      kind: "copy",
      id: "le-3",
      listId: "lst-1",
      quantity: 1,
      source: "manual",
      ruleQuantity: 0,
      copyId: "copy-1",
      printingId: "p-1",
      cardName: "Fire Dragon",
      setId: "set-1",
      rarity: "rare",
      finish: "foil",
      shortCode: "OGS-005",
      language: "EN",
      imageId: "img-1",
      reserved: true,
      onLoan: false,
      tradeOverride: NO_TRADE_OVERRIDE,
    });
  });
});
