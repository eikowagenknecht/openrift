import { afterEach, describe, expect, it } from "vitest";

import { getHeaderHeight, SSR_HEADER_HEIGHT } from "./header-height";

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

  it("exposes the SSR fallback as a shared constant", () => {
    expect(SSR_HEADER_HEIGHT).toBe(57);
  });

  it("falls back to the --header-height CSS variable when no header is mounted", () => {
    document.documentElement.style.setProperty("--header-height", "57px");

    expect(getHeaderHeight()).toBe(SSR_HEADER_HEIGHT);
  });

  it("falls back to 57 when the variable is unset or non-numeric", () => {
    document.documentElement.style.setProperty(
      "--header-height",
      "calc(57px + env(safe-area-inset-top, 0px))",
    );

    expect(getHeaderHeight()).toBe(SSR_HEADER_HEIGHT);
  });
});
