import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageTopBarHeightContext } from "@/components/layout/page-top-bar";
import { SSR_HEADER_HEIGHT } from "@/lib/header-height";

import { CardBrowserLayout } from "./card-browser-layout";

describe("CardBrowserLayout", () => {
  it("tucks the sticky toolbar 1px under the header", () => {
    // Regression: pinning the toolbar flush at the header height opened a 1px
    // seam of raw scrolling content at fractional browser zoom, because the
    // header and the toolbar are separate composited layers that snap to the
    // device-pixel grid independently. The toolbar must overlap the z-50
    // header by 1px so rounding can never expose a gap.
    const { container } = render(<CardBrowserLayout toolbar={<span>toolbar</span>} />);
    const toolbar = container.querySelector(".z-30") as HTMLElement;
    expect(toolbar).not.toBeNull();
    expect(toolbar.style.top).toBe(`${SSR_HEADER_HEIGHT - 1}px`);
    // -mt-px keeps the flow position equal to the pin position; without it the
    // toolbar visibly travels 1px on the first scroll before sticking.
    expect(toolbar.className).toContain("-mt-px");
  });

  it("stays flush with a page top bar's bottom edge", () => {
    // The page top bar carries its own -1px (PAGE_TOP_BAR_STICKY), so with a
    // bar of height B the toolbar pins at header + B - 1 — exactly the bar's
    // shifted bottom edge, with no double overlap.
    const { container } = render(
      <PageTopBarHeightContext value={40}>
        <CardBrowserLayout toolbar={<span>toolbar</span>} />
      </PageTopBarHeightContext>,
    );
    const toolbar = container.querySelector(".z-30") as HTMLElement;
    expect(toolbar.style.top).toBe(`${SSR_HEADER_HEIGHT + 40 - 1}px`);
    // The bar's own -mt-px already shifted this tier's flow position; a second
    // one here would open a 1px travel between flow and pin position.
    expect(toolbar.className).not.toContain("-mt-px");
  });
});
