import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";

import { mapAuthError } from "./better-auth-error.js";

describe("mapAuthError", () => {
  it("maps the api-key rate-limit denial, rounding the retry hint up to whole seconds", () => {
    // The exact shape @better-auth/api-key throws from consumeRateLimit.
    const err = new APIError("TOO_MANY_REQUESTS", {
      message: "Rate limit exceeded. Maximum requests allowed.",
      code: "RATE_LIMITED",
      details: { tryAgainIn: 1500 },
    });

    expect(mapAuthError(err)).toEqual({
      status: 429,
      code: "RATE_LIMITED",
      message: "Rate limit exceeded. Maximum requests allowed.",
      retryAfterSeconds: 2,
    });
  });

  it("maps an invalid key to 401 with the canonical code for the status", () => {
    const err = new APIError("UNAUTHORIZED", {
      message: "Invalid API key.",
      code: "INVALID_API_KEY",
    });

    expect(mapAuthError(err)).toEqual({
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid API key.",
    });
  });

  it("keeps a code that is already canonical", () => {
    const err = new APIError("BAD_REQUEST", { message: "Bad input", code: "VALIDATION_ERROR" });

    expect(mapAuthError(err)).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("falls back to the error's own message when the body carries none", () => {
    const err = new APIError("NOT_FOUND");

    expect(mapAuthError(err)).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("maps a 5xx to INTERNAL_ERROR", () => {
    const err = new APIError("INTERNAL_SERVER_ERROR", { message: "boom" });

    expect(mapAuthError(err)).toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
  });

  it("omits the retry hint when the body has none or it is unusable", () => {
    expect(
      mapAuthError(new APIError("TOO_MANY_REQUESTS", { message: "Usage exceeded" }))
        .retryAfterSeconds,
    ).toBeUndefined();
    expect(
      mapAuthError(
        new APIError("TOO_MANY_REQUESTS", { message: "x", details: { tryAgainIn: "soon" } }),
      ).retryAfterSeconds,
    ).toBeUndefined();
    expect(
      mapAuthError(new APIError("TOO_MANY_REQUESTS", { message: "x", details: { tryAgainIn: 0 } }))
        .retryAfterSeconds,
    ).toBeUndefined();
  });
});
