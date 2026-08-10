import type { Page } from "@playwright/test";

// The card detail pane is opt-in: `paneDocked` defaults to false, so a card
// click opens the detail modal instead and no <aside> is rendered at all. Tests
// that are about the docked pane have to say so before the app boots.

/** localStorage key the display store persists under. */
const DISPLAY_STORE_KEY = "user-preferences";

/**
 * Dock the card detail pane for the rest of this page's lifetime. Seeds the
 * display store's persisted blob before any app code runs, so the first render
 * already has the pane docked and there is no modal-then-pane flip mid-test.
 *
 * Only the one key is written: the store's `merge` fills every other field from
 * its defaults, so this stays valid as the store grows.
 * @returns Nothing.
 */
export async function dockDetailPane(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key }: { key: string }) => {
      localStorage.setItem(key, JSON.stringify({ state: { paneDocked: true }, version: 0 }));
    },
    { key: DISPLAY_STORE_KEY },
  );
}
