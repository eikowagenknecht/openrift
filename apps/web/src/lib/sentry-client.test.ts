import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { captureHydrationError, enrichBareThrow } from "./sentry-client";

const { captureExceptionMock } = vi.hoisted(() => ({ captureExceptionMock: vi.fn() }));

vi.mock("@sentry/tanstackstart-react", () => ({
  captureException: captureExceptionMock,
  init: vi.fn(),
  tanstackRouterBrowserTracingIntegration: vi.fn(),
}));

const originalLocation = globalThis.location;

beforeEach(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { ...originalLocation, pathname: "/collections/abc", search: "?foo=1" },
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("enrichBareThrow", () => {
  test("passes through events with a real Error untouched", () => {
    const event = {
      type: undefined,
      exception: { values: [{ type: "TypeError" }] },
      tags: {},
      extra: {},
    };
    const result = enrichBareThrow(event, { originalException: new TypeError("boom") });
    expect(result).toBe(event);
  });

  test("passes through string exceptions untouched", () => {
    const event = { type: undefined, exception: { values: [] }, tags: {}, extra: {} };
    const result = enrichBareThrow(event, { originalException: "some message" });
    expect(result).toBe(event);
  });

  test("enriches throw undefined with route + tag", () => {
    const event = {
      type: undefined,
      exception: { values: [] },
      tags: { existing: "x" },
      extra: { other: 1 },
    };
    const result = enrichBareThrow(event, { originalException: undefined });
    expect(result.message).toBe("Bare throw (undefined) on /collections/abc");
    expect(result.tags).toMatchObject({ existing: "x", bare_throw: true });
    expect(result.extra).toMatchObject({
      other: 1,
      pathname: "/collections/abc",
      search: "?foo=1",
      thrown_value: "undefined",
    });
  });

  test("enriches throw null", () => {
    const result = enrichBareThrow({ type: undefined }, { originalException: null });
    expect(result.message).toBe("Bare throw (null) on /collections/abc");
    expect(result.tags).toMatchObject({ bare_throw: true });
    expect(result.extra).toMatchObject({ thrown_value: "null" });
  });

  test("enriches throw empty string", () => {
    const result = enrichBareThrow({ type: undefined }, { originalException: "" });
    expect(result.message).toBe("Bare throw () on /collections/abc");
    expect(result.tags).toMatchObject({ bare_throw: true });
    expect(result.extra).toMatchObject({ thrown_value: "" });
  });
});

describe("captureHydrationError", () => {
  beforeEach(() => {
    captureExceptionMock.mockClear();
  });

  test("forwards the error with its component stack and a hydration tag", () => {
    const error = new Error("Hydration failed because the server rendered HTML…");
    const componentStack = "\n    in meta\n    in head\n    in html";

    captureHydrationError(error, { componentStack });

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { hydration: true, hydration_phase: "recoverable" },
      extra: { componentStack },
    });
  });

  test("tolerates a null component stack", () => {
    const error = new Error("boom");

    captureHydrationError(error, { componentStack: null });

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { hydration: true, hydration_phase: "recoverable" },
      extra: { componentStack: null },
    });
  });

  test("tags the phase for uncaught (non-recoverable) hydration errors", () => {
    const error = new Error("Minified React error #418");

    captureHydrationError(error, { componentStack: "\n    in head" }, "uncaught");

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { hydration: true, hydration_phase: "uncaught" },
      extra: { componentStack: "\n    in head" },
    });
  });

  test("tags hydration: false for an error-boundary catch after hydration settled", () => {
    // onCaughtError fires for the app's whole lifetime — a crash minutes after
    // load (e.g. useRequiredUserId throwing on session expiry) is not a
    // hydration error and must not be tagged as one.
    const error = new Error("useRequiredUserId() called without an authenticated session.");

    captureHydrationError(error, { componentStack: "\n    in DeckEditorContent" }, "caught", false);

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { hydration: false, hydration_phase: "caught" },
      extra: { componentStack: "\n    in DeckEditorContent" },
    });
  });
});
