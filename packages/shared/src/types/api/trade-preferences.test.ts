import { describe, expect, it } from "vitest";

import type { TradePreference } from "./trade-preferences.js";
import { isEmptyTradePreference, resolveEffectiveTradePreference } from "./trade-preferences.js";

const empty: TradePreference = { pricePref: null, priceAbsoluteCents: null, tradeType: null };

describe("resolveEffectiveTradePreference", () => {
  it("returns all-null when both override and default are empty", () => {
    expect(resolveEffectiveTradePreference(empty, empty, null)).toEqual({
      pricePref: null,
      priceAbsoluteCents: null,
      tradeType: null,
      currency: null,
    });
  });

  it("falls back to list default when entry override is empty", () => {
    const listDefault: TradePreference = {
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: "cards",
    };
    expect(resolveEffectiveTradePreference(empty, listDefault, "EUR")).toEqual({
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: "cards",
      currency: "EUR",
    });
  });

  it("entry override beats list default field-by-field", () => {
    const listDefault: TradePreference = {
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: "cards",
    };
    const override: TradePreference = {
      pricePref: "tcg_lowest",
      priceAbsoluteCents: null,
      tradeType: null,
    };
    expect(resolveEffectiveTradePreference(override, listDefault, "USD")).toEqual({
      pricePref: "tcg_lowest",
      priceAbsoluteCents: null,
      tradeType: "cards",
      currency: "USD",
    });
  });

  it("absolute entry override carries its own cents", () => {
    const listDefault: TradePreference = {
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: null,
    };
    const override: TradePreference = {
      pricePref: "absolute",
      priceAbsoluteCents: 450,
      tradeType: null,
    };
    expect(resolveEffectiveTradePreference(override, listDefault, "EUR")).toEqual({
      pricePref: "absolute",
      priceAbsoluteCents: 450,
      tradeType: null,
      currency: "EUR",
    });
  });

  it("clears priceAbsoluteCents when effective pricePref is not 'absolute'", () => {
    const listDefault: TradePreference = {
      pricePref: "absolute",
      priceAbsoluteCents: 400,
      tradeType: null,
    };
    const override: TradePreference = {
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: null,
    };
    expect(resolveEffectiveTradePreference(override, listDefault, "EUR")).toEqual({
      pricePref: "cm_lowest",
      priceAbsoluteCents: null,
      tradeType: null,
      currency: "EUR",
    });
  });

  it("absolute default with no override carries the default's cents", () => {
    const listDefault: TradePreference = {
      pricePref: "absolute",
      priceAbsoluteCents: 400,
      tradeType: null,
    };
    expect(resolveEffectiveTradePreference(empty, listDefault, "EUR")).toEqual({
      pricePref: "absolute",
      priceAbsoluteCents: 400,
      tradeType: null,
      currency: "EUR",
    });
  });
});

describe("isEmptyTradePreference", () => {
  it("returns true when both pricePref and tradeType are null", () => {
    expect(isEmptyTradePreference(empty)).toBe(true);
  });

  it("returns false when pricePref is set", () => {
    expect(
      isEmptyTradePreference({
        pricePref: "cm_lowest",
        priceAbsoluteCents: null,
        tradeType: null,
      }),
    ).toBe(false);
  });

  it("returns false when tradeType is set", () => {
    expect(
      isEmptyTradePreference({
        pricePref: null,
        priceAbsoluteCents: null,
        tradeType: "cards",
      }),
    ).toBe(false);
  });
});
