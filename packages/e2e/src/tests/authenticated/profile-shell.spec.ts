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
  await page.getByRole("button", { name: /login/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

test.describe("profile shell", () => {
  test.describe("auth gate", () => {
    test("redirects anonymous users from /profile to /login", async ({ page }) => {
      await page.goto("/profile");
      await expect(page).toHaveURL(/\/login\b/);
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
      const joinedPattern = new RegExp(
        String.raw`^Joined \w+ \d{1,2}, \d{4}$|^Joined \d{1,2} \w+ \d{4}$`,
      );
      await expect(page.getByText(joinedPattern)).toBeVisible();

      // Avatar: the Gravatar URL uses `d=404` so arbitrary test emails will
      // miss and BaseUI shows the initials fallback. If the image happens to
      // resolve, the fallback stays in the DOM but is hidden — assert on its
      // text regardless. The global header also renders an avatar-fallback in
      // the user menu (it comes first in DOM), so target the card's fallback
      // via .last().
      const initials = name
        .split(/[\s@]/)
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

    test("shows four nav buttons on desktop", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      const nav = page.getByRole("navigation").filter({ hasText: "Preferences" });
      await expect(nav).toBeVisible({ timeout: 15_000 });

      for (const label of sectionLabels) {
        await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
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

    test("clicking a nav button scrolls the section into view", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      const nav = page.getByRole("navigation").filter({ hasText: "Preferences" });
      await expect(nav).toBeVisible({ timeout: 15_000 });

      await nav.getByRole("button", { name: "Security", exact: true }).click();

      const securityHeading = page.getByRole("heading", { name: "Security", level: 2 });
      await expect(securityHeading).toBeInViewport();
    });

    test("active indicator reflects the current section", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      const nav = page.getByRole("navigation").filter({ hasText: "Preferences" });
      await expect(nav).toBeVisible({ timeout: 15_000 });

      // Exception: the active state is expressed only via class tokens (no
      // aria-current on the nav buttons yet). Asserting class-membership here
      // is a candidate for migrating to aria-current later.
      const preferencesButton = nav.getByRole("button", { name: "Preferences", exact: true });
      await expect(preferencesButton).toHaveClass(/bg-muted/);
      await expect(preferencesButton).toHaveClass(/text-foreground/);
      await expect(preferencesButton).toHaveClass(/font-medium/);

      // Scroll the Security section into view directly so the
      // IntersectionObserver callback fires on a real scroll event.
      await page.evaluate(() => {
        document
          .querySelector('[data-section="security"]')
          ?.scrollIntoView({ behavior: "instant", block: "start" });
      });

      const securityButton = nav.getByRole("button", { name: "Security", exact: true });
      await expect(securityButton).toHaveClass(/bg-muted/);
      await expect(securityButton).toHaveClass(/text-foreground/);
      await expect(securityButton).toHaveClass(/font-medium/);
      await expect(preferencesButton).not.toHaveClass(/bg-muted/);
    });
  });

  test.describe("section landmarks", () => {
    test("renders all four section headings", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      // h2 uses the `uppercase` CSS class, so the DOM text remains Title Case.
      for (const label of ["Preferences", "Account", "Security", "Danger Zone"]) {
        await expect(page.getByRole("heading", { name: label, level: 2 })).toBeVisible({
          timeout: 15_000,
        });
      }
    });

    test("each section has a data-section anchor", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      // Exception: sections have no landmark role, so target the data-section
      // attribute used by the IntersectionObserver wiring.
      await expect(page.locator("[data-section]")).toHaveCount(4, { timeout: 15_000 });
      for (const id of ["preferences", "account", "security", "danger-zone"]) {
        await expect(page.locator(`[data-section="${id}"]`)).toHaveCount(1);
      }
    });
  });

  test.describe("SEO", () => {
    test("sets Profile title and noindex robots meta", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/profile");

      await expect(page).toHaveTitle(/Profile/, { timeout: 15_000 });
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    });
  });
});
