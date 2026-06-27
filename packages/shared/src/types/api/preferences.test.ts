import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRADE_REQUEST_EMAIL_CADENCE,
  getTradeRequestEmailCadence,
  isTradeStatusEmailEnabled,
} from "./preferences.js";

describe("getTradeRequestEmailCadence", () => {
  it("falls back to the default when no preferences are stored", () => {
    expect(getTradeRequestEmailCadence(undefined)).toBe(DEFAULT_TRADE_REQUEST_EMAIL_CADENCE);
    expect(getTradeRequestEmailCadence({})).toBe(DEFAULT_TRADE_REQUEST_EMAIL_CADENCE);
  });

  it("returns the stored cadence when set", () => {
    expect(getTradeRequestEmailCadence({ tradeRequestCadence: "instant" })).toBe("instant");
    expect(getTradeRequestEmailCadence({ tradeRequestCadence: "60min" })).toBe("60min");
  });
});

describe("isTradeStatusEmailEnabled", () => {
  it("defaults on (opt-out) when unset", () => {
    expect(isTradeStatusEmailEnabled(undefined)).toBe(true);
    expect(isTradeStatusEmailEnabled({})).toBe(true);
  });

  it("is off only when explicitly disabled", () => {
    expect(isTradeStatusEmailEnabled({ tradeStatus: false })).toBe(false);
    expect(isTradeStatusEmailEnabled({ tradeStatus: true })).toBe(true);
  });
});
