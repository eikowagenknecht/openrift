import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

// Scroll the page (window-virtualized lists) until `locator` mounts, then
// assert it is visible. Use this for any element rendered inside a
// react-virtual window virtualizer where off-screen rows are absent from the
// DOM. Uses `window.scrollBy` so each scroll is synchronous and the
// virtualizer reacts before the next poll; wraps around to the opposite end
// when we hit the bottom without finding the target.
//
// Uses `.first()` for the final visibility assertion because card-grid.tsx
// renders group headers twice once scrolled into view (inline header + sticky
// overlay), which would otherwise trip Playwright's strict-mode check.
export async function scrollUntilVisible(
  page: Page,
  locator: Locator,
  options: { timeout?: number; step?: number; direction?: "down" | "up" } = {},
) {
  const { timeout = 15_000, step = 600, direction = "down" } = options;
  const delta = direction === "down" ? step : -step;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await locator.count()) > 0) {
      await expect(locator.first()).toBeVisible();
      return;
    }
    await page.evaluate(
      ({ delta: d, dir }) => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const atEnd = dir === "down" ? window.scrollY >= maxScroll - 2 : window.scrollY <= 2;
        if (atEnd) {
          window.scrollTo({ top: dir === "down" ? 0 : maxScroll });
        } else {
          window.scrollBy(0, d);
        }
      },
      { delta, dir: direction },
    );
    // Give the virtualizer a frame to mount newly-visible rows before the
    // next check. 100ms is enough for a raf + layout pass without wasting
    // test budget on idle polls.
    await page.waitForTimeout(100);
  }
  throw new Error(`scrollUntilVisible: locator not found within ${timeout}ms`);
}
