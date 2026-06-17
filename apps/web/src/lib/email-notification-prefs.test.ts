import { describe, expect, it } from "vitest";

import {
  buildEmailNotificationPatch,
  resolveEmailNotificationGates,
} from "./email-notification-prefs";

describe("resolveEmailNotificationGates", () => {
  it("applies per-channel defaults when the key is absent", () => {
    expect(resolveEmailNotificationGates(undefined)).toEqual({
      tradeMatches: false, // digest is opt-in
      tradeRequests: true, // request email is opt-out
    });
    expect(resolveEmailNotificationGates({})).toEqual({
      tradeMatches: false,
      tradeRequests: true,
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
