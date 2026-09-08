import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import type { PageExtract } from "@/lib/deck-extract";
import { deckImportUrl } from "@/lib/openrift-url";

const BADGE_CLEAR_MS = 4000;

/** `action` on MV3, `browserAction` on Firefox MV2 builds. */
function actionApi(): typeof browser.action {
  return browser.action ?? browser.browserAction;
}

function showNotFoundBadge(tabId: number): void {
  const action = actionApi();
  void action.setBadgeText({ tabId, text: "?" });
  void action.setBadgeBackgroundColor({ tabId, color: "#b91c1c" });
  setTimeout(() => {
    void action.setBadgeText({ tabId, text: "" });
  }, BADGE_CLEAR_MS);
}

async function importDeckFromTab(tabId: number, tabIndex: number): Promise<void> {
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

async function handleActionClick(tabId: number, tabIndex: number) {
  try {
    await importDeckFromTab(tabId, tabIndex);
  } catch {
    // Injection fails on browser-internal pages and extension stores.
    showNotFoundBadge(tabId);
  }
}

export default defineBackground(() => {
  actionApi().onClicked.addListener((tab) => {
    if (tab.id === undefined) {
      return;
    }
    void handleActionClick(tab.id, tab.index);
  });
});
