import { act, render } from "@testing-library/react";
import type { Root } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

  it("hydrates without mismatching when the page top bar is already measured", async () => {
    // Regression: on /stage the card browser sits inside a <Suspense> under
    // BuilderWorkbench, so it hydrates *after* the workbench has measured its
    // top bar. Reading that measurement during the boundary's hydration render
    // made the layout compute header + bar - 1 against server markup written
    // with header - 1, and React logged "a tree hydrated but some attributes of
    // the server rendered HTML didn't match the client properties" for every
    // sticky tier (plus the scroll indicator downstream, whose initial position
    // is seeded from stickyOffset). The values here are 56 vs 112.
    const layout = (
      <CardBrowserLayout toolbar={<span>toolbar</span>} aboveGrid={<span>above</span>} />
    );
    // The server never has a measurement, so its context is always 0.
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <PageTopBarHeightContext value={0}>{layout}</PageTopBarHeightContext>,
    );
    document.body.append(container);

    const logged: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });

    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(
        container,
        <PageTopBarHeightContext value={56}>{layout}</PageTopBarHeightContext>,
      );
    });
    consoleError.mockRestore();

    expect(logged.join("\n")).not.toMatch(/hydrat/iu);

    // Once hydrated the live measurement still applies, so nothing about the
    // settled layout changes — only the render it was computed on.
    const toolbar = container.querySelector(".z-30") as HTMLElement;
    expect(toolbar.style.top).toBe(`${SSR_HEADER_HEIGHT + 56 - 1}px`);

    root?.unmount();
    container.remove();
  });
});
