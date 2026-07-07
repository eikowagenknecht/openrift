import { afterEach, describe, expect, it, vi } from "vitest";

import { electricAuthenticatedFetch, electricShapeOrigin } from "./electric-origin";

describe("electricShapeOrigin", () => {
  it("falls back to the page origin when no dev override is inlined", () => {
    // vitest.config.ts inlines __ELECTRIC_SHAPE_ORIGIN__ as "" (the
    // production value), so the fallback path is what runs here.
    expect(electricShapeOrigin()).toBe(globalThis.location.origin);
  });
});

describe("electricAuthenticatedFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forces credentials: include so cross-origin dev shapes carry the session cookie", async () => {
    const fetchMock = vi.fn(async () => new Response(null));
    vi.stubGlobal("fetch", fetchMock);

    await electricAuthenticatedFetch("https://api.example/shape", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example/shape", {
      method: "GET",
      credentials: "include",
    });
  });

  it("overrides a caller-provided credentials value", async () => {
    const fetchMock = vi.fn(async () => new Response(null));
    vi.stubGlobal("fetch", fetchMock);

    await electricAuthenticatedFetch("https://api.example/shape", { credentials: "omit" });

    expect(fetchMock).toHaveBeenCalledWith("https://api.example/shape", {
      credentials: "include",
    });
  });
});
