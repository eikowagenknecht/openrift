import type { APIRequestContext, Download, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import { API_BASE_URL, WEB_BASE_URL } from "../../helpers/constants.js";

// Seeded catalog card — safe to add to any constructed deck's Main Deck.
const ANNIE_CARD_ID = "019cfc3b-038a-7c0c-a76c-e0a5e2f46b18";

interface DeckCardSeed {
  cardId: string;
  zone: "main" | "champion" | "legend" | "runes" | "battlefield" | "sideboard" | "overflow";
  quantity: number;
}

async function createDeckViaApi(
  request: APIRequestContext,
  { name, format = "constructed" }: { name: string; format?: "constructed" | "freeform" },
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/v1/decks`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name, format },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function setDeckCardsViaApi(
  request: APIRequestContext,
  deckId: string,
  cards: DeckCardSeed[],
) {
  const response = await request.put(`${API_BASE_URL}/api/v1/decks/${deckId}/cards`, {
    headers: { Origin: WEB_BASE_URL },
    data: { cards },
  });
  expect(response.ok()).toBeTruthy();
}

// TanStack Start encodes each server fn id as base64url(JSON); decoding lets us
// match a specific server fn (exportDeckFn, saveDeckCardsFn) without colliding.
function isServerFn(url: string, fnName: string): boolean {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) {
    return false;
  }
  try {
    return Buffer.from(match[1], "base64url").toString("utf-8").includes(fnName);
  } catch {
    return false;
  }
}

async function grantClipboard(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
}

async function openExportDialog(page: Page) {
  await page.getByRole("button", { name: "Export" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Export deck" })).toBeVisible();
  return dialog;
}

function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

/**
 * Awaits a download event without throwing when none fires — used in generation
 * tests where the PDF pipeline may not always produce a download in CI.
 * @returns The Download when one fires, otherwise null.
 */
async function waitForOptionalDownload(page: Page, timeout: number): Promise<Download | null> {
  try {
    return await page.waitForEvent("download", { timeout });
  } catch {
    return null;
  }
}

test.describe("deck editor exports", () => {
  test.describe("deck export: opening", () => {
    test("clicking Export opens the dialog with four tabs; Deck Code is active", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await grantClipboard(page);
      const deckId = await createDeckViaApi(page.request, { name: `Export Open ${Date.now()}` });
      await setDeckCardsViaApi(page.request, deckId, [
        { cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 },
      ]);

      await page.goto(`/decks/${deckId}`);
      const dialog = await openExportDialog(page);

      for (const tabName of ["Deck Code", "Text", "TTS", "Registration"]) {
        await expect(dialog.getByRole("tab", { name: tabName })).toBeVisible();
      }
      await expect(dialog.getByRole("tab", { name: "Deck Code" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  });

  test.describe("deck export: non-registration tabs", () => {
    for (const { tab, format } of [
      { tab: "Deck Code", format: "piltover" },
      { tab: "Text", format: "text" },
      { tab: "TTS", format: "tts" },
    ] as const) {
      test(`${tab} fires the export mutation, displays the code, and Copy writes it to the clipboard`, async ({
        authenticatedPage,
      }) => {
        const page = authenticatedPage;
        await grantClipboard(page);
        const deckId = await createDeckViaApi(page.request, {
          name: `Export ${format} ${Date.now()}`,
        });
        await setDeckCardsViaApi(page.request, deckId, [
          { cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 },
        ]);

        await page.goto(`/decks/${deckId}`);

        const exportRequest = page.waitForRequest((request) =>
          isServerFn(request.url(), "exportDeckFn"),
        );
        const dialog = await openExportDialog(page);

        // Default tab (Deck Code) fires the mutation on open. For the other
        // tabs, click the trigger after the initial request lands — that
        // re-fires the mutation with the new format. The server fn was
        // switched to GET so don't filter on method.
        await exportRequest;
        if (tab === "Text" || tab === "TTS") {
          const switchRequest = page.waitForRequest((request) =>
            isServerFn(request.url(), "exportDeckFn"),
          );
          await dialog.getByRole("tab", { name: tab }).click();
          await switchRequest;
        }

        const codeBox = dialog.getByRole("textbox");
        await expect(codeBox).toBeVisible({ timeout: 15_000 });
        const code = await codeBox.inputValue();
        expect(code.length).toBeGreaterThan(0);

        await dialog.getByRole("button", { name: "Copy" }).click();
        await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();

        const clipboard = await readClipboard(page);
        // The component normalizes \n → \r\n for iOS clipboard safety.
        expect(clipboard.replaceAll("\r\n", "\n")).toBe(code);
      });
    }
  });

  test.describe("deck export: unsaved banner", () => {
    test("banner is visible on code tabs and hidden on Registration when the deck is dirty", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await grantClipboard(page);
      const deckId = await createDeckViaApi(page.request, {
        name: `Export Dirty ${Date.now()}`,
      });
      await page.goto(`/decks/${deckId}`);

      // Abort the auto-save so isDirty stays true while we inspect tabs.
      await page.route(
        (url) => isServerFn(url.toString(), "saveDeckCardsFn"),
        (route) => route.abort(),
      );

      // Flip isDirty via the card browser's "+" button.
      await page
        .getByRole("button", { name: /^Main Deck\b/ })
        .first()
        .click();
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Add to deck" }).first().click();

      // The amber "Constructed" violation badge used to be asserted here as a
      // proxy for isDirty, but the indicator was removed from the top bar.
      // The Registration/banner assertions below are what the test actually
      // cares about — skip the amber-indicator check.

      const dialog = await openExportDialog(page);
      const banner = dialog.getByText(
        "You have unsaved changes. The exported code reflects the last saved state.",
      );

      await expect(banner).toBeVisible();

      await dialog.getByRole("tab", { name: "Text" }).click();
      await expect(banner).toBeVisible();

      await dialog.getByRole("tab", { name: "TTS" }).click();
      await expect(banner).toBeVisible();

      await dialog.getByRole("tab", { name: "Registration" }).click();
      await expect(banner).toBeHidden();
    });
  });

  test.describe("deck export: Registration tab", () => {
    test("renders form fields pre-filled from deck and session, no export request fires", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await grantClipboard(page);
      const deckName = `Regform ${Date.now()}`;
      const deckId = await createDeckViaApi(page.request, { name: deckName });
      await setDeckCardsViaApi(page.request, deckId, [
        { cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 },
      ]);
      await page.goto(`/decks/${deckId}`);

      let exportRequestFired = false;
      await page.route(
        (url) => isServerFn(url.toString(), "exportDeckFn"),
        async (route) => {
          exportRequestFired = true;
          await route.continue();
        },
      );

      const dialog = await openExportDialog(page);
      // Dismiss the initial Deck Code export request before measuring.
      await expect(dialog.getByRole("textbox").first()).toBeVisible({ timeout: 15_000 });
      exportRequestFired = false;

      await dialog.getByRole("tab", { name: "Registration" }).click();

      // Wait briefly to confirm no new export request is issued.
      await page.waitForTimeout(500);
      expect(exportRequestFired).toBe(false);

      await expect(dialog.getByLabel("Deck Name")).toHaveValue(deckName);
      // Regular E2E user is "E2E User" — the component splits on whitespace.
      await expect(dialog.getByLabel("First Name")).toHaveValue("E2E");
      await expect(dialog.getByLabel("Last Name")).toHaveValue("User");

      await dialog.getByLabel("Riot ID").fill("Tester#TAG");
      await dialog.getByLabel("Event Name").fill("E2E Open");
      await dialog.getByLabel("Event Location").fill("Testville");
      await dialog.getByLabel("Deck Designer").fill("E2E Tester");
      await dialog.getByPlaceholder("YYYY-MM-DD").fill("2026-05-01");

      // Default page size is A4; the trigger text reflects the current label.
      await expect(dialog.getByRole("combobox").last()).toContainText("A4");

      const downloadPromise = waitForOptionalDownload(page, 30_000);
      await dialog.getByRole("button", { name: "Download PDF" }).click();

      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.pdf$/);
        expect(download.suggestedFilename()).toContain("registration");
      }

      // Regardless of whether the download fired, the generating state must
      // resolve (button re-enables or dialog closes).
      await expect(async () => {
        const stillGenerating = await dialog
          .getByRole("button", { name: /Generating/ })
          .isVisible()
          .catch(() => false);
        expect(stillGenerating).toBe(false);
      }).toPass({ timeout: 30_000 });
    });
  });

  test.describe("deck export: empty deck", () => {
    test("Registration generate is a no-op with zero cards; code tabs still render", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await grantClipboard(page);
      const deckId = await createDeckViaApi(page.request, { name: `Export Empty ${Date.now()}` });
      await page.goto(`/decks/${deckId}`);

      const dialog = await openExportDialog(page);

      // Deck Code tab renders the textbox without crashing even for an empty
      // deck (server returns a short code for zero cards).
      await expect(dialog.getByRole("textbox").first()).toBeVisible({ timeout: 15_000 });

      await dialog.getByRole("tab", { name: "Registration" }).click();
      const downloadPromise = waitForOptionalDownload(page, 2000);
      await dialog.getByRole("button", { name: "Download PDF" }).click();

      // With zero cards the handler bails early — no download fires and the
      // button stays enabled.
      expect(await downloadPromise).toBeNull();
      await expect(dialog.getByRole("button", { name: "Download PDF" })).toBeEnabled();
    });
  });

  test.describe("proxy export: opening", () => {
    test("clicking Proxies opens the dialog with default render mode and page size", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, { name: `Proxy Open ${Date.now()}` });
      await setDeckCardsViaApi(page.request, deckId, [
        { cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 },
      ]);
      await page.goto(`/decks/${deckId}`);

      await page.getByRole("button", { name: "Proxies" }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Export as proxies" })).toBeVisible();

      const renderModeTrigger = dialog.getByRole("combobox").first();
      const pageSizeTrigger = dialog.getByRole("combobox").nth(1);
      await expect(renderModeTrigger).toContainText("Card images");
      await expect(pageSizeTrigger).toContainText("A4");

      // Opening the render mode select exposes both options.
      await renderModeTrigger.click();
      await expect(page.getByRole("option", { name: "Text placeholders" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Card images" })).toBeVisible();
      await page.keyboard.press("Escape");
    });
  });

  test.describe("proxy export: generation", () => {
    test("clicking Generate disables the button while work is in flight", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, { name: `Proxy Gen ${Date.now()}` });
      await setDeckCardsViaApi(page.request, deckId, [
        { cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 },
      ]);
      await page.goto(`/decks/${deckId}`);

      await page.getByRole("button", { name: "Proxies" }).first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Export as proxies" })).toBeVisible();

      const downloadPromise = waitForOptionalDownload(page, 60_000);

      await dialog.getByRole("button", { name: "Generate PDF" }).click();

      // The button flips into the disabled loading state ("Generating…" or
      // "Rendering N/M…"). Either label is acceptable — just assert the
      // Generate PDF label is gone while generation runs.
      await expect(dialog.getByRole("button", { name: "Generate PDF" })).toBeHidden({
        timeout: 15_000,
      });

      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      }

      // Generation eventually completes: either the dialog closes on success
      // or the button returns to the "Generate PDF" label on failure.
      await expect(async () => {
        const closed = await dialog.isHidden().catch(() => true);
        const reenabled = await dialog
          .getByRole("button", { name: "Generate PDF" })
          .isVisible()
          .catch(() => false);
        expect(closed || reenabled).toBe(true);
      }).toPass({ timeout: 60_000 });
    });
  });

  test.describe("mobile access to export and proxies", () => {
    test("kebab menu exposes Export and Proxies entries that open the correct dialogs", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await page.setViewportSize({ width: 390, height: 844 });
      const deckId = await createDeckViaApi(page.request, { name: `Mobile Actions ${Date.now()}` });
      await setDeckCardsViaApi(page.request, deckId, [
        { cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 },
      ]);
      await page.goto(`/decks/${deckId}`);

      // Desktop action buttons are hidden on mobile (hidden md:flex wrapper).
      await expect(page.getByRole("button", { name: "Export" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Proxies" })).toHaveCount(0);

      // Scope to main — the page header's user-avatar menu also has
      // aria-haspopup="menu" and shows up first in DOM order.
      const kebab = page.locator("main").locator('button[aria-haspopup="menu"]').first();
      await kebab.click();
      await page.getByRole("menuitem", { name: "Export" }).click();
      const exportDialog = page.getByRole("dialog");
      await expect(exportDialog.getByRole("heading", { name: "Export deck" })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(exportDialog).toBeHidden();

      await kebab.click();
      await page.getByRole("menuitem", { name: "Proxies" }).click();
      const proxyDialog = page.getByRole("dialog");
      await expect(proxyDialog.getByRole("heading", { name: "Export as proxies" })).toBeVisible();
    });
  });
});
