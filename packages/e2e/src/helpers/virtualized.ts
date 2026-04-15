import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

// Scroll the page (window-virtualized lists) until `locator` mounts, then
// assert it is visible. Use this for any element rendered inside a
// react-virtual window virtualizer where off-screen rows are absent from the
// DOM. Scrolls down in 800px steps; pass `direction: "up"` to scroll the
// other way.
export async function scrollUntilVisible(
  page: Page,
  locator: Locator,
  options: { timeout?: number; step?: number; direction?: "down" | "up" } = {},
) {
  const { timeout = 10_000, step = 800, direction = "down" } = options;
  const delta = direction === "down" ? step : -step;
  await expect
    .poll(
      async () => {
        if ((await locator.count()) > 0) {
          return true;
        }
        await page.mouse.wheel(0, delta);
        return false;
      },
      { timeout },
    )
    .toBe(true);
  await expect(locator).toBeVisible();
}
