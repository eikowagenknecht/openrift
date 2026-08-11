import type { ErrorEvent, EventHint } from "@sentry/bun";
import { describe, expect, it } from "vitest";

import {
  isDroppableTransientRejection,
  isTransientNetworkError,
} from "./transient-network-error.js";

// The exact mechanism type @sentry/node-core's onunhandledrejection
// integration sets. Pinned here because an equality check against the bare
// "onunhandledrejection" silently matches nothing and disables the filter.
const SDK_MECHANISM_TYPE = "auto.node.onunhandledrejection";

function rejectionEvent(mechanismType = SDK_MECHANISM_TYPE): ErrorEvent {
  return {
    type: undefined,
    exception: { values: [{ type: "DNSException", mechanism: { type: mechanismType } }] },
    extra: { unhandledPromiseRejection: true },
  } as ErrorEvent;
}

function hintFor(error: unknown): EventHint {
  return { originalException: error } as EventHint;
}

// ── isTransientNetworkError ───────────────────────────────────────────────────

describe("isTransientNetworkError", () => {
  it("matches a DNS failure carrying a code", () => {
    const error = Object.assign(new Error("getaddrinfo ESERVFAIL"), { code: "ESERVFAIL" });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("matches the bare Bun DNSException shape seen in production", () => {
    // Bun surfaces this with no `code` and no stacktrace, so the message is
    // the only thing to match on.
    const error = new Error("getaddrinfo ESERVFAIL");
    error.name = "DNSException";
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("matches connection errors by code", () => {
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EPIPE"]) {
      const error = Object.assign(new Error("connect failed"), { code });
      expect(isTransientNetworkError(error), code).toBe(true);
    }
  });

  it("matches when the code is on errno instead", () => {
    const error = Object.assign(new Error("lookup failed"), { errno: "EAI_AGAIN" });
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("does not match an ordinary application error", () => {
    expect(isTransientNetworkError(new Error("something broke"))).toBe(false);
  });

  it("does not match a database error that is not connectivity", () => {
    const error = Object.assign(new Error('relation "sets" does not exist'), { code: "42P01" });
    expect(isTransientNetworkError(error)).toBe(false);
  });

  it("does not match a getaddrinfo message with an unrelated code", () => {
    expect(isTransientNetworkError(new Error("getaddrinfo EAI_BADFLAGS"))).toBe(false);
  });

  it("does not match a message that merely mentions a transient code", () => {
    // Guards against a substring match swallowing real errors that quote a
    // connection code in prose.
    expect(isTransientNetworkError(new Error("retry after ECONNREFUSED was logged"))).toBe(false);
  });

  it("handles non-object and nullish values", () => {
    expect(isTransientNetworkError(null)).toBe(false);
    expect(isTransientNetworkError(undefined)).toBe(false);
    expect(isTransientNetworkError("ESERVFAIL")).toBe(false);
    expect(isTransientNetworkError(42)).toBe(false);
  });

  it("handles an object with a non-string code", () => {
    expect(isTransientNetworkError({ code: 111 })).toBe(false);
  });
});

// ── isDroppableTransientRejection ─────────────────────────────────────────────

describe("isDroppableTransientRejection", () => {
  it("drops the production DNS-blip event shape", () => {
    const error = new Error("getaddrinfo ESERVFAIL");
    error.name = "DNSException";
    expect(isDroppableTransientRejection(rejectionEvent(), hintFor(error))).toBe(true);
  });

  it("matches the SDK's fully qualified mechanism type, not a bare suffix", () => {
    // Regression guard: `=== "onunhandledrejection"` never fires against the
    // real SDK value, which makes the whole filter dead code.
    expect(SDK_MECHANISM_TYPE).not.toBe("onunhandledrejection");
    const event = rejectionEvent();
    event.extra = {}; // force the decision onto the mechanism check alone
    const error = Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });
    expect(isDroppableTransientRejection(event, hintFor(error))).toBe(true);
  });

  it("falls back to the extra flag when the mechanism type is absent", () => {
    const event = { type: undefined, extra: { unhandledPromiseRejection: true } } as ErrorEvent;
    const error = Object.assign(new Error("lookup failed"), { code: "ESERVFAIL" });
    expect(isDroppableTransientRejection(event, hintFor(error))).toBe(true);
  });

  it("keeps a transient error thrown on a real request path", () => {
    // Not an unhandled rejection: a caller saw this one, so it still reports.
    const event = {
      type: undefined,
      exception: { values: [{ type: "Error", mechanism: { type: "generic" } }] },
    } as ErrorEvent;
    const error = Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });
    expect(isDroppableTransientRejection(event, hintFor(error))).toBe(false);
  });

  it("keeps an unhandled rejection that is not a network error", () => {
    expect(
      isDroppableTransientRejection(rejectionEvent(), hintFor(new Error("null is not an object"))),
    ).toBe(false);
  });

  it("keeps an event with no exception values and no extra flag", () => {
    const event = { type: undefined } as ErrorEvent;
    expect(isDroppableTransientRejection(event, hintFor(new Error("boom")))).toBe(false);
  });
});
