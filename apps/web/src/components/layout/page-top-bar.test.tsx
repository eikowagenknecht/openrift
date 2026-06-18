import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageTopBarSticky } from "./page-top-bar";

describe("PageTopBarSticky", () => {
  it("keeps the gutter on the sticky layer when no maxWidth is given", () => {
    const { container } = render(
      <PageTopBarSticky>
        <span>content</span>
      </PageTopBarSticky>,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("px-safe");
    // No inner column wrapper on the full-bleed path.
    expect(outer.querySelector(".max-w-4xl")).toBeNull();
  });

  it("does not stack px-safe on both the full-bleed layer and the inner column with maxWidth", () => {
    // Regression: `px-safe` is a custom utility tailwind-merge can't reconcile,
    // so the old `cn(PAGE_TOP_BAR_STICKY, "px-0")` left `px-safe` on the outer
    // layer AND on the inner column, double-insetting the bar's content (badly
    // visible in landscape, where the safe-area inset is large).
    const { container } = render(
      <PageTopBarSticky maxWidth="4xl">
        <span>content</span>
      </PageTopBarSticky>,
    );
    const outer = container.firstElementChild as HTMLElement;
    const inner = outer.querySelector(".max-w-4xl") as HTMLElement;

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
