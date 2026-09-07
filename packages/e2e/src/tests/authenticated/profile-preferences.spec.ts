import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";
import { decodeServerFnData } from "../../helpers/server-fn.js";

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

// The server fn id is base64url(JSON) of the source file + export name;
// decode it to target a single server fn out of the bundle.
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

async function gotoProfile(page: Page) {
  // usePreferencesSync writes the server's theme back to the store on GET
  // resolution; if that lands after a user interaction it clobbers the choice.
  const prefsResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "GET" && isServerFn(res.request().url(), "fetchPreferencesFn"),
    { timeout: 15_000 },
  );
  await page.goto("/profile");
  // CardTitle renders as a div; wait on a reliable interactive element instead.
  await expect(page.getByRole("radio", { name: "Auto", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await prefsResponse;
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

      const autoButton = page.getByRole("radio", { name: "Auto", exact: true });
      const lightButton = page.getByRole("radio", { name: "Light", exact: true });
      const darkButton = page.getByRole("radio", { name: "Dark", exact: true });

      await expect(autoButton).toBeVisible();
      await expect(lightButton).toBeVisible();
      await expect(darkButton).toBeVisible();

      await expect(page.getByRole("button", { name: "Reset theme" })).toHaveCount(0);

      await darkButton.click();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
      await expect(page.getByRole("button", { name: "Reset theme" })).toBeVisible();

      await page.getByRole("button", { name: "Reset theme" }).click();
      await expect(page.getByRole("button", { name: "Reset theme" })).toHaveCount(0);
    });
  });

  test.describe("Display — switches", () => {
    test("show-images toggle flips state and reset returns to default", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      // getByLabel would match BaseUI's hidden 1px position:fixed <input>,
      // which fails Playwright's "in viewport" actionability check.
      const showImages = page.getByRole("switch", { name: "Show card images" });
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

      const switches: { name: string; resetLabel: string; defaultChecked: boolean }[] = [
        { name: "Show card images", resetLabel: "Reset show images", defaultChecked: true },
        { name: "Fancy card fan", resetLabel: "Reset fancy fan", defaultChecked: true },
        { name: "Foil effect", resetLabel: "Reset foil effect", defaultChecked: false },
        { name: "Card tilt on hover", resetLabel: "Reset card tilt", defaultChecked: true },
      ];

      for (const { name, resetLabel, defaultChecked } of switches) {
        // getByLabel would match BaseUI's hidden 1px position:fixed <input>,
        // which fails Playwright's viewport actionability check.
        const switchEl = page.getByRole("switch", { name });
        await (defaultChecked
          ? expect(switchEl).toBeChecked()
          : expect(switchEl).not.toBeChecked());
        await switchEl.click();
        await (defaultChecked
          ? expect(switchEl).not.toBeChecked()
          : expect(switchEl).toBeChecked());
        await expect(page.getByRole("button", { name: resetLabel })).toBeVisible();
        await page.getByRole("button", { name: resetLabel }).click();
        await (defaultChecked
          ? expect(switchEl).toBeChecked()
          : expect(switchEl).not.toBeChecked());
      }
    });

    test("preference persists after reload (localStorage hydration)", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      const fancyFan = page.getByRole("switch", { name: "Fancy card fan" });
      await expect(fancyFan).toBeChecked();
      await fancyFan.click();
      await expect(fancyFan).not.toBeChecked();

      // Wait for the debounced sync (1s in use-preferences-sync.ts) before reload.
      await page.waitForRequest(
        (req) => req.method() === "POST" && isServerFn(req.url(), "patchPreferencesFn"),
        { timeout: 5000 },
      );

      await page.reload();
      await expect(page.getByRole("radio", { name: "Auto", exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("switch", { name: "Fancy card fan" })).not.toBeChecked();
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

      await page.getByRole("switch", { name: "Foil effect" }).click();

      const req = await patchRequest;
      // Server-fn POST bodies are seroval-encoded; unwrap with the shared helper.
      const payload = decodeServerFnData<{ prefs?: { foilEffect?: unknown } }>(req.postDataJSON());
      expect(payload.prefs?.foilEffect).toBe(true);
    });
  });

  test.describe("Marketplaces", () => {
    test("renders default order with Favorite on the first row", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      // Default marketplace order is CardTrader, TCGplayer, Cardmarket (see
      // ALL_MARKETPLACES in packages/shared).
      await expect(page.getByRole("switch", { name: "CardTrader" })).toBeChecked();
      await expect(page.getByRole("switch", { name: "TCGplayer" })).toBeChecked();
      await expect(page.getByRole("switch", { name: "Cardmarket" })).toBeChecked();

      await expect(page.getByRole("button", { name: "Reset marketplace order" })).toHaveCount(0);

      const favoriteBadges = page.getByText("Favorite", { exact: true });
      await expect(favoriteBadges).toHaveCount(1);

      await expect(page.getByRole("button", { name: "Move CardTrader up" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Move Cardmarket down" })).toBeDisabled();
    });

    test("disabling the favorite moves it down and promotes the next row", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      await page.getByRole("switch", { name: "CardTrader" }).click();
      await expect(page.getByRole("switch", { name: "CardTrader" })).not.toBeChecked();

      // The Favorite badge lives on the innermost div wrapping the row's label.
      const tcgplayerInner = page
        .locator("div")
        .filter({ has: page.getByRole("switch", { name: "TCGplayer" }) })
        .last();
      await expect(tcgplayerInner.getByText("Favorite", { exact: true })).toBeVisible();

      await expect(page.getByRole("button", { name: "Reset marketplace order" })).toBeVisible();
    });

    test("moving a marketplace up reorders rows and shifts the Favorite badge", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      await page.getByRole("button", { name: "Move TCGplayer up" }).click();

      const tcgplayerInner = page
        .locator("div")
        .filter({ has: page.getByRole("switch", { name: "TCGplayer" }) })
        .last();
      await expect(tcgplayerInner.getByText("Favorite", { exact: true })).toBeVisible();

      const cardtraderInner = page
        .locator("div")
        .filter({ has: page.getByRole("switch", { name: "CardTrader" }) })
        .last();
      await expect(cardtraderInner.getByText("Favorite", { exact: true })).toHaveCount(0);
    });

    test("reset returns the order to default", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      await page.getByRole("button", { name: "Move TCGplayer up" }).click();
      await expect(page.getByRole("button", { name: "Reset marketplace order" })).toBeVisible();

      await page.getByRole("button", { name: "Reset marketplace order" }).click();

      const cardtraderInner = page
        .locator("div")
        .filter({ has: page.getByRole("switch", { name: "CardTrader" }) })
        .last();
      await expect(cardtraderInner.getByText("Favorite", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Reset marketplace order" })).toHaveCount(0);
    });
  });

  test.describe("Languages", () => {
    test("shows available languages with Preferred on the enabled first row", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      // getByLabel also matches the Move up/down buttons' aria-label; scope to
      // the switch role to hit the toggle only.
      await expect(page.getByRole("switch", { name: "English" })).toBeChecked();

      await expect(page.getByRole("switch", { name: "French" })).toBeVisible();
      await expect(page.getByRole("switch", { name: "French" })).not.toBeChecked();

      const englishInner = page
        .locator("div")
        .filter({ has: page.getByRole("switch", { name: "English" }) })
        .last();
      await expect(englishInner.getByText("Preferred", { exact: true })).toBeVisible();
    });

    test("enabling a second language, reordering, and disabling the first updates Preferred", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await gotoProfile(page);

      // getByLabel would match BaseUI's hidden <input>, which fails
      // Playwright's viewport actionability check.
      const frenchSwitch = page.getByRole("switch", { name: "French" });
      const englishSwitch = page.getByRole("switch", { name: "English" });

      await frenchSwitch.click();
      await expect(frenchSwitch).toBeChecked();

      const frenchInner = page.locator("div").filter({ has: frenchSwitch }).last();
      await expect(frenchInner.getByText("Preferred", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "Move French up" }).click();
      await expect(frenchInner.getByText("Preferred", { exact: true })).toBeVisible();

      await englishSwitch.click();
      await expect(englishSwitch).not.toBeChecked();
      await expect(page.getByRole("button", { name: "Reset languages" })).toBeVisible();

      await page.getByRole("button", { name: "Reset languages" }).click();
      await expect(page.getByRole("button", { name: "Reset languages" })).toHaveCount(0);
      await expect(englishSwitch).toBeChecked();
      await expect(frenchSwitch).not.toBeChecked();
    });
  });
});
