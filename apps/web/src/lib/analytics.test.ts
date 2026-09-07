import { afterEach, describe, expect, it, vi } from "vitest";

import { trackEvent } from "./analytics";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trackEvent", () => {
  it("forwards the name and data to umami", () => {
    const track = vi.fn();
    vi.stubGlobal("umami", { track });

    trackEvent("deck_exported", { format: "text", cards: 40 });

    expect(track).toHaveBeenCalledWith("deck_exported", { format: "text", cards: 40 });
  });

  it("forwards a name without data", () => {
    const track = vi.fn();
    vi.stubGlobal("umami", { track });

    trackEvent("scan_started");

    expect(track).toHaveBeenCalledWith("scan_started", undefined);
  });

  it("does nothing when the umami script has not loaded", () => {
    vi.stubGlobal("umami", undefined);

    expect(() => trackEvent("scan_started")).not.toThrow();
  });
});
