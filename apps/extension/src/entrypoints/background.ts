import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import type { PageExtract } from "../lib/deck-extract";
import { deckImportUrl } from "../lib/openrift-url";

/** How long the "nothing found" badge stays on the toolbar icon. */
const BADGE_CLEAR_MS = 4000;

/**
 * Resolves the toolbar-button API: `action` on MV3, `browserAction` on
 * Firefox MV2 builds.
 * @returns The available action API.
 */
function actionApi(): typeof browser.action {
  return browser.action ?? browser.browserAction;
}

/**
 * Briefly shows a "?" badge on the toolbar icon to signal that no decklist
 * was found on the page.
 */
function showNotFoundBadge(tabId: number): void {
  const action = actionApi();
  void action.setBadgeText({ tabId, text: "?" });
  void action.setBadgeBackgroundColor({ tabId, color: "#b91c1c" });
  setTimeout(() => {
    void action.setBadgeText({ tabId, text: "" });
  }, BADGE_CLEAR_MS);
}

/**
 * Runs the extraction in the clicked tab and opens the OpenRift import page
 * with whatever was found.
 */
async function importDeckFromTab(tabId: number, tabIndex: number): Promise<void> {
  // activeTab grants one-time access to the clicked tab.
  const results = await browser.scripting.executeScript({
    target: { tabId },
    files: ["/content-scripts/extract.js"],
  });
  const extract = results[0]?.result as PageExtract | undefined;
  const deck = extract?.deck;

  if (!deck || deck.kind === "none") {
    showNotFoundBadge(tabId);
    return;
  }
  const payload = deck.kind === "text" ? deck.list : deck.code;
  const url = deckImportUrl(payload, { name: deck.name, source: extract?.sourceUrl });
  await browser.tabs.create({ url, index: tabIndex + 1 });
}

export default defineBackground(() => {
  actionApi().onClicked.addListener(async (tab) => {
    if (tab.id === undefined) {
      return;
    }
    try {
      await importDeckFromTab(tab.id, tab.index);
    } catch {
      // Injection fails on pages extensions cannot touch (browser-internal
      // pages, extension stores). Signal it the same way as "nothing found".
      showNotFoundBadge(tab.id);
    }
  });
});
