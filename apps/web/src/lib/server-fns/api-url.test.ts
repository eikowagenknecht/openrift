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
    expect(globalThis.location.origin).toBe("http://localhost:3000");
    expect(getApiUrl()).toBe("http://localhost:3000");
  });

  it("throws when read in the browser and the base is cross-origin (preview/prod)", () => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { ...originalLocation, origin: "https://preview.openrift.app" },
    });
    expect(() => getApiUrl()).toThrow(/browserApiOrpcClient/u);
  });
});
