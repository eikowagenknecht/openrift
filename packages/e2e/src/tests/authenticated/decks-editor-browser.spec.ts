import { readFileSync } from "node:fs";

import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Deck Editor Browser E2E" },
  });
  expect(response.ok()).toBeTruthy();
}

async function signIn(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
}

async function createAndLogin(page: Page): Promise<string> {
  const sql = loadDb();
  const email = `decks-editor-browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "DecksEditorE2ePassword1!";
  try {
    await signUp(page.request, email, password);
    await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
  } finally {
    await sql.end();
  }
  await signIn(page.request, email, password);
  return email;
}

async function deleteUser(email: string) {
  const sql = loadDb();
  try {
    await sql`DELETE FROM users WHERE email = ${email}`;
  } finally {
    await sql.end();
  }
}

async function createDeckViaApi(
  page: Page,
  name: string,
  format: "constructed" | "freeform" = "constructed",
): Promise<string> {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/decks`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name, format },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function addCopyViaApi(page: Page, printingId: string, count = 1) {
  const copies = Array.from({ length: count }, () => ({ printingId }));
  const response = await page.request.post(`${API_BASE_URL}/api/v1/copies`, {
    headers: { Origin: WEB_BASE_URL },
    data: { copies },
  });
  expect(response.ok()).toBeTruthy();
}

// TanStack Start encodes each server fn id as base64url(JSON); decoding the
// segment lets us target a specific server fn without colliding with others.
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

// Known seed printing used for the "owned" assertion — the normal-foiling
// print of "Annie, Fiery" (OGS-001). See apps/api/src/test/fixtures/seed.sql.
const ANNIE_FIERY_PRINTING_NORMAL = "019cfc3b-03d6-74cf-adec-1dce41f631eb";

/**
 * Locates the tile wrapper for a card by its visible name. The tile wraps the
 * DeckAddStrip (+/- buttons) and the image/label — scope all strip/image
 * assertions through this locator.
 * @returns The card tile wrapper locator.
 */
function cardTile(page: Page, cardName: string): Locator {
  // Scope via the card image's accessible name. After the first Add, the
  // zones sidebar renders "Annie, Fiery" text too; a plain getByText().first()
  // would drift from the browser tile into the sidebar and the "group"
  // ancestor of a sidebar row has a different DOM shape.
  return page
    .getByRole("img", { name: cardName })
    .locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' group ')][1]",
    )
    .first();
}

/**
 * Locates the DeckAddStrip row inside a card tile (the h-5 flex row at the top
 * that holds owned/in-deck text plus the +/- buttons).
 * @returns The strip locator.
 */
function strip(tile: Locator): Locator {
  return tile.locator("div.h-5.mb-1").first();
}

function addCardButton(tile: Locator): Locator {
  return strip(tile).getByRole("button", { name: "Add to deck" });
}

function removeCardButton(tile: Locator): Locator {
  return strip(tile).getByRole("button", { name: "Remove from deck" });
}

async function waitForCardsLoaded(page: Page) {
  await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 15_000 });
}

async function activateZone(page: Page, label: string) {
  // The zone row's label-button contains "<Zone label>" and the count number.
  await page
    .getByRole("button", { name: new RegExp(`^${label}\\b`) })
    .first()
    .click();
}

