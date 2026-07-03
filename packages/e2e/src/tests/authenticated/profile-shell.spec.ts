import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, TEST_USERS, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

function loadDb() {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function createVerifiedUser(
  request: APIRequestContext,
  sql: ReturnType<typeof connectToDb>,
  email: string,
  password: string,
  name: string,
) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name },
  });
  expect(response.ok()).toBeTruthy();
  await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
}

async function loginViaForm(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("form").first().waitFor({ state: "attached" });
  await page.waitForFunction(
    () => {
      const formEl = document.querySelector("form");
      return formEl !== null && Object.keys(formEl).some((key) => key.startsWith("__react"));
    },
    { timeout: 10_000 },
  );
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /login/iu }).click();
  await expect(page).not.toHaveURL(/\/login/u, { timeout: 15_000 });
}

test.describe("profile shell", () => {
  test.describe("auth gate", () => {
    test("redirects anonymous users from /profile to /login", async ({ page }) => {
      await page.goto("/profile");
      await expect(page).toHaveURL(/\/login\b/u);
      const url = new URL(page.url());
      expect(url.searchParams.get("redirect") ?? "").toContain("/profile");
    });
  });

  test.describe("header card", () => {
    test("shows name, email, avatar, and joined date", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      const { name, email } = TEST_USERS.regular;

      // CardTitle/CardDescription render as <div>s with data-slot attributes,
      // not as headings — asserting by slot keeps the test stable without
      // adding a testid. The profile page has multiple Cards; the header is
      // the first one in document order.
      await expect(page.locator('[data-slot="card-title"]').first()).toHaveText(name, {
        timeout: 15_000,
      });
      await expect(page.locator('[data-slot="card-description"]').first()).toHaveText(email);

      // "Joined <localized date>" — match format used by the component.
      const joinedPattern = /^Joined \w+ \d{1,2}, \d{4}$|^Joined \d{1,2} \w+ \d{4}$/u;
      await expect(page.getByText(joinedPattern)).toBeVisible();

      // Avatar: the Gravatar URL uses `d=404` so arbitrary test emails will
      // miss and BaseUI shows the initials fallback. If the image happens to
      // resolve, the fallback stays in the DOM but is hidden — assert on its
      // text regardless. The global header also renders an avatar-fallback in
      // the user menu (it comes first in DOM), so target the card's fallback
      // via .last().
      const initials = name
        .split(/[\s@]/u)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
      await expect(page.locator('[data-slot="avatar-fallback"]').last()).toHaveText(initials);
    });

    test("falls back to email when name is empty", async ({ page, request }) => {
      const sql = loadDb();
      const email = `profile-no-name-${Date.now()}@test.com`;
      const password = "ProfileTestPassword1!";
      try {
        await createVerifiedUser(request, sql, email, password, "Placeholder Name");
        // better-auth requires a non-empty name at sign-up, so null it out
        // after the fact to exercise the `user.name || user.email` fallback.
        await sql`UPDATE users SET name = '' WHERE email = ${email}`;
      } finally {
        await sql.end();
      }

      await loginViaForm(page, email, password);
      await page.goto("/profile");

      await expect(page.locator('[data-slot="card-title"]').first()).toHaveText(email, {
        timeout: 15_000,
      });
      await expect(page.locator('[data-slot="card-description"]').first()).toHaveText(email);
    });
  });

  test.describe("sidebar navigation", () => {
    const sectionLabels = ["Preferences", "Account", "Security", "Danger Zone"] as const;

    test("shows the section nav links on desktop", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      const nav = page.getByRole("navigation").filter({ hasText: "Preferences" });
      await expect(nav).toBeVisible({ timeout: 15_000 });

      // TOC entries are in-page anchor links (href="#id"), not buttons.
      for (const label of sectionLabels) {
        await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
      }
    });

    test("hides the nav on mobile viewports", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/profile");

      await expect(page.locator('[data-slot="card-title"]').first()).toHaveText(
        TEST_USERS.regular.name,
        { timeout: 15_000 },
      );

      const nav = page.getByRole("navigation").filter({ hasText: "Preferences" });
      await expect(nav).toBeHidden();
    });

    test("clicking a nav link scrolls the section into view", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      const nav = page.getByRole("navigation").filter({ hasText: "Preferences" });
      await expect(nav).toBeVisible({ timeout: 15_000 });

      await nav.getByRole("link", { name: "Security", exact: true }).click();

      const securityHeading = page.getByRole("heading", { name: "Security", level: 2 });
      await expect(securityHeading).toBeInViewport();
    });

    test("active indicator reflects the current section", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      const nav = page.getByRole("navigation").filter({ hasText: "Preferences" });
      await expect(nav).toBeVisible({ timeout: 15_000 });

      // The active TOC link is styled via class tokens (text-foreground +
      // font-medium); inactive links are muted. No aria-current yet.
      const preferencesLink = nav.getByRole("link", { name: "Preferences", exact: true });
      await expect(preferencesLink).toHaveClass(/font-medium/u);

      // Clicking a TOC link sets it active directly (and scrolls to it) — more
      // deterministic than racing the scroll IntersectionObserver.
      const securityLink = nav.getByRole("link", { name: "Security", exact: true });
      await securityLink.click();
      await expect(securityLink).toHaveClass(/font-medium/u);
      await expect(preferencesLink).not.toHaveClass(/font-medium/u);
    });
  });

  test.describe("section landmarks", () => {
    test("renders the top-level section headings", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      // Each SettingsGroup renders an uppercase h2 (the DOM text stays Title Case).
      for (const label of ["Preferences", "Account", "Security", "Danger Zone"]) {
        await expect(page.getByRole("heading", { name: label, level: 2 })).toBeVisible({
          timeout: 15_000,
        });
      }
    });

    test("renders a scroll anchor <section> for each top-level group", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      // SettingsGroups render as <section id="..."> scroll anchors (the old
      // data-section attribute is gone).
      for (const id of [
        "preferences",
        "sharing",
        "integrations",
        "account",
        "security",
        "danger-zone",
      ]) {
        await expect(page.locator(`section#${id}`)).toHaveCount(1, { timeout: 15_000 });
      }
    });
  });

  test.describe("SEO", () => {
    test("sets Profile title and noindex robots meta", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      await expect(page).toHaveTitle(/Profile/u, { timeout: 15_000 });
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);
    });
  });
});
