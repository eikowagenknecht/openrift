import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";

import { test, expect } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector("header");
      return root !== null && Object.keys(root).some((key) => key.startsWith("__react"));
    },
    { timeout: 10_000 },
  );
}

async function createVerifiedUser(
  request: APIRequestContext,
  sql: Sql,
  email: string,
  password: string,
) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Signout E2E" },
  });
  expect(response.ok()).toBeTruthy();
  await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
}

async function promoteToAdmin(sql: Sql, email: string) {
  await sql`
    INSERT INTO admins (user_id)
    SELECT id FROM users WHERE email = ${email}
    ON CONFLICT DO NOTHING
  `;
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

async function openUserMenu(page: Page) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
}

test.describe("sign out", () => {
  test("user menu shows Sign out and Profile when logged in", async ({ page, request }) => {
    const sql = loadDb();
    const email = `signout-menu-${Date.now()}@test.com`;
    const password = "SignoutTestPassword1!";
    try {
      await createVerifiedUser(request, sql, email, password);
    } finally {
      await sql.end();
    }

    await loginViaForm(page, email, password);
    await openUserMenu(page);

    await expect(page.getByRole("menuitem", { name: "Profile" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  });

  test("user menu hides Sign out when anonymous", async ({ page }) => {
    await page.goto("/cards");
    await waitForHydration(page);
    await openUserMenu(page);

    await expect(page.getByRole("menuitem", { name: "Help" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Profile" })).toHaveCount(0);
  });

  test("signing out returns to /cards with a logged-out header", async ({ page, request }) => {
    const sql = loadDb();
    const email = `signout-happy-${Date.now()}@test.com`;
    const password = "SignoutTestPassword1!";
    try {
      await createVerifiedUser(request, sql, email, password);
    } finally {
      await sql.end();
    }

    await loginViaForm(page, email, password);
    await openUserMenu(page);
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/cards$/, { timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

    await openUserMenu(page);
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Profile" })).toHaveCount(0);
  });

  test("session is cleared after sign-out and survives a reload", async ({ page, request }) => {
    const sql = loadDb();
    const email = `signout-session-${Date.now()}@test.com`;
    const password = "SignoutTestPassword1!";
    try {
      await createVerifiedUser(request, sql, email, password);
    } finally {
      await sql.end();
    }

    await loginViaForm(page, email, password);
    await openUserMenu(page);
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/cards$/, { timeout: 15_000 });

    const sessionResponse = await page.request.get(`${API_BASE_URL}/api/auth/get-session`, {
      headers: { Origin: WEB_BASE_URL },
    });
    expect(sessionResponse.ok()).toBeTruthy();
    const rawSessionBody = await sessionResponse.text();
    const sessionBody = rawSessionBody.trim();
    expect(sessionBody === "" || sessionBody === "null").toBe(true);

    await page.reload();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("post-logout /profile redirects to /login", async ({ page, request }) => {
    const sql = loadDb();
    const email = `signout-guard-profile-${Date.now()}@test.com`;
    const password = "SignoutTestPassword1!";
    try {
      await createVerifiedUser(request, sql, email, password);
    } finally {
      await sql.end();
    }

    await loginViaForm(page, email, password);
    await openUserMenu(page);
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/cards$/, { timeout: 15_000 });

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("post-logout /admin does not grant access", async ({ page, request }) => {
    const sql = loadDb();
    const email = `signout-guard-admin-${Date.now()}@test.com`;
    const password = "SignoutTestPassword1!";
    try {
      await createVerifiedUser(request, sql, email, password);
    } finally {
      await sql.end();
    }

    await loginViaForm(page, email, password);
    await openUserMenu(page);
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/cards$/, { timeout: 15_000 });

    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin(\/|$)/, { timeout: 15_000 });
  });

  test("admin menu shows Admin while logged in and hides it after sign-out", async ({
    page,
    request,
  }) => {
    const sql = loadDb();
    const email = `signout-admin-${Date.now()}@test.com`;
    const password = "SignoutTestPassword1!";
    try {
      await createVerifiedUser(request, sql, email, password);
      await promoteToAdmin(sql, email);
    } finally {
      await sql.end();
    }

    await loginViaForm(page, email, password);
    await openUserMenu(page);
    await expect(page.getByRole("menuitem", { name: "Admin" })).toBeVisible();

    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/cards$/, { timeout: 15_000 });

    await openUserMenu(page);
    await expect(page.getByRole("menuitem", { name: "Admin" })).toHaveCount(0);
  });

  test("signing out from /collections still lands on /cards logged out", async ({
    page,
    request,
  }) => {
    const sql = loadDb();
    const email = `signout-deeplink-${Date.now()}@test.com`;
    const password = "SignoutTestPassword1!";
    try {
      await createVerifiedUser(request, sql, email, password);
    } finally {
      await sql.end();
    }

    await loginViaForm(page, email, password);
    await page.goto("/collections");
    await expect(page).toHaveURL(/\/collections/, { timeout: 15_000 });

    // Collections wraps the page in a nested sidebar whose mobile trigger
    // is also named "Menu". Target the header banner's user-menu button
    // specifically, and retry in case the first click lands during sidebar
    // state transitions.
    await expect(async () => {
      await page.getByRole("banner").getByRole("button", { name: "Menu", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible({
        timeout: 1500,
      });
    }).toPass({ timeout: 10_000 });
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/cards$/, { timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });
});