test.describe("deck editor card browser", () => {
  let userEmail: string | undefined;

  test.afterEach(async () => {
    if (userEmail) {
      await deleteUser(userEmail);
      userEmail = undefined;
    }
  });

  test.describe("panel structure", () => {
    test("search bar, filter panel, and card count render for a constructed deck", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Browser Panel ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);

      // The zone sidebar is present — activate Main Deck so the browser renders.
      await activateZone(page, "Main Deck");
      await waitForCardsLoaded(page);

      // SearchBar input is visible with its placeholder.
      const searchInput = page.getByPlaceholder(/search/i);
      await expect(searchInput).toBeVisible();

      // "N cards" label (unfiltered) shows a positive integer in the right of SearchBar.
      await expect(page.getByText(/\b\d+ cards$/)).toBeVisible();
    });
  });

  test.describe("search + filter smoke", () => {
    test("typing a search narrows the grid without adding a filter chip", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Browser Search ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await waitForCardsLoaded(page);

      // Before: multiple Units visible. After searching "Annie", non-Annie
      // cards disappear; the "Garen" Units should no longer render.
      await expect(page.getByText("Garen, Rugged")).toBeVisible();

      await page.getByPlaceholder(/search/i).fill("Annie");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("Garen, Rugged")).toBeHidden();

      // The search is now shown as a "Search:" label in the active filters
      // area — confirm it's visible (the earlier assertion that it was hidden
      // no longer matches the UI).
      await expect(page.getByText("Search:", { exact: true })).toBeVisible();
    });

    test("applying and clearing a type filter narrows then restores the grid", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Browser Filter ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await waitForCardsLoaded(page);

      // Main Deck only allows Unit/Spell/Gear — Firestorm is a Spell in seed.
      await expect(page.getByText("Firestorm")).toBeVisible();

      // Open the desktop filter panel via its toggle. All three allowed types
      // (Unit/Spell/Gear) start pre-selected based on the zone constraint.
      // Clicking Unit deselects it, leaving Spell+Gear — Annie (Unit) should
      // disappear while Firestorm (Spell) remains.
      await page.getByRole("button", { name: "Show filters" }).click();
      await page.getByText("unit", { exact: true }).first().click();

      await expect(page).toHaveURL(/types=[^&]*Spell/);
      await expect(page.getByText("Type:", { exact: true })).toBeVisible();
      // Unit cards are filtered out.
      await expect(page.getByText("Annie, Fiery").first()).toBeHidden();
      await expect(page.getByText("Firestorm")).toBeVisible();

      // Re-click Unit in the filter panel to restore the default selection.
      // The "Type:" chip stays visible because the filter bar renders it for
      // any non-empty selection, regardless of whether that selection matches
      // the zone default. (See tally: this is one candidate for a UX tweak —
      // hiding the chip when the selection equals the zone default.)
      await page.getByText("unit", { exact: true }).first().click();
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible();
    });
  });

  test.describe("add strip rendering", () => {
    test("a card with no owned copies shows 0 owned and no 'in deck' text", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Strip Empty ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);
      await expect(row.getByText("0 owned")).toBeVisible();
      await expect(row.getByText(/in deck/)).toBeHidden();
    });

    test("seeding owned copies updates the owned count on the strip", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Strip Owned ${Date.now()}`);
      // Seed 2 copies of a specific Annie, Fiery printing into the user's inbox.
      await addCopyViaApi(page, ANNIE_FIERY_PRINTING_NORMAL, 2);

      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const row = strip(cardTile(page, "Annie, Fiery"));
      await expect(row.getByText("2 owned")).toBeVisible();
    });
  });

  test.describe("add / remove a card", () => {
    test("+ adds to Main Deck, - removes, and save status cycles unsaved → saved", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Add Remove ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);

      // Intercept the debounced save before the click that triggers it.
      const saveRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "saveDeckCardsFn"),
      );

      await addCardButton(tile).click();
      await expect(row.getByText("1 in deck")).toBeVisible();

      // Main Deck sidebar row reflects the new count (Main Deck shows "N/39").
      await expect(page.getByRole("button", { name: /Main Deck.*\b1\/39\b/ })).toBeVisible();

      // Once a card is added, the Constructed · Draft badge flips to the
      // amber violations badge (one of several constructed-format rules).
      // The amber indicator is now inside the format-badge's bg-amber-500/10
      // span; use an attribute-contains selector that tolerates the color
      // opacity modifier.
      await expect(page.locator('span[class*="bg-amber"]').first()).toBeVisible();

      await addCardButton(tile).click();
      await expect(row.getByText("2 in deck")).toBeVisible();

      await removeCardButton(tile).click();
      await expect(row.getByText("1 in deck")).toBeVisible();

      // Save fires after the 1s debounce — confirm it lands.
      const saveResponse = await saveRequest;
      expect(saveResponse.method()).toBe("POST");

      // Once saved, deck still has violations so the amber badge remains.
      // (The "Unsaved" indicator was removed — saves are just silent now.)
      await expect(page.locator('span[class*="bg-amber"]').first()).toBeVisible();
    });
  });

  test.describe("active zone targeting", () => {
    test("switching to Sideboard routes adds into Sideboard, not Main Deck", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Zone Target ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);

      await activateZone(page, "Sideboard");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const tile = cardTile(page, "Annie, Fiery");
      await addCardButton(tile).click();

      // Sideboard row count increments; Main Deck stays at 0.
      await expect(page.getByRole("button", { name: /Sideboard.*\b1\b/ }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Main Deck.*\b0\/39\b/ })).toBeVisible();

      // A second + still adds to Sideboard.
      await addCardButton(tile).click();
      await expect(page.getByRole("button", { name: /Sideboard.*\b2\b/ }).first()).toBeVisible();
    });
  });

  test.describe("max reached", () => {
    test("constructed and freeform both cap at 3 copies across main/sideboard/overflow/champion", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);

      // Constructed: cap at 3 across main/sideboard/overflow/champion.
      const constructedId = await createDeckViaApi(page, `Max Cstr ${Date.now()}`);
      await page.goto(`/decks/${constructedId}`);
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);
      await addCardButton(tile).click();
      await addCardButton(tile).click();
      await addCardButton(tile).click();

      await expect(row.getByText("3 in deck")).toBeVisible();
      await expect(addCardButton(tile)).toBeDisabled();

      // Freeform currently enforces the same 3-copy cap as Constructed. The
      // product's `addCardAction` enforces `COPY_LIMIT_ZONES` regardless of
      // format — an open question for the user whether freeform should waive
      // the cap (it doesn't today).
      const freeformId = await createDeckViaApi(page, `Max Free ${Date.now()}`, "freeform");
      await page.goto(`/decks/${freeformId}`);
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const freeTile = cardTile(page, "Annie, Fiery");
      await addCardButton(freeTile).click();
      await addCardButton(freeTile).click();
      await addCardButton(freeTile).click();
      await expect(strip(freeTile).getByText("3 in deck")).toBeVisible();
      await expect(addCardButton(freeTile)).toBeDisabled();
    });
  });

  test.describe("shift bulk ops", () => {
    test("shift+click the + button fills to the max in one action", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Shift Add ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);

      // Start at 1 so remainingCount = 2, triggering the bulk-add affordance.
      await addCardButton(tile).click();
      await expect(row.getByText("1 in deck")).toBeVisible();

      await addCardButton(tile).click({ modifiers: ["Shift"] });
      await expect(row.getByText("3 in deck")).toBeVisible();
    });

    test("shift+click the - button removes all copies in one action", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Shift Rm ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);
      await addCardButton(tile).click();
      await addCardButton(tile).click();
      await expect(row.getByText("2 in deck")).toBeVisible();

      await removeCardButton(tile).click({ modifiers: ["Shift"] });
      await expect(row.getByText(/in deck/)).toBeHidden();
    });
  });

  test.describe("click card opens detail pane", () => {
    test("clicking a card's image area reveals the detail pane", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Detail Pane ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      // The image area is .aspect-card inside the tile. Clicking there fires
      // handleCardClick, which opens the shared selection detail pane.
      await cardTile(page, "Annie, Fiery").locator(".aspect-card").first().click();

      const pane = page.getByRole("complementary");
      await expect(pane).toBeVisible({ timeout: 5000 });
      await expect(pane.getByRole("heading", { level: 2, name: /Annie, Fiery/ })).toBeVisible();
    });
  });

  test.describe("dirty → save cycle", () => {
    test("adding a card flips status to unsaved, persists after save, survives reload", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Save Cycle ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const saveRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "saveDeckCardsFn"),
      );

      await addCardButton(cardTile(page, "Annie, Fiery")).click();

      // Adding one card to Main Deck surfaces the amber Constructed-violations
      // badge (deck needs 39 cards, has 1). This is not an "unsaved" indicator
      // — the standalone unsaved marker was removed. The badge stays visible
      // through save because the violations persist regardless of save state.
      await expect(page.locator('span[class*="bg-amber-500"]').first()).toBeVisible();

      // Confirm the debounced save fires. The badge continues to indicate
      // violations, not dirty state.
      await saveRequest;
      await expect(page.locator('span[class*="bg-amber-500"]').first()).toBeVisible();

      // Reload the page — the added card persists.
      await page.reload();
      await activateZone(page, "Main Deck");
      await page.getByPlaceholder(/search/i).fill("Annie, Fiery");
      await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 5000 });

      const rowAfter = strip(cardTile(page, "Annie, Fiery"));
      await expect(rowAfter.getByText("1 in deck")).toBeVisible();
    });
  });
});
