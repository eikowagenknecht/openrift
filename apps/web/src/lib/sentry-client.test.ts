import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  captureHydrationError,
  enrichBareThrow,
  INJECTED_SCRIPT_PATTERN,
  initClientSentry,
} from "./sentry-client";

const { captureExceptionMock, initMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  initMock: vi.fn(),
}));

vi.mock("@sentry/tanstackstart-react", () => ({
  captureException: captureExceptionMock,
  init: initMock,
  tanstackRouterBrowserTracingIntegration: vi.fn(),
}));

vi.mock("./env", () => ({ PROD: true, PREVIEW_HOSTS: "", COMMIT_HASH: "test" }));

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

  test("fingerprints per route so unrelated surfaces don't group into one issue", () => {
    const result = enrichBareThrow({ type: undefined }, { originalException: undefined });
    expect(result.fingerprint).toEqual(["bare-throw", "/collections/abc"]);
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
    const error = new Error("useRequiredUserId() called without an authenticated session.");

    captureHydrationError(error, { componentStack: "\n    in DeckEditorContent" }, "caught", false);

    expect(captureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { hydration: false, hydration_phase: "caught" },
      extra: { componentStack: "\n    in DeckEditorContent" },
    });
  });
});

describe("initClientSentry", () => {
  beforeEach(() => {
    initMock.mockClear();
    globalThis.__OPENRIFT_CONFIG__ = { sentryDsn: "https://key@example.ingest.sentry.io/1" };
  });

  afterEach(() => {
    globalThis.__OPENRIFT_CONFIG__ = undefined;
  });

  test("ignores transport-noise fetch failures from all three engines", () => {
    initClientSentry({} as Parameters<typeof initClientSentry>[0]);

    expect(initMock).toHaveBeenCalledTimes(1);
    const options = initMock.mock.calls[0]?.[0] as { ignoreErrors: unknown[] };
    expect(options.ignoreErrors).toEqual(
      expect.arrayContaining([
        "Load failed",
        "Failed to fetch",
        "NetworkError when attempting to fetch resource",
      ]),
    );
  });

  test("ignores the page scripts the visitor's own browser injected", () => {
    initClientSentry({} as Parameters<typeof initClientSentry>[0]);

    const options = initMock.mock.calls[0]?.[0] as { ignoreErrors: unknown[] };
    expect(options.ignoreErrors).toContain(INJECTED_SCRIPT_PATTERN);
  });

  test("does not init without a DSN", () => {
    globalThis.__OPENRIFT_CONFIG__ = undefined;

    initClientSentry({} as Parameters<typeof initClientSentry>[0]);

    expect(initMock).not.toHaveBeenCalled();
  });

  test("reports the deployment environment from the inlined config", () => {
    globalThis.__OPENRIFT_CONFIG__ = {
      sentryDsn: "https://key@example.ingest.sentry.io/1",
      appEnv: "preview",
    };

    initClientSentry({} as Parameters<typeof initClientSentry>[0]);

    const options = initMock.mock.calls[0]?.[0] as { environment: string };
    expect(options.environment).toBe("preview");
  });

  test("falls back to development when no environment is inlined", () => {
    globalThis.__OPENRIFT_CONFIG__ = {
      sentryDsn: "https://key@example.ingest.sentry.io/1",
    };

    initClientSentry({} as Parameters<typeof initClientSentry>[0]);

    const options = initMock.mock.calls[0]?.[0] as { environment: string };
    expect(options.environment).toBe("development");
  });
});

describe("INJECTED_SCRIPT_PATTERN", () => {
  test.each([
    "ReferenceError: Can't find variable: __firefox__",
    "TypeError: undefined is not an object (evaluating 'window.__firefox__.reader')",
    "TypeError: undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
  ])("matches %s", (message) => {
    expect(INJECTED_SCRIPT_PATTERN.test(message)).toBe(true);
  });

  test("leaves an app error alone", () => {
    expect(INJECTED_SCRIPT_PATTERN.test("TypeError: window.location is undefined")).toBe(false);
  });
});
