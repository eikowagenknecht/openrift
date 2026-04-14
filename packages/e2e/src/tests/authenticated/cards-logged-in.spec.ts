import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  return connectToDb(state.tempDbUrl);
}

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Cards LoggedIn E2E" },
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
  const email = `cards-logged-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "CardsE2ePassword1!";
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

async function seedInboxCopy(email: string, cardName: string): Promise<void> {
  const sql = loadDb();
  try {
    await sql`
      INSERT INTO copies (user_id, collection_id, printing_id)
      SELECT u.id, c.id, p.id
      FROM users u
      JOIN collections c ON c.user_id = u.id AND c.is_inbox = true
      JOIN printings p ON p.card_id = (
        SELECT id FROM cards WHERE name = ${cardName} LIMIT 1
      )
      WHERE u.email = ${email}
      LIMIT 1
    `;
  } finally {
    await sql.end();
  }
}

async function findCardWithMultiplePrintings(): Promise<string> {
  const sql = loadDb();
  try {
    const rows = (await sql`
      SELECT c.name
      FROM cards c
      JOIN printings p ON p.card_id = c.id
      GROUP BY c.id, c.name
      HAVING COUNT(p.id) > 1
      ORDER BY c.name
      LIMIT 1
    `) as { name: string }[];
    if (rows.length === 0) {
      throw new Error("No card with multiple printings found in seed data");
    }
    return rows[0].name;
  } finally {
    await sql.end();
  }
}

/**
 * Locate the desktop catalog-mode toggle button. The button has only an icon
 * (PackageIcon or PackagePlusIcon) plus a tooltip, so we target it via the
 * icon's lucide class name — no other button on /cards uses these icons.
 * @returns A locator for the catalog-mode button.
 */
function catalogModeButton(page: Page) {
  return page
    .getByRole("button")
    .filter({ has: page.locator("svg.lucide-package, svg.lucide-package-plus") })
    .first();
}

async function waitForCards(page: Page) {
  await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });
}

test.describe("cards /cards (logged in)", () => {
  let userEmail: string | undefined;

  test.afterEach(async () => {
    if (userEmail) {
      await deleteUser(userEmail);
      userEmail = undefined;
    }
  });

  test("catalog-mode button cycles Off → Count → Add → Off", async ({ page }) => {
    userEmail = await createAndLogin(page);
    await page.goto("/cards");
    await waitForCards(page);

    const button = catalogModeButton(page);
    await expect(button).toBeVisible();

    // Off: tooltip reads "Show owned count"
    await button.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Show owned count");
    await button.click();

    // Count: tooltip reads "Switch to add mode"
    await button.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Switch to add mode");
    await button.click();

    // Add: tooltip reads "Turn off". Icon changes to PackagePlusIcon.
    await button.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Turn off");
    await expect(page.locator("svg.lucide-package-plus")).toBeVisible();
    await button.click();

    // Back to Off
    await button.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Show owned count");
  });

  test("Count mode shows an owned-count strip on cards", async ({ page }) => {
    userEmail = await createAndLogin(page);
    await seedInboxCopy(userEmail, "Annie, Fiery");
    await page.goto("/cards");
    await waitForCards(page);

    await catalogModeButton(page).click();

    // OwnedCollectionsPopover only renders when the user owns >= 1 copy of a printing;
    // with one seeded copy of Annie, Fiery, its strip shows "×1".
    await expect(page.getByText("×1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("Add mode: clicking + increments count and persists after reload", async ({ page }) => {
    userEmail = await createAndLogin(page);
    await page.goto("/cards");
    await waitForCards(page);

    // Off → Count → Add
    const button = catalogModeButton(page);
    await button.click();
    await button.click();

    // The CollectionAddStrip's + button is tabindex=-1 with an inline SVG
    // whose path starts with "M8 2a1 1 0 0 1 1 1v4h4" (see collection-add-strip.tsx).
    const addButtons = page.locator(
      'button[tabindex="-1"]:has(svg path[d^="M8 2a1 1 0 0 1 1 1v4h4"])',
    );
    await expect(addButtons.first()).toBeVisible({ timeout: 10_000 });
    await addButtons.first().click();

    // Optimistic add: the strip's ×N text should reach ×1.
    await expect(page.getByText("×1").first()).toBeVisible({ timeout: 10_000 });

    // Reload clears the local add-mode store — a persisting count has come from the API.
    // Re-enable Add mode to re-render the strip (Off → Count → Add).
    await page.reload();
    await waitForCards(page);
    await catalogModeButton(page).click();
    await catalogModeButton(page).click();

    await expect(page.getByText("×1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("Ctrl+K opens the QuickAddPalette and Escape closes it", async ({ page }) => {
    userEmail = await createAndLogin(page);
    await page.goto("/cards");
    await waitForCards(page);
    // Confirm isLoggedIn hydrated (catalog button only renders when logged in);
    // this also gives the collections query time to populate inboxId, which is
    // what gates the Ctrl+K handler in card-browser.tsx.
    await expect(catalogModeButton(page)).toBeVisible();

    await page.keyboard.press("Control+k");

    const paletteInput = page.getByPlaceholder('Add to "Inbox"...');
    await expect(paletteInput).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(paletteInput).not.toBeVisible();
  });

  test("Meta+K also opens the QuickAddPalette", async ({ page }) => {
    userEmail = await createAndLogin(page);
    await page.goto("/cards");
    await waitForCards(page);
    await expect(catalogModeButton(page)).toBeVisible();

    await page.keyboard.press("Meta+k");

    await expect(page.getByPlaceholder('Add to "Inbox"...')).toBeVisible();
  });

  test("QuickAddPalette: typing shows matches and selecting adds to Inbox", async ({ page }) => {
    const email = await createAndLogin(page);
    userEmail = email;
    await page.goto("/cards");
    await waitForCards(page);
    await expect(catalogModeButton(page)).toBeVisible();

    await page.keyboard.press("Control+k");
    const paletteInput = page.getByPlaceholder('Add to "Inbox"...');
    await expect(paletteInput).toBeVisible();

    await paletteInput.fill("Annie");
    // Matches render as card-row buttons whose accessible name starts with the card name.
    await expect(page.getByRole("button", { name: /Annie, Fiery/i }).first()).toBeVisible({
      timeout: 10_000,
    });

    // First Enter expands the printings for the top result; second Enter adds the
    // first printing to the Inbox (see PaletteInner.handleKeyDown).
    await paletteInput.press("Enter");
    await paletteInput.press("Enter");

    await expect(page.getByText(/Added 1×\s*Annie, Fiery/i)).toBeVisible({ timeout: 10_000 });

    // Verify the copy landed in the user's Inbox.
    const sql = loadDb();
    try {
      const rows = (await sql`
        SELECT COUNT(*)::int AS count
        FROM copies cp
        JOIN collections c ON c.id = cp.collection_id
        JOIN users u ON u.id = cp.user_id
        WHERE u.email = ${email} AND c.is_inbox = true
      `) as { count: number }[];
      expect(rows[0].count).toBeGreaterThan(0);
    } finally {
      await sql.end();
    }
  });

  test("Add mode: clicking the variant affordance opens the VariantAddPopover", async ({
    page,
  }) => {
    const multiPrintingCard = await findCardWithMultiplePrintings();
    userEmail = await createAndLogin(page);
    await page.goto("/cards");
    await waitForCards(page);

    // Narrow the grid to the multi-printing card so the variant affordance is easy to click.
    await page.getByPlaceholder(/search/i).fill(multiPrintingCard);
    await expect(page.getByText(multiPrintingCard).first()).toBeVisible({ timeout: 10_000 });

    // Enter Add mode (Off → Count → Add).
    const button = catalogModeButton(page);
    await button.click();
    await button.click();

    // The variant affordance is the middle button of the strip, showing "×N".
    const variantButton = page.locator('button[tabindex="-1"]').filter({ hasText: /^×\d/ }).first();
    await expect(variantButton).toBeVisible({ timeout: 10_000 });
    await variantButton.click();

    // VariantAddPopover is a shadow-lg container with per-printing rarity thumbnails.
    const popover = page.locator("div.shadow-lg").filter({
      has: page.locator('img[src*="/images/rarities/"]'),
    });
    await expect(popover.first()).toBeVisible({ timeout: 5000 });

    // Clicking outside (on the search input) closes the popover.
    await page.getByPlaceholder(/search/i).click();
    await expect(popover.first()).not.toBeVisible({ timeout: 5000 });
  });

  test("mobile: the collection-mode row cycles the same modes", async ({ page }) => {
    userEmail = await createAndLogin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cards");
    await waitForCards(page);

    await page.getByRole("button", { name: "Options" }).click();

    // Off → Count
    const offButton = page.getByRole("button", { name: /^Off$/ });
    await expect(offButton).toBeVisible();
    await offButton.click();

    // Count → Add
    const countButton = page.getByRole("button", { name: /^Count$/ });
    await expect(countButton).toBeVisible();
    await countButton.click();

    // Add → Off
    const addButton = page.getByRole("button", { name: /^Add$/ });
    await expect(addButton).toBeVisible();
    await addButton.click();

    await expect(page.getByRole("button", { name: /^Off$/ })).toBeVisible();
  });

  test("anonymous users see no catalog-mode UI on /cards", async ({ page }) => {
    await page.goto("/cards");
    await waitForCards(page);

    // No desktop catalog-mode button.
    await expect(
      page
        .getByRole("button")
        .filter({ has: page.locator("svg.lucide-package, svg.lucide-package-plus") }),
    ).toHaveCount(0);

    // Open the mobile options drawer — there should be no "Collection mode" row.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Options" }).click();
    await expect(page.getByText("Collection mode")).not.toBeVisible();
  });
});
