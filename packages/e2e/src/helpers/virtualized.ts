import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

// .first() avoids a strict-mode violation: card-grid.tsx renders group
// headers twice once scrolled into view (inline header + sticky overlay).
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
    await page.waitForTimeout(100);
  }
  throw new Error(`scrollUntilVisible: locator not found within ${timeout}ms`);
}
