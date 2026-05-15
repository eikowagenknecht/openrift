import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { enrichBareThrow } from "./sentry-client";

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
