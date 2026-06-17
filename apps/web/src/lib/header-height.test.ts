import { afterEach, describe, expect, it } from "vitest";

import { getHeaderHeight } from "./header-height";

// jsdom always defines `window`, so the SSR (`window === undefined`) branch is
// not exercised here; it is covered by the static fallback constant. These
// tests focus on the client-side resolution order: measure the live header
// first (it carries the iOS safe-area inset and can exceed the 57px chrome),
// then fall back to the CSS variable, then to 57.

describe("getHeaderHeight", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--header-height");
  });

  it("measures the live header element when present", () => {
    const header = document.createElement("header");
    header.dataset.appHeader = "";
    document.body.append(header);
    // jsdom does not lay out, so stub the measured rect (chrome + safe-area).
    header.getBoundingClientRect = () => ({ height: 116 }) as DOMRect;

    expect(getHeaderHeight()).toBe(116);
  });

  it("falls back to the --header-height CSS variable when no header is mounted", () => {
    document.documentElement.style.setProperty("--header-height", "57px");

    expect(getHeaderHeight()).toBe(57);
  });

  it("falls back to 57 when the variable is unset or non-numeric", () => {
    // An unregistered custom property holding a calc()/env() string parses to
    // NaN, which must degrade to the static fallback rather than NaN.
    document.documentElement.style.setProperty(
      "--header-height",
      "calc(57px + env(safe-area-inset-top, 0px))",
    );

    expect(getHeaderHeight()).toBe(57);
  });
});
