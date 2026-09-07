import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PAGE_TOP_BAR_STICKY_BASE, PageTopBarSticky, PageTopBarTitle } from "./page-top-bar";

describe("PageTopBarSticky", () => {
  it("tucks 1px under the header instead of sitting flush", () => {
    const { container } = render(
      <PageTopBarSticky width="full">
        <span>content</span>
      </PageTopBarSticky>,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("top-[calc(var(--header-height)_-_1px)]");
    expect(outer.className).toContain("-mt-px");
  });

  it("keeps the gutter on the sticky layer at full width, with no inner column wrapper", () => {
    const { container } = render(
      <PageTopBarSticky width="full">
        <span>content</span>
      </PageTopBarSticky>,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain("px-safe");
    expect(outer.querySelector(".max-w-5xl")).toBeNull();
  });

  it("does not stack px-safe on both the full-bleed layer and the inner capped column", () => {
    const { container } = render(
      <PageTopBarSticky width="capped">
        <span>content</span>
      </PageTopBarSticky>,
    );
    const outer = container.firstElementChild as HTMLElement;
    const inner = outer.querySelector(".max-w-5xl") as HTMLElement;

    expect(outer.className).not.toContain("px-safe");
    expect(inner).not.toBeNull();
    expect(inner.className).toContain("px-safe");

    const withGutter = container.querySelectorAll('[class*="px-safe"]');
    expect(withGutter).toHaveLength(1);
  });

  it.each(["full", "capped"] as const)(
    "paints its surface on a viewport-wide bleed layer, not on the sticky element (%s)",
    (width) => {
      const { container } = render(
        <PageTopBarSticky width={width}>
          <span>content</span>
        </PageTopBarSticky>,
      );
      const classes = (container.firstElementChild as HTMLElement).className.split(/\s+/u);

      expect(classes).toContain("before:w-screen");
      expect(classes).toContain("before:bg-background");
      expect(classes).not.toContain("bg-background");
      expect(classes).toContain("sticky");
      expect(classes).not.toContain("relative");
    },
  );

  it("leaves the column-layout base painting inside its own column", () => {
    const classes = PAGE_TOP_BAR_STICKY_BASE.split(/\s+/u);
    expect(classes).toContain("bg-background");
    expect(classes).not.toContain("before:w-screen");
  });
});

describe("PageTopBarTitle", () => {
  it("keeps a sidebar toggle available at desktop widths, hidden only below md", () => {
    const onToggleSidebar = vi.fn();
    const { getByRole } = render(
      <PageTopBarTitle onToggleSidebar={onToggleSidebar}>Cards</PageTopBarTitle>,
    );

    const toggle = getByRole("button", { name: "Toggle sidebar" });
    expect(toggle.className).toContain("md:inline-flex");

    toggle.click();
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("centers the desktop toggle inside baseline-aligned title rows", () => {
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
