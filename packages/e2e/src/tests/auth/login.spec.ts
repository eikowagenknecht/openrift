import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { STATE_FILE } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

test.describe("login page", () => {
  test("renders the login form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("Welcome back")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("nonexistent@test.com");
    await page.getByLabel("Password").fill("WrongPassword123!");
    await page.getByRole("button", { name: /login/i }).click();

    // Should show an error message
    await expect(page.getByText(/invalid|incorrect|not found/i)).toBeVisible({ timeout: 10_000 });
  });

  test("logs in successfully with valid credentials", async ({ page }) => {
    // Create a fresh user for this test to avoid session conflicts
    const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const sql = connectToDb(state.tempDbUrl);
    const testEmail = `login-test-${Date.now()}@test.com`;
    const testPassword = "LoginTestPassword1!";

    try {
      // Sign up via API
      const signUpResponse = await page.request.post(
        "http://localhost:3100/api/auth/sign-up/email",
        {
          data: { email: testEmail, password: testPassword, name: "Login Test" },
        },
      );
      expect(signUpResponse.ok()).toBeTruthy();

      // Mark email as verified
      await sql`UPDATE users SET email_verified = true WHERE email = ${testEmail}`;
    } finally {
      await sql.end();
    }

    await page.goto("/login");
    await page.getByLabel("Email").fill(testEmail);
    await page.getByLabel("Password").fill(testPassword);
    await page.getByRole("button", { name: /login/i }).click();

    // Should redirect to the cards page (authenticated users go to /cards)
    await expect(page).toHaveURL("/cards", { timeout: 15_000 });
  });
});
