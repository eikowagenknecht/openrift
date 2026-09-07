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
  const match = /\/_serverFn\/(?<encoded>[^/?#]+)/u.exec(url);
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

// Normal-foiling print of "Annie, Fiery" (OGS-001). See apps/api/src/test/fixtures/seed.sql.
const ANNIE_FIERY_PRINTING_NORMAL = "019cfc3b-03d6-74cf-adec-1dce41f631eb";

// A deck-zone row renders the same card image with no add-strip; the add
// button distinguishes a browser tile from a zone row.
function cardTile(page: Page, cardName: string): Locator {
  return page
    .getByRole("img", { name: cardName })
    .locator(
      "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' group ')][1]",
    )
    .filter({ has: page.getByRole("button", { name: "Add to deck" }) })
    .first();
}

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
  // useHydrated-gated: wait for on-demand chunks, or an early click/keystroke is dropped.
  await page.waitForLoadState("networkidle");
}

// Search debounces and syncs to the URL; Playwright's atomic fill() can be
// dropped before hydration, so retry real keystrokes until the URL commits.
async function searchFor(page: Page, query: string) {
  await page.waitForLoadState("networkidle");
  const search = page.getByPlaceholder(/search/iu);
  await expect(async () => {
    await search.click();
    await search.fill("");
    await search.pressSequentially(query, { delay: 20 });
    await expect(page).toHaveURL(/[?&]search=/u, { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

// The zone's count is a sibling span, not part of the button's accessible name.
function zoneLabelButton(page: Page, label: string): Locator {
  return page.getByRole("button", { name: `Edit ${label}`, exact: true }).first();
}

// "N" on zones with no target, "N/target" on the ones that have one.
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

      await activateZone(page, "Main Deck");
      await waitForCardsLoaded(page);

      const searchInput = page.getByPlaceholder(/search/iu);
      await expect(searchInput).toBeVisible();

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

      await expect(page.getByRole("img", { name: "Garen, Rugged" })).toBeVisible();

      await searchFor(page, "Annie");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByRole("img", { name: "Garen, Rugged" })).toBeHidden();

      // The "Search:" label is responsively hidden (hidden sm:inline); check attached, not visible.
      await expect(page.getByText("Search:", { exact: true })).toBeAttached();
    });

    test("applying and clearing a type filter narrows then restores the grid", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckId = await createDeckViaApi(page, `Browser Filter ${Date.now()}`);
      // The removable active-filter chips only render in the mobile layout.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/decks/${deckId}`);
      await activateZoneMobile(page, "Main Deck");

      // Wait for the zone's pre-seeded type filter to apply, not a specific card;
      // the grid is virtualized, so Annie can be off-screen until it narrows.
      const unitChip = page.locator('[data-slot="badge"]:visible', { hasText: /^Unit/u }).first();
      await expect(unitChip).toBeVisible({ timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      await scrollUntilVisible(page, page.getByRole("img", { name: "Annie, Fiery" }));

      // The desktop "Show filters" collapsible isn't drivable in the dev harness
      // (see public/cards-filters.spec.ts); use the active-filter chip instead.
      await unitChip.getByRole("button").click();
      await expect(page).not.toHaveURL(/[?&]types=[^&]*unit/iu);
      await expect(page.getByRole("img", { name: "Annie, Fiery" })).toHaveCount(0);
      await scrollUntilVisible(page, page.getByRole("img", { name: "Firestorm" }));

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

      const saveRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "saveDeckCardsFn"),
      );

      await addCardButton(tile).click();
      await expect(row.getByTitle("1 in deck")).toBeVisible();

      await expect(zoneCount(page, "Main Deck")).toHaveText("1/39");

      // "1/56" is the completion chip (required cards across all zones), not
      // the format badge, which belongs to the hero and is scrolled past here.
      await expect(page.getByText("1/56", { exact: true })).toBeVisible();

      await addCardButton(tile).click();
      await expect(row.getByTitle("2 in deck")).toBeVisible();

      await removeCardButton(tile).click();
      await expect(row.getByTitle("1 in deck")).toBeVisible();

      const saveResponse = await saveRequest;
      expect(saveResponse.method()).toBe("POST");

      await expect(page.getByText("1/56", { exact: true })).toBeVisible();
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

      await expect(zoneCount(page, "Sideboard")).toHaveText("1");
      await expect(zoneCount(page, "Main Deck")).toHaveText("0/39");

      await addCardButton(tile).click();
      await expect(zoneCount(page, "Sideboard")).toHaveText("2");
    });
  });

  test.describe("max reached", () => {
    test("constructed caps at 3 copies across main/sideboard; freeform is uncapped", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);

      // Constructed caps a card at 3 copies across main/sideboard/overflow/champion.
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

      // Freeform decks skip COPY_LIMIT_ZONES entirely, so the add button never disables.
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

      // Shift swaps the + icon for a "+2" button, a different element; wait for
      // the swap before clicking or the actionability check never settles.
      await page.keyboard.down("Shift");
      await expect(addCardButton(tile)).toHaveText("+2");
      await addCardButton(tile).click();
      await page.keyboard.up("Shift");
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

      // Same element swap as the bulk add above.
      await page.keyboard.down("Shift");
      await expect(removeCardButton(tile)).toHaveText("-2");
      await removeCardButton(tile).click();
      await page.keyboard.up("Shift");
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

      await cardTile(page, "Annie, Fiery").locator(".aspect-card").first().click();

      // paneDocked is off by default, so the detail arrives as a dialog.
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

      // Wait for the save response, not just the request: reloading before the
      // debounced save commits can abort the in-flight POST.
      const saveResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" && isServerFn(response.url(), "saveDeckCardsFn"),
      );

      await addCardButton(cardTile(page, "Annie, Fiery")).click();

      // The completion chip tracks completeness, not dirty state, so it reads
      // the same (1/56) before and after the save.
      await expect(page.getByText("1/56", { exact: true })).toBeVisible();

      await saveResponse;
      await expect(page.getByText("1/56", { exact: true })).toBeVisible();

      await page.reload();
      await activateZone(page, "Main Deck");
      await searchFor(page, "Annie, Fiery");
      await expect(page.getByRole("img", { name: "Annie, Fiery" }).first()).toBeVisible({
        timeout: 5000,
      });

      const rowAfter = strip(cardTile(page, "Annie, Fiery"));
      // The in-deck count query resolves a beat after the grid image mounts.
      await expect(rowAfter.getByTitle("1 in deck")).toBeVisible({ timeout: 15_000 });
    });
  });
});
