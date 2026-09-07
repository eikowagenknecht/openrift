import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { scrollUntilVisible } from "./virtualized.js";

// Card tiles render as an image only; the card name is the art image's `alt`
// with no visible text or shortcode, and the grid is window-virtualized.

export function cardImage(page: Page, name: string): Locator {
  return page.getByRole("img", { name });
}

export async function waitForCatalogLoaded(page: Page, cardName = "Annie, Fiery") {
  await scrollUntilVisible(page, cardImage(page, cardName));
}

// The card-browser toolbar is useHydrated-gated: its handlers wire a beat after
// the grid becomes visible, so an early click or keystroke is silently dropped.
// These helpers retry the interaction until it demonstrably takes effect.

// The search input is a debounced two-way URL sync that ignores Playwright's
// atomic fill(); retry keystrokes until the query commits to the URL.
export async function typeSearch(page: Page, query: string): Promise<Locator> {
  const search = page.getByPlaceholder(/search/iu);
  await expect(async () => {
    await search.click();
    await search.fill("");
    await search.pressSequentially(query, { delay: 30 });
    await expect(page).toHaveURL(/[?&]search=/u, { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  return search;
}
