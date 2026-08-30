import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PageTopBarSticky, PageTopBarTitle } from "./page-top-bar";

describe("PageTopBarSticky", () => {
  it("tucks 1px under the header instead of sitting flush", () => {
    // Regression: a flush top-(--header-height) opened a 1px seam of raw
    // scrolling content at fractional browser zoom (independent device-pixel
    // snapping of the header and bar layers). The bar overlaps the z-50
    // header by 1px so rounding can never expose a gap.
    const { container } = render(
      <PageTopBarSticky width="full">
        <span>content</span>
      </PageTopBarSticky>,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("top-[calc(var(--header-height)_-_1px)]");
    // -mt-px keeps the flow position equal to the pin position; without it the
    // bar visibly travels 1px on the first scroll before sticking.
    expect(outer.className).toContain("-mt-px");
  });

  it("keeps the gutter on the sticky layer at full width", () => {
    const { container } = render(
      <PageTopBarSticky width="full">
        <span>content</span>
      </PageTopBarSticky>,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("px-safe");
    // No inner column wrapper on the full-bleed path.
    expect(outer.querySelector(".max-w-5xl")).toBeNull();
  });

  it("does not stack px-safe on both the full-bleed layer and the inner capped column", () => {
    // Regression: `px-safe` is a custom utility tailwind-merge can't reconcile,
    // so the old `cn(PAGE_TOP_BAR_STICKY, "px-0")` left `px-safe` on the outer
    // layer AND on the inner column, double-insetting the bar's content (badly
    // visible in landscape, where the safe-area inset is large).
    const { container } = render(
      <PageTopBarSticky width="capped">
        <span>content</span>
      </PageTopBarSticky>,
    );
    const outer = container.firstElementChild as HTMLElement;
    const inner = outer.querySelector(".max-w-5xl") as HTMLElement;

    // The full-bleed layer must NOT carry the gutter...
    expect(outer.className).not.toContain("px-safe");
    // ...and the inner centered column carries it exactly once.
    expect(inner).not.toBeNull();
    expect(inner.className).toContain("px-safe");

    // Across the whole subtree the gutter appears on a single element.
    const withGutter = container.querySelectorAll('[class*="px-safe"]');
    expect(withGutter).toHaveLength(1);
  });
});

describe("PageTopBarTitle", () => {
  it("keeps a sidebar toggle available at desktop widths", () => {
    // Regression: the only toggle affordance was the mobile title-button
    // (md:hidden), so on landscape phones (≥ 768px, still "desktop" for the
    // sidebar) the persistent sidebar could never be collapsed.
    const onToggleSidebar = vi.fn();
    const { getByRole } = render(
      <PageTopBarTitle onToggleSidebar={onToggleSidebar}>Cards</PageTopBarTitle>,
    );

    const toggle = getByRole("button", { name: "Toggle sidebar" });
    // Hidden below md (the mobile title-button covers that range), visible at md+.
    expect(toggle.className).toContain("md:inline-flex");

    toggle.click();
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("centers the desktop toggle inside baseline-aligned title rows", () => {
    // Regression: collection/list headers wrap the title in an items-baseline
    // flex row (to baseline-align the value text with the title). An icon-only
    // button has no text baseline, so the browser synthesized one from the
    // icon's bottom edge and the toggle sat visibly above center.
    const { getByRole } = render(
      <PageTopBarTitle onToggleSidebar={vi.fn()}>Cards</PageTopBarTitle>,
    );

    const toggle = getByRole("button", { name: "Toggle sidebar" });
    expect(toggle.className).toContain("self-center");
  });

  it("still wraps the title in a toggle button on mobile", () => {
    const onToggleSidebar = vi.fn();
    const { getByRole } = render(
      <PageTopBarTitle onToggleSidebar={onToggleSidebar}>Cards</PageTopBarTitle>,
    );

    const titleButton = getByRole("button", { name: "Cards" });
    expect(titleButton.closest("h1")?.className).toContain("md:hidden");

    titleButton.click();
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("renders a plain heading without a toggle handler", () => {
    const { container, queryByRole } = render(<PageTopBarTitle>Cards</PageTopBarTitle>);
    expect(queryByRole("button")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Cards");
  });
});
