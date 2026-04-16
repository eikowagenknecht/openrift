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
    data: { email, password, name: "Profile Preferences E2E" },
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
  const email = `profile-prefs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "ProfileE2ePassword1!";
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

// TanStack Start encodes the server fn id as base64url(JSON) referencing the
// source file + export name; matching on the decoded payload lets us target a
// single server fn out of the bundle.
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

async function gotoProfile(page: Page) {
  await page.goto("/profile");
  // CardTitle renders as a div; wait on a reliable interactive element instead.
  await expect(page.getByRole("button", { name: "Auto", exact: true })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("profile preferences", () => {
  let userEmail: string | undefined;

  test.afterEach(async () => {
    if (userEmail) {
      await deleteUser(userEmail);
      userEmail = undefined;
    }
  });

  test.describe("Display — theme", () => {
    test("defaults to Auto with no reset button, Dark toggles html class and shows reset", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      const autoButton = page.getByRole("button", { name: "Auto", exact: true });
      const lightButton = page.getByRole("button", { name: "Light", exact: true });
      const darkButton = page.getByRole("button", { name: "Dark", exact: true });

      await expect(autoButton).toBeVisible();
      await expect(lightButton).toBeVisible();
      await expect(darkButton).toBeVisible();

      // Default is Auto — no reset button rendered.
      await expect(page.getByRole("button", { name: "Reset theme" })).toHaveCount(0);

      await darkButton.click();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      await expect(page.getByRole("button", { name: "Reset theme" })).toBeVisible();

      await page.getByRole("button", { name: "Reset theme" }).click();
      await expect(page.getByRole("button", { name: "Reset theme" })).toHaveCount(0);
    });
  });

  test.describe("Display — switches", () => {
    test("show-images toggle flips state and reset returns to default", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      const showImages = page.getByLabel("Show card images");
      await expect(showImages).toBeChecked();
      await expect(page.getByRole("button", { name: "Reset show images" })).toHaveCount(0);

      await showImages.click();
      await expect(showImages).not.toBeChecked();
      const resetButton = page.getByRole("button", { name: "Reset show images" });
      await expect(resetButton).toBeVisible();

      await resetButton.click();
      await expect(showImages).toBeChecked();
      await expect(page.getByRole("button", { name: "Reset show images" })).toHaveCount(0);
    });

    test("all four display switches render and expose reset buttons after toggle", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      const switches: { label: RegExp; resetLabel: string }[] = [
        { label: /^Show card images$/, resetLabel: "Reset show images" },
        { label: /^Fancy card fan$/, resetLabel: "Reset fancy fan" },
        { label: /^Foil effect$/, resetLabel: "Reset foil effect" },
        { label: /^Card tilt on hover$/, resetLabel: "Reset card tilt" },
      ];

      for (const { label, resetLabel } of switches) {
        const switchEl = page.getByLabel(label);
        await expect(switchEl).toBeChecked();
        await switchEl.click();
        await expect(switchEl).not.toBeChecked();
        await expect(page.getByRole("button", { name: resetLabel })).toBeVisible();
        await page.getByRole("button", { name: resetLabel }).click();
        await expect(switchEl).toBeChecked();
      }
    });

    test("preference persists after reload (localStorage hydration)", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      const fancyFan = page.getByLabel("Fancy card fan");
      await expect(fancyFan).toBeChecked();
      await fancyFan.click();
      await expect(fancyFan).not.toBeChecked();

      // Wait for the debounced sync (1s in use-preferences-sync.ts) before reload.
      await page.waitForRequest(
        (req) => req.method() === "POST" && isServerFn(req.url(), "patchPreferencesFn"),
        { timeout: 5000 },
      );

      await page.reload();
      await expect(page.getByRole("button", { name: "Auto", exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByLabel("Fancy card fan")).not.toBeChecked();
    });

    test("toggling a switch triggers the preferences PATCH server fn with the changed field", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      const patchRequest = page.waitForRequest(
        (req) => req.method() === "POST" && isServerFn(req.url(), "patchPreferencesFn"),
        { timeout: 5000 },
      );

      await page.getByLabel("Foil effect").click();

      const req = await patchRequest;
      const body = req.postDataJSON() as { data?: { prefs?: { foilEffect?: unknown } } };
      expect(body.data?.prefs?.foilEffect).toBe(false);
    });
  });

  test.describe("Marketplaces", () => {
    test("renders default order with Favorite on the first row", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      await expect(page.getByLabel("TCGplayer")).toBeChecked();
      await expect(page.getByLabel("Cardmarket")).toBeChecked();
      await expect(page.getByLabel("CardTrader")).toBeChecked();

      await expect(page.getByRole("button", { name: "Reset marketplace order" })).toHaveCount(0);

      const favoriteBadges = page.getByText("Favorite", { exact: true });
      await expect(favoriteBadges).toHaveCount(1);

      // Up on the first row is disabled; down on the last enabled row is disabled.
      await expect(page.getByRole("button", { name: "Move TCGplayer up" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Move CardTrader down" })).toBeDisabled();
    });

    test("disabling the favorite moves it down and promotes the next row", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      await page.getByLabel("TCGplayer").click();
      await expect(page.getByLabel("TCGplayer")).not.toBeChecked();

      // Favorite badge should now sit on the Cardmarket row (innermost div wrapping the label).
      const cardmarketInner = page
        .locator("div")
        .filter({ has: page.getByLabel("Cardmarket") })
        .last();
      await expect(cardmarketInner.getByText("Favorite", { exact: true })).toBeVisible();

      await expect(page.getByRole("button", { name: "Reset marketplace order" })).toBeVisible();
    });

    test("moving a marketplace up reorders rows and shifts the Favorite badge", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      await page.getByRole("button", { name: "Move Cardmarket up" }).click();

      // After the swap, Cardmarket should be first and carry the Favorite badge.
      const cardmarketInner = page
        .locator("div")
        .filter({ has: page.getByLabel("Cardmarket") })
        .last();
      await expect(cardmarketInner.getByText("Favorite", { exact: true })).toBeVisible();

      // TCGplayer no longer carries the badge.
      const tcgplayerInner = page
        .locator("div")
        .filter({ has: page.getByLabel("TCGplayer") })
        .last();
      await expect(tcgplayerInner.getByText("Favorite", { exact: true })).toHaveCount(0);
    });

    test("reset returns the order to default", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      await page.getByRole("button", { name: "Move Cardmarket up" }).click();
      await expect(page.getByRole("button", { name: "Reset marketplace order" })).toBeVisible();

      await page.getByRole("button", { name: "Reset marketplace order" }).click();

      const tcgplayerInner = page
        .locator("div")
        .filter({ has: page.getByLabel("TCGplayer") })
        .last();
      await expect(tcgplayerInner.getByText("Favorite", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Reset marketplace order" })).toHaveCount(0);
    });
  });

  test.describe("Languages", () => {
    test("shows available languages with Preferred on the enabled first row", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      await expect(page.getByLabel("English")).toBeChecked();

      // At least one additional language is available in seed data.
      await expect(page.getByLabel("French")).toBeVisible();
      await expect(page.getByLabel("French")).not.toBeChecked();

      const englishInner = page
        .locator("div")
        .filter({ has: page.getByLabel("English") })
        .last();
      await expect(englishInner.getByText("Preferred", { exact: true })).toBeVisible();
    });

    test("enabling a second language, reordering, and disabling the first updates Preferred", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      await page.getByLabel("French").click();
      await expect(page.getByLabel("French")).toBeChecked();

      // Freshly-enabled language appears without the Preferred badge.
      const frenchInner = page
        .locator("div")
        .filter({ has: page.getByLabel("French") })
        .last();
      await expect(frenchInner.getByText("Preferred", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "Move French up" }).click();
      await expect(frenchInner.getByText("Preferred", { exact: true })).toBeVisible();

      // Disable English — only French remains enabled and reset button is visible.
      await page.getByLabel("English").click();
      await expect(page.getByLabel("English")).not.toBeChecked();
      await expect(page.getByRole("button", { name: "Reset languages" })).toBeVisible();

      await page.getByRole("button", { name: "Reset languages" }).click();
      await expect(page.getByRole("button", { name: "Reset languages" })).toHaveCount(0);
      await expect(page.getByLabel("English")).toBeChecked();
      await expect(page.getByLabel("French")).not.toBeChecked();
    });
  });
});
