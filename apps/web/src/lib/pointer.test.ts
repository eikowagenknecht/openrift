import { afterEach, describe, expect, it, vi } from "vitest";

describe("IS_COARSE_POINTER", () => {
  const originalMatchMedia = globalThis.matchMedia;

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
    vi.resetModules();
  });

  it("is true when the pointer:coarse media query matches (touch device)", async () => {
    globalThis.matchMedia = vi.fn().mockReturnValue({ matches: true });

    const { IS_COARSE_POINTER } = await import("./pointer");

    expect(IS_COARSE_POINTER).toBe(true);
    expect(globalThis.matchMedia).toHaveBeenCalledWith("(pointer: coarse)");
  });

  it("is false when the pointer:coarse media query does not match (mouse device)", async () => {
    globalThis.matchMedia = vi.fn().mockReturnValue({ matches: false });

    const { IS_COARSE_POINTER } = await import("./pointer");

    expect(IS_COARSE_POINTER).toBe(false);
  });

  it("is false when matchMedia is unavailable (e.g. SSR)", async () => {
    // @ts-expect-error -- simulating an environment without matchMedia
    delete globalThis.matchMedia;

    const { IS_COARSE_POINTER } = await import("./pointer");

    expect(IS_COARSE_POINTER).toBe(false);
  });
});
