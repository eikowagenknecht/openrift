import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useHeaderHeight } from "./use-header-height";

// jsdom always defines `window`, so the genuine SSR path (server render,
// client rehydrate) is not reproducible here.

function stubHeader(height: number): void {
  const header = document.createElement("header");
  header.dataset.appHeader = "";
  // jsdom does not lay out, so stub the measured rect (chrome + safe-area).
  header.getBoundingClientRect = () => ({ height }) as DOMRect;
  document.body.append(header);
}

function renderHeights(): number[] {
  const heights: number[] = [];
  function Probe(): null {
    heights.push(useHeaderHeight());
    return null;
  }
  render(<Probe />);
  return heights;
}

describe("useHeaderHeight", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--header-height");
  });

  it("seeds to the SSR fallback (57) on the first render, then measures the live header after mount", () => {
    stubHeader(116);

    const heights = renderHeights();

    expect(heights[0]).toBe(57);
    expect(heights.at(-1)).toBe(116);
  });

  it("stays at 57 when no header is mounted (desktop, zero safe-area inset)", () => {
    const heights = renderHeights();

    expect(heights[0]).toBe(57);
    expect(heights.at(-1)).toBe(57);
  });
});
