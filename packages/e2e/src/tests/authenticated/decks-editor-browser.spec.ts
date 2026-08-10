import { readFileSync } from "node:fs";

import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";
import { scrollUntilVisible } from "../../helpers/virtualized.js";

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
  // Scope via the card image's accessible name, then require the tile to carry
  // an add button. Once the card is in the deck, its zone row renders the same
  // image, and climbing from that one lands on a wrapper with no strip — the
  // add button is what tells the browser's tile apart from a deck row.
  return page
    .getByRole("img", { name: cardName })
    .locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' group ')][1]",
    )
    .filter({ has: page.getByRole("button", { name: "Add to deck" }) })
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
  await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
    timeout: 15_000,
  });
  // The deck browser toolbar/grid is useHydrated-gated; wait for the on-demand
  // route chunks to settle so search/add/filter handlers are wired before we
  // interact (otherwise an early click/keystroke is silently dropped).
  await page.waitForLoadState("networkidle");
}

// The deck browser mirrors /cards: its search debounces and syncs to the URL
// (?search=), and Playwright's atomic fill() can be dropped before hydration.
// Retry real keystrokes until the query commits to the URL.
async function searchFor(page: Page, query: string) {
  // Some tests search right after activating a zone without a separate
  // waitForCardsLoaded; settle the on-demand chunks first so the search input
  // (and any later add buttons) are hydrated.
  await page.waitForLoadState("networkidle");
  const search = page.getByPlaceholder(/search/iu);
  await expect(async () => {
    await search.click();
    await search.fill("");
    await search.pressSequentially(query, { delay: 20 });
    await expect(page).toHaveURL(/[?&]search=/u, { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

// The zone label is a Pressable named "Edit <zone>"; its count is a sibling
// span in the same header row, so the count is read off the section wrapper
// (the header's parent) rather than out of the button's accessible name.
function zoneLabelButton(page: Page, label: string): Locator {
  return page.getByRole("button", { name: `Edit ${label}`, exact: true }).first();
}

// The header's trailing count span: "N" on zones with no target, "N/target"
// on the ones that have one (Main Deck 39, Runes 12, ...).
function zoneCount(page: Page, label: string): Locator {
  return zoneLabelButton(page, label).locator("xpath=following-sibling::span[last()]");
}

async function activateZone(page: Page, label: string) {
  await zoneLabelButton(page, label).click();
}

// On mobile the zones sidebar is collapsed; tapping the title button opens it so
// the zone rows become clickable, then activate the requested zone.
async function activateZoneMobile(page: Page, label: string) {
  await expect(page.getByRole("heading", { name: "Zones", level: 1 }).first()).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByRole("button", { name: /^Zones/u })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Deck Zones" })).toBeVisible();
  await activateZone(page, label);
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
      const searchInput = page.getByPlaceholder(/search/iu);
      await expect(searchInput).toBeVisible();

      // "N cards" label (unfiltered) shows a positive integer in the right of SearchBar.
      await expect(page.getByText(/\d+ \/ \d+ cards$/u)).toBeVisible();
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
      await expect(page.getByRole("img", { name: "Garen, Rugged" })).toBeVisible();

      await searchFor(page, "Annie");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByRole("img", { name: "Garen, Rugged" })).toBeHidden();

      // The search is now shown as a "Search:" label in the active filters
      // area — confirm it's visible (the earlier assertion that it was hidden
      // no longer matches the UI).
      // The "Search:" group label is responsively hidden in the narrow deck
      // browser panel (hidden sm:inline), so assert the chip is present rather
      // than visible — the grid narrowing above already proves the search took.
      await expect(page.getByText("Search:", { exact: true })).toBeAttached();
    });

    test("applying and clearing a type filter narrows then restores the grid", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Browser Filter ${Date.now()}`);
      // The active-filter chip strip renders as a compact single row on mobile
      // (on desktop the chips live in a hidden left-pane variant); use a phone
      // viewport so the removable chips are the visible ones.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/decks/${deckId}`);
      await activateZoneMobile(page, "Main Deck");

      // Activating Main Deck pre-seeds the type filter with the zone's allowed
      // types (Unit/Spell/Gear), rendered as removable chips in the active-filter
      // strip. Wait for that filter to apply (its Unit chip appearing) rather
      // than for a specific card — the unfiltered grid is grouped and
      // virtualized, so Annie can be off-screen until the filter narrows it.
      const unitChip = page.locator('[data-slot="badge"]:visible', { hasText: /^Unit/u }).first();
      await expect(unitChip).toBeVisible({ timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      // Annie is a Unit, Firestorm a Spell — both are in the default filter set.
      // The grouped grid is virtualized, so scroll Annie into view to confirm it.
      await scrollUntilVisible(page, page.getByRole("img", { name: "Annie, Fiery" }));

      // The desktop "Show filters" collapsible isn't drivable in the dev harness
      // (see public/cards-filters.spec.ts), but the active-filter chips are plain
      // buttons. Removing the Unit chip leaves Spell+Gear, so Annie drops out
      // while Firestorm remains.
      await unitChip.getByRole("button").click();
      await expect(page).not.toHaveURL(/[?&]types=[^&]*unit/iu);
      await expect(page.getByRole("img", { name: "Annie, Fiery" })).toHaveCount(0);
      await scrollUntilVisible(page, page.getByRole("img", { name: "Firestorm" }));

      // Clearing every filter drops the type constraint entirely; Annie returns.
      await page.getByRole("button", { name: "Clear all filters" }).click();
      await expect(page).not.toHaveURL(/[?&]types=/u);
      await scrollUntilVisible(page, page.getByRole("img", { name: "Annie, Fiery" }));
    });
  });

  test.describe("add strip rendering", () => {
    test("a card with no owned copies shows 0 owned and no 'in deck' text", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Strip Empty ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);
      await expect(row.getByTitle("0 owned")).toBeVisible();
      await expect(row.getByText(/in deck/u)).toBeHidden();
    });

    test("seeding owned copies updates the owned count on the strip", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Strip Owned ${Date.now()}`);
      // Seed 2 copies of a specific Annie, Fiery printing into the user's inbox.
      await addCopyViaApi(page, ANNIE_FIERY_PRINTING_NORMAL, 2);

      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const row = strip(cardTile(page, "Annie, Fiery"));
      await expect(row.getByTitle("2 owned")).toBeVisible();
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
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);

      // Intercept the debounced save before the click that triggers it.
      const saveRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "saveDeckCardsFn"),
      );

      await addCardButton(tile).click();
      await expect(row.getByTitle("1 in deck")).toBeVisible();

      // Main Deck sidebar section reflects the new count (Main Deck shows "N/39").
      await expect(zoneCount(page, "Main Deck")).toHaveText("1/39");

      // Once a card is added, the Constructed · Draft badge flips to the
      // amber violations badge (one of several constructed-format rules).
      // The amber indicator is now inside the format-badge's bg-amber-500/10
      // span; use an attribute-contains selector that tolerates the color
      // opacity modifier.
      await expect(page.locator('span[class*="bg-amber"]').first()).toBeVisible();

      await addCardButton(tile).click();
      await expect(row.getByTitle("2 in deck")).toBeVisible();

      await removeCardButton(tile).click();
      await expect(row.getByTitle("1 in deck")).toBeVisible();

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
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const tile = cardTile(page, "Annie, Fiery");
      await addCardButton(tile).click();

      // Sideboard count increments; Main Deck stays at 0.
      await expect(zoneCount(page, "Sideboard")).toHaveText("1");
      await expect(zoneCount(page, "Main Deck")).toHaveText("0/39");

      // A second + still adds to Sideboard.
      await addCardButton(tile).click();
      await expect(zoneCount(page, "Sideboard")).toHaveText("2");
    });
  });

  test.describe("max reached", () => {
    test("constructed caps at 3 copies across main/sideboard; freeform is uncapped", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);

      // Constructed: cap at 3 across main/sideboard/overflow/champion.
      const constructedId = await createDeckViaApi(page, `Max Cstr ${Date.now()}`);
      await page.goto(`/decks/${constructedId}`);
      await activateZone(page, "Main Deck");
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);
      await addCardButton(tile).click();
      await addCardButton(tile).click();
      await addCardButton(tile).click();

      await expect(row.getByTitle("3 in deck")).toBeVisible();
      await expect(addCardButton(tile)).toBeDisabled();

      // Freeform waives the 3-copy cap. The store's add path skips
      // COPY_LIMIT_ZONES for freeform decks (use-deck-builder.ts:
      // `if (!freeform && COPY_LIMIT_ZONES.has(zone))`), and the browser's
      // isMaxReached returns false for freeform — so the add button never
      // disables and copies can climb past three.
      const freeformId = await createDeckViaApi(page, `Max Free ${Date.now()}`, "freeform");
      await page.goto(`/decks/${freeformId}`);
      await activateZone(page, "Main Deck");
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const freeTile = cardTile(page, "Annie, Fiery");
      await addCardButton(freeTile).click();
      await addCardButton(freeTile).click();
      await addCardButton(freeTile).click();
      await expect(strip(freeTile).getByTitle("3 in deck")).toBeVisible();
      // No cap in freeform: the button stays enabled and a fourth copy lands.
      await expect(addCardButton(freeTile)).toBeEnabled();
      await addCardButton(freeTile).click();
      await expect(strip(freeTile).getByTitle("4 in deck")).toBeVisible();
    });
  });

  test.describe("shift bulk ops", () => {
    test("shift+click the + button fills to the max in one action", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Shift Add ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);

      // Start at 1 so remainingCount = 2, triggering the bulk-add affordance.
      await addCardButton(tile).click();
      await expect(row.getByTitle("1 in deck")).toBeVisible();

      await addCardButton(tile).click({ modifiers: ["Shift"] });
      await expect(row.getByTitle("3 in deck")).toBeVisible();
    });

    test("shift+click the - button removes all copies in one action", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Shift Rm ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const tile = cardTile(page, "Annie, Fiery");
      const row = strip(tile);
      await addCardButton(tile).click();
      await addCardButton(tile).click();
      await expect(row.getByTitle("2 in deck")).toBeVisible();

      await removeCardButton(tile).click({ modifiers: ["Shift"] });
      await expect(row.getByText(/in deck/u)).toBeHidden();
    });
  });

  test.describe("click card opens the card detail", () => {
    test("clicking a card's image area reveals the card detail", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Detail Pane ${Date.now()}`);
      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      // The image area is .aspect-card inside the tile. Clicking there fires
      // handleCardClick, which opens the shared selection detail.
      await cardTile(page, "Annie, Fiery").locator(".aspect-card").first().click();

      // Docking the pane is an opt-in display preference (`paneDocked`, off by
      // default), so the detail arrives as a dialog.
      const detail = page.getByRole("dialog");
      await expect(detail).toBeVisible({ timeout: 5000 });
      await expect(detail.getByRole("heading", { name: /Annie, Fiery/u }).first()).toBeVisible();
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
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      // Wait for the save RESPONSE (not just the request), so the debounced
      // save has committed server-side before we reload — otherwise the reload
      // can abort the in-flight POST and the card never persists.
      const saveResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" && isServerFn(response.url(), "saveDeckCardsFn"),
      );

      await addCardButton(cardTile(page, "Annie, Fiery")).click();

      // Adding one card to Main Deck surfaces the amber Constructed-violations
      // badge (deck needs 39 cards, has 1). This is not an "unsaved" indicator
      // — the standalone unsaved marker was removed. The badge stays visible
      // through save because the violations persist regardless of save state.
      await expect(page.locator('span[class*="bg-amber-500"]').first()).toBeVisible();

      // Confirm the debounced save completes. The badge continues to indicate
      // violations, not dirty state.
      await saveResponse;
      await expect(page.locator('span[class*="bg-amber-500"]').first()).toBeVisible();

      // Reload the page — the added card persists.
      await page.reload();
      await activateZone(page, "Main Deck");
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const rowAfter = strip(cardTile(page, "Annie, Fiery"));
      // After reload the per-tile "in deck" count comes from a separate deck-cards
      // query that resolves a beat after the grid image mounts; give it headroom.
      await expect(rowAfter.getByTitle("1 in deck")).toBeVisible({ timeout: 15_000 });
    });
  });
});
