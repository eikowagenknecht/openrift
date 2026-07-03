import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { scrollUntilVisible } from "./virtualized.js";

// Shared helpers for the card-browser surfaces (/cards, /collections, deck
// builder, /promos). The catalog grid renders each tile as an image only —
// the card name is the art image's `alt`, with no visible text or shortcode —
// and the grid is window-virtualized, so cards are located by image role and
// scrolled into view before asserting.

/**
 * Locate a card tile by its art image's accessible name (the card name).
 * @returns The card image locator.
 */
export function cardImage(page: Page, name: string): Locator {
  return page.getByRole("img", { name });
}

/**
 * Wait until the catalog grid has rendered (a known seed card is reachable).
 * @returns Nothing.
 */
export async function waitForCatalogLoaded(page: Page, cardName = "Annie, Fiery") {
  await scrollUntilVisible(page, cardImage(page, cardName));
}

// The card-browser toolbar is useHydrated-gated: its handlers wire a beat after
// the grid becomes visible, so an early click or keystroke is silently dropped.
// These helpers retry the interaction until it demonstrably takes effect.

/**
 * Type into the catalog search box reliably. The input is a debounced two-way
 * URL sync that ignores Playwright's atomic fill(); real keystrokes work but can
 * be dropped before the toolbar hydrates, so retry until the query commits to
 * the URL.
 * @returns The search input locator.
 */
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
