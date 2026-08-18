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
  const match = url.match(/\/_serverFn\/(?<encoded>[^/?#]+)/u);
  const encoded = match?.groups?.encoded;
  if (encoded === undefined) {
    return false;
  }
  try {
    return Buffer.from(encoded, "base64url").toString("utf-8").includes(fnName);
  } catch {
    return false;
  }
}

async function grantClipboard(page: Page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
}

// The deck top bar's overflow menu, which owns both Export and Print. Scoped
// to main because the global header's user menu is also aria-haspopup="menu"
// and comes first in DOM order.
function kebabTrigger(page: Page) {
  return page.locator("main").locator('button[aria-haspopup="menu"]').first();
}

async function openExportDialog(page: Page) {
  await kebabTrigger(page).click();
  await page.getByRole("menuitem", { name: "Export" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Export deck" })).toBeVisible();
  return dialog;
}

/**
 * Opens the print dialog, which hosts the proxy sheet, the registration form,
 * and the deck sheet. Registration and proxies used to live in the export
 * dialog and on a top-bar "Proxies" button respectively.
 * @returns The open dialog, on the requested tab.
 */
async function openPrintDialog(page: Page, tab: "Proxies" | "Registration" | "Deck sheet") {
  await kebabTrigger(page).click();
  await page.getByRole("menuitem", { name: "Print" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Print deck" })).toBeVisible();
  // Proxies is the tab the dialog opens on.
  if (tab !== "Proxies") {
    await dialog.getByRole("tab", { name: tab }).click();
  }
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
    test("clicking Export opens the dialog with three code tabs; Text is active", async ({
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

      // The dialog is code-only now: Image never shipped, and Registration
      // moved to the print dialog with the rest of the paper output.
      for (const tabName of ["Text", "Deck Code", "TTS"]) {
        await expect(dialog.getByRole("tab", { name: tabName })).toBeVisible();
      }
      await expect(dialog.getByRole("tab", { name: "Registration" })).toHaveCount(0);
      // The dialog opens on the Text tab by default (useState<ExportTab>("text")).
      await expect(dialog.getByRole("tab", { name: "Text" })).toHaveAttribute(
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

        // Default tab (Text) fires the mutation on open. For the other tabs,
        // click the trigger after the initial request lands — that re-fires the
        // mutation with the new format. The server fn was switched to GET so
        // don't filter on method.
        await exportRequest;
        if (tab === "Deck Code" || tab === "TTS") {
          const switchRequest = page.waitForRequest((request) =>
            isServerFn(request.url(), "exportDeckFn"),
          );
          await dialog.getByRole("tab", { name: tab }).click();
          await switchRequest;
        }

        const codeBox = dialog.getByRole("textbox");
        await expect(codeBox).toBeVisible({ timeout: 15_000 });
        // The textbox is rendered before `currentData?.code` lands (export
        // request is still in-flight in React-Query terms). Wait for a
        // non-empty value before reading it; otherwise inputValue() returns
        // "" and the length assertion fails racy.
        await expect(codeBox).not.toHaveValue("", { timeout: 15_000 });
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
    test("banner is visible on every code tab, and absent from the print dialog, when the deck is dirty", async ({
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
      await page.getByRole("button", { name: "Edit Main Deck", exact: true }).first().click();
      await page.getByPlaceholder(/search/iu).fill("Annie, Fiery");
      // Scope the Add click to the card tile so we don't race with the sidebar
      // adding a duplicate "Add to deck" button once the optimistic update lands.
      const annieTile = page
        .getByRole("img", { name: "Annie, Fiery" })
        .locator(
          "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' group ')][1]",
        )
        .first();
      await expect(annieTile).toBeVisible({ timeout: 15_000 });
      await annieTile.getByRole("button", { name: "Add to deck" }).click();
      // Wait for the optimistic update to land so isDirty is reliably true
      // before we open the export dialog. The sidebar's zone counter is the
      // barrier rather than the tile's own in-deck pill: this test only needs
      // the card to be in the deck, and the counter says so whether or not the
      // browser is still the surface on screen.
      await expect(page.getByText("1/39", { exact: true }).first()).toBeVisible({
        timeout: 5000,
      });

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

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      // Registration renders from the live draft rather than an exported code,
      // so the print dialog carries no such warning.
      const printDialog = await openPrintDialog(page, "Registration");
      await expect(
        printDialog.getByText(
          "You have unsaved changes. The exported code reflects the last saved state.",
        ),
      ).toHaveCount(0);
    });
  });

  test.describe("deck print: Registration tab", () => {
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

      const dialog = await openPrintDialog(page, "Registration");

      // Registration builds its PDF from the draft in memory, so opening it
      // must not reach for an exported code.
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
      // Addressed by label because the print dialog keeps the other tabs
      // mounted, and each of them has a page-size select of its own.
      await expect(dialog.getByLabel("Page Size", { exact: true })).toContainText("A4");

      const downloadPromise = waitForOptionalDownload(page, 30_000);
      await dialog.getByRole("button", { name: "Download PDF" }).click();

      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.pdf$/u);
        expect(download.suggestedFilename()).toContain("registration");
      }

      // Regardless of whether the download fired, the generating state must
      // resolve (button re-enables or dialog closes).
      await expect(async () => {
        const stillGenerating = await dialog
          .getByRole("button", { name: /Generating/u })
          .isVisible()
          .catch(() => false);
        expect(stillGenerating).toBe(false);
      }).toPass({ timeout: 30_000 });
    });
  });

  test.describe("deck export: empty deck", () => {
    test("Registration download is disabled with zero cards; code tabs still render", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await grantClipboard(page);
      const deckId = await createDeckViaApi(page.request, { name: `Export Empty ${Date.now()}` });
      await page.goto(`/decks/${deckId}`);

      const exportDialog = await openExportDialog(page);

      // Deck Code tab renders the textbox without crashing even for an empty
      // deck (server returns a short code for zero cards).
      await expect(exportDialog.getByRole("textbox").first()).toBeVisible({ timeout: 15_000 });

      await page.keyboard.press("Escape");
      await expect(exportDialog).toBeHidden();

      const printDialog = await openPrintDialog(page, "Registration");

      // An empty deck has nothing to register, so the button is disabled
      // rather than clickable-but-inert.
      const download = printDialog.getByRole("button", { name: "Download PDF" });
      await expect(download).toBeVisible();
      await expect(download).toBeDisabled();
    });
  });

  test.describe("proxy export: opening", () => {
    test("Print opens on the Proxies tab with default render mode and page size", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, { name: `Proxy Open ${Date.now()}` });
      await setDeckCardsViaApi(page.request, deckId, [
        { cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 },
      ]);
      await page.goto(`/decks/${deckId}`);

      const dialog = await openPrintDialog(page, "Proxies");
      await expect(dialog.getByRole("tab", { name: "Proxies" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      const renderModeTrigger = dialog.getByLabel("Render mode");
      const pageSizeTrigger = dialog.getByLabel("Page size", { exact: true });
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

      const dialog = await openPrintDialog(page, "Proxies");

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
        expect(download.suggestedFilename()).toMatch(/\.pdf$/u);
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

  test.describe("mobile access to export and print", () => {
    test("kebab menu exposes Export and Print entries that open the correct dialogs", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await page.setViewportSize({ width: 390, height: 844 });
      const deckId = await createDeckViaApi(page.request, { name: `Mobile Actions ${Date.now()}` });
      await setDeckCardsViaApi(page.request, deckId, [
        { cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 },
      ]);
      await page.goto(`/decks/${deckId}`);

      // The bar's only desktop action button is Share, behind `hidden md:flex`.
      await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);

      const exportDialog = await openExportDialog(page);
      await page.keyboard.press("Escape");
      await expect(exportDialog).toBeHidden();

      // Share is a menu entry on a phone, where the bar has no room for it.
      await kebabTrigger(page).click();
      await expect(page.getByRole("menuitem", { name: "Share" })).toBeVisible();
      await page.keyboard.press("Escape");

      await openPrintDialog(page, "Proxies");
    });
  });
});
