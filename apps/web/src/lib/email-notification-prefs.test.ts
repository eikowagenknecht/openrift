import { describe, expect, it } from "vitest";

import {
  buildEmailNotificationPatch,
  buildTradeRequestCadencePatch,
  resolveEmailNotificationGates,
} from "./email-notification-prefs";

describe("resolveEmailNotificationGates", () => {
  it("applies per-setting defaults when the key is absent", () => {
    expect(resolveEmailNotificationGates(undefined)).toEqual({
      tradeMatches: false, // digest is opt-in
      tradeRequests: true, // request email is opt-out
      tradeRequestCadence: "5min", // default cadence
    });
    expect(resolveEmailNotificationGates({})).toEqual({
      tradeMatches: false,
      tradeRequests: true,
      tradeRequestCadence: "5min",
    });
  });

  it("digest is on only when explicitly true", () => {
    expect(resolveEmailNotificationGates({ tradeMatches: true }).tradeMatches).toBe(true);
    expect(resolveEmailNotificationGates({ tradeMatches: false }).tradeMatches).toBe(false);
  });

  it("request email is on unless explicitly false", () => {
    expect(resolveEmailNotificationGates({ tradeRequests: false }).tradeRequests).toBe(false);
    expect(resolveEmailNotificationGates({ tradeRequests: true }).tradeRequests).toBe(true);
  });

  it("reflects the stored cadence when set", () => {
    expect(
      resolveEmailNotificationGates({ tradeRequestCadence: "instant" }).tradeRequestCadence,
    ).toBe("instant");
    expect(
      resolveEmailNotificationGates({ tradeRequestCadence: "30min" }).tradeRequestCadence,
    ).toBe("30min");
  });
});

describe("buildTradeRequestCadencePatch", () => {
  it("sets the cadence when there is no prior object", () => {
    expect(buildTradeRequestCadencePatch(undefined, "instant")).toEqual({
      tradeRequestCadence: "instant",
    });
  });

  it("preserves the channel toggles while changing the cadence", () => {
    expect(
      buildTradeRequestCadencePatch(
        { tradeRequests: false, tradeMatches: true, tradeRequestCadence: "5min" },
        "60min",
      ),
    ).toEqual({ tradeRequests: false, tradeMatches: true, tradeRequestCadence: "60min" });
  });
});

describe("buildEmailNotificationPatch", () => {
  it("sets the channel when there is no prior object", () => {
    expect(buildEmailNotificationPatch(undefined, "tradeMatches", true)).toEqual({
      tradeMatches: true,
    });
  });

  it("preserves the sibling channel's explicit value", () => {
    expect(buildEmailNotificationPatch({ tradeRequests: false }, "tradeMatches", true)).toEqual({
      tradeRequests: false,
      tradeMatches: true,
    });
  });

  it("overwrites only the named channel", () => {
    expect(
      buildEmailNotificationPatch(
        { tradeMatches: true, tradeRequests: true },
        "tradeMatches",
        false,
      ),
    ).toEqual({ tradeMatches: false, tradeRequests: true });
  });
});
