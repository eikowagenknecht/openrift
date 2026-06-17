import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

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

/**
 * Locate the desktop "Show owned count" toggle. It has only an icon
 * (PackageIcon) plus a tooltip, so we target it via the icon's lucide class
 * name — no other button on /cards uses this icon.
 * @returns A locator for the show-owned-count toggle.
 */
function catalogModeButton(page: Page) {
  return page
    .getByRole("button")
    .filter({ has: page.locator("svg.lucide-package") })
    .first();
}

async function waitForCards(page: Page) {
  await expect(page.getByText("Annie, Fiery", { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Match a TanStack Start server fn response by the source-level function name.
 * The id in /_serverFn/{id} is a base64url(JSON) blob that references the file
 * + variable name, so decoding it lets us target a specific fn out of the bundle
 * that fires during a route transition.
 * @returns True when the URL belongs to the named server fn.
 */
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

/**
 * Wait until the collections query resolves so `inboxId` is populated on the
 * client. The Ctrl+K handler in card-browser.tsx is gated on `inboxId`, so
 * pressing the shortcut before collections loads silently drops the event.
 * @returns A promise that resolves when the collections response is seen.
 */
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
    await seedInboxCopy(userEmail, "Annie, Fiery");
    await page.goto("/cards");
    await waitForCards(page);

    // Turn the "Show owned count" toggle on.
    await catalogModeButton(page).click();

    // OwnedCollectionsPopover only renders when the user owns >= 1 copy of a printing;
    // with one seeded copy of Annie, Fiery, its strip shows "×1".
    await expect(page.getByText("×1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("Ctrl+K opens the QuickAddPalette and Escape closes it", async ({ page }) => {
    userEmail = await createAndLogin(page);
    const collectionsLoaded = waitForCollectionsLoaded(page);
    await page.goto("/cards");
    await waitForCards(page);
    await expect(catalogModeButton(page)).toBeVisible();
    await collectionsLoaded;

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
    await expect(page.getByRole("button", { name: /Annie, Fiery/iu }).first()).toBeVisible({
      timeout: 10_000,
    });

    // First Enter expands the printings for the top result; second Enter adds the
    // first printing to the Inbox (see PaletteInner.handleKeyDown).
    await paletteInput.press("Enter");
    await paletteInput.press("Enter");

    await expect(page.getByText(/Added 1×\s*Annie, Fiery/iu)).toBeVisible({ timeout: 10_000 });

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

  test("anonymous users see no owned-count UI on /cards", async ({ page }) => {
    await page.goto("/cards");
    await waitForCards(page);

    // No desktop show-owned-count toggle.
    await expect(
      page.getByRole("button").filter({ has: page.locator("svg.lucide-package") }),
    ).toHaveCount(0);

    // Open the mobile options drawer — there should be no "Collection mode" row.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Options" }).click();
    await expect(page.getByText("Collection mode")).not.toBeVisible();
  });
});
