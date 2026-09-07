import type { Page } from "@playwright/test";

// The card detail pane is opt-in: `paneDocked` defaults to false, so a card
// click opens the detail modal instead and no <aside> is rendered at all.

const DISPLAY_STORE_KEY = "user-preferences";

// Seeds the store's persisted blob before app code runs; `merge` fills every
// other field from defaults, so writing just this one key is safe.
export async function dockDetailPane(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key }: { key: string }) => {
      localStorage.setItem(key, JSON.stringify({ state: { paneDocked: true }, version: 0 }));
    },
    { key: DISPLAY_STORE_KEY },
  );
}
