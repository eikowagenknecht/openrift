import { afterEach, describe, expect, it } from "vitest";

import { getApiUrl } from "./api-url";

const originalLocation = globalThis.location;

afterEach(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("getApiUrl", () => {
  it("returns the base when read same-origin (jsdom origin matches the fallback)", () => {
    // jsdom's page origin is http://localhost:3000, equal to the dev fallback —
    // the server-function unit tests rely on this, so the guard must stay quiet.
    expect(globalThis.location.origin).toBe("http://localhost:3000");
    expect(getApiUrl()).toBe("http://localhost:3000");
  });

  it("throws when read in the browser and the base is cross-origin", () => {
    // Stand in for preview/prod: the page is served from a real origin while
    // the internal base degrades to localhost:3000 in the browser bundle.
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { ...originalLocation, origin: "https://preview.openrift.app" },
    });
    expect(() => getApiUrl()).toThrow(/browserApiOrpcClient/u);
  });
});
