import { readFileSync } from "node:fs";

import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { typeSearch, waitForCatalogLoaded } from "../../helpers/catalog.js";
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

// A tile keeps the first printing in sort order; for OGS-001 "Annie, Fiery"
// that's the foil, so seeding the normal printing reads zero on the tile.
const ANNIE_FIERY_TILE_PRINTING = "019d17a1-2723-733a-a21e-4630e4370046";

async function seedInboxCopy(email: string, printingId: string): Promise<void> {
  const sql = loadDb();
  try {
    await sql`
      INSERT INTO copies (collection_id, printing_id)
      SELECT c.id, ${printingId}
      FROM users u
      JOIN collections c ON c.user_id = u.id AND c.is_inbox = true
      WHERE u.email = ${email}
    `;
  } finally {
    await sql.end();
  }
}

// The icon-only toggle's accessible name flips between "Show owned count"
// and "Hide owned count" depending on pressed state, so match either.
function catalogModeButton(page: Page) {
  return page.getByRole("button", { name: /(?:Show|Hide) owned count/u }).first();
}

async function waitForCards(page: Page) {
  await waitForCatalogLoaded(page);
}

// Hydrates a beat after the grid, which can lag past the default assertion
// timeout under heavy parallel load.
async function waitForOwnedCountToggle(page: Page) {
  await expect(catalogModeButton(page)).toBeVisible({ timeout: 15_000 });
}

// A single keypress can be dropped while handlers settle under load (Meta+k
// is especially unreliable on headless Linux), so retry until visible.
async function openGlobalPalette(page: Page, shortcut: "Control+k" | "Meta+k"): Promise<Locator> {
  // Retry on the frame, not its input: the body is a lazy chunk, and a second
  // keypress while it compiles would toggle the palette shut again.
  const frame = page.getByRole("dialog", { name: "Search OpenRift" });
  await expect(async () => {
    if (!(await frame.isVisible())) {
      await page.keyboard.press(shortcut);
    }
    await expect(frame).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });

  const input = frame.getByRole("combobox", { name: "Search cards, pages and help" });
  await expect(input).toBeVisible({ timeout: 20_000 });
  return input;
}

// /cards leaves the shortcut to the global palette, since the page is already
// a card search; quick add is that palette's first row instead.
async function openQuickAddPalette(page: Page, shortcut: "Control+k" | "Meta+k"): Promise<Locator> {
  await openGlobalPalette(page, shortcut);
  await page.getByRole("option", { name: "Add to Inbox" }).click();

  const paletteInput = page.getByLabel("Add card to Inbox");
  await expect(paletteInput).toBeVisible({ timeout: 15_000 });
  return paletteInput;
}

// The id in /_serverFn/{id} is base64url(JSON) referencing the file + variable
// name, so decoding it targets a specific fn out of the bundle.
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

// The Ctrl+K handler in card-browser.tsx is gated on `inboxId`, so pressing
// the shortcut before collections loads silently drops the event.
function waitForCollectionsLoaded(page: Page) {
  return page.waitForResponse((res) => isServerFn(res.url(), "fetchCollections") && res.ok(), {
    timeout: 15_000,
  });
}

test.describe("cards /cards (logged in)", () => {
  let userEmail: string | undefined;

  test.afterEach(async () => {
    if (userEmail) {
      await deleteUser(userEmail);
      userEmail = undefined;
    }
  });

  test("Show owned count toggle shows an owned-count strip on cards", async ({ page }) => {
    userEmail = await createAndLogin(page);
    await seedInboxCopy(userEmail, ANNIE_FIERY_TILE_PRINTING);
    await page.goto("/cards");
    await waitForCards(page);

    await typeSearch(page, "Annie, Fiery");

    // An early click can be dropped while the toolbar re-hydrates after the
    // search, so retry while it still reads "Show owned count".
    await expect(async () => {
      if (await page.getByRole("button", { name: "Show owned count" }).isVisible()) {
        await catalogModeButton(page).click();
      }
      await expect(page.getByRole("button", { name: "Hide owned count" })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000 });

    // With a quick-add target the pill opens the variants popover instead of
    // the owned-collections one, and takes its aria-label from that.
    const ownedPill = page.getByRole("button", {
      name: "Variants and collections for Annie, Fiery",
    });
    await expect(ownedPill).toBeVisible({ timeout: 10_000 });
    await expect(ownedPill).toHaveText("1");

    await ownedPill.click();
    await expect(page.getByRole("dialog").getByText("Inbox").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Ctrl+K opens the palette, its first row quick-adds, and Escape closes it", async ({
    page,
  }) => {
    userEmail = await createAndLogin(page);
    const collectionsLoaded = waitForCollectionsLoaded(page);
    await page.goto("/cards");
    await waitForCards(page);
    await waitForOwnedCountToggle(page);
    await collectionsLoaded;

    const paletteInput = await openQuickAddPalette(page, "Control+k");

    await page.keyboard.press("Escape");
    await expect(paletteInput).not.toBeVisible();
  });

  test("Meta+K also opens the palette", async ({ page }) => {
    userEmail = await createAndLogin(page);
    const collectionsLoaded = waitForCollectionsLoaded(page);
    await page.goto("/cards");
    await waitForCards(page);
    await waitForOwnedCountToggle(page);
    await collectionsLoaded;

    await openQuickAddPalette(page, "Meta+k");
  });

  test("QuickAddPalette: typing shows matches and selecting adds to Inbox", async ({ page }) => {
    const email = await createAndLogin(page);
    userEmail = email;
    const collectionsLoaded = waitForCollectionsLoaded(page);
    await page.goto("/cards");
    await waitForCards(page);
    await waitForOwnedCountToggle(page);
    await collectionsLoaded;

    const paletteInput = await openQuickAddPalette(page, "Control+k");

    // Full name needed: plain "Annie" now ranks "Annie, Dark Child, Starter"
    // first, which would be added instead.
    await paletteInput.fill("Annie, Fiery");
    await expect(page.getByRole("button", { name: /Annie, Fiery/iu }).first()).toBeVisible({
      timeout: 10_000,
    });

    // First Enter expands the printings for the top result; second adds the
    // first printing to the Inbox.
    await paletteInput.press("Enter");
    await paletteInput.press("Enter");

    await expect(page.getByText(/Added 1×\s*Annie, Fiery/iu)).toBeVisible({ timeout: 10_000 });

    const sql = loadDb();
    try {
      const rows = (await sql`
        SELECT COUNT(*)::int AS count
        FROM copies cp
        JOIN collections c ON c.id = cp.collection_id
        JOIN users u ON u.id = c.user_id
        WHERE u.email = ${email} AND c.is_inbox = true
      `) as { count: number }[];
      expect(rows[0].count).toBeGreaterThan(0);
    } finally {
      await sql.end();
    }
  });

  test("anonymous users see no owned-count UI on /cards", async ({ page }) => {
    await page.goto("/cards");
    await waitForCards(page);

    await expect(
      page.getByRole("button").filter({ has: page.locator("svg.lucide-package") }),
    ).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Options" }).click();
    await expect(page.getByText("Collection mode")).not.toBeVisible();
  });
});
