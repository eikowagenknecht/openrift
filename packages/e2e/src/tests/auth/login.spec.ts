import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

test.describe("login page", () => {
  test("renders the login form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("Welcome back")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");

    // Wait for hydration: the button is disabled while React isn't ready,
    // or we can wait for a client-side-only element. Filling + clicking
    // before hydration causes a native form GET submission.
    await page.waitForFunction(() => document.querySelector("#password") !== null);

    await page.locator("#email").fill("nonexistent@test.com");
    await page.locator("#password").fill("WrongPassword123!");

    // Use page.evaluate to submit via the button click after ensuring
    // React has attached its handlers (wait for next idle).
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /login/i }).click();

    // better-auth returns "Invalid email or password."
    await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 10_000 });
  });

  test("logs in successfully with valid credentials", async ({ page }) => {
    // Create a fresh user for this test to avoid session conflicts
    const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    const sql = connectToDb(state.tempDbUrl);
    const testEmail = `login-test-${Date.now()}@test.com`;
    const testPassword = "LoginTestPassword1!";

    try {
      // Sign up via API
      const signUpResponse = await page.request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
        headers: { Origin: WEB_BASE_URL },
        data: { email: testEmail, password: testPassword, name: "Login Test" },
      });
      expect(signUpResponse.ok()).toBeTruthy();

      // Mark email as verified
      await sql`UPDATE users SET email_verified = true WHERE email = ${testEmail}`;
    } finally {
      await sql.end();
    }

    await page.goto("/login");
    await page.waitForFunction(() => document.querySelector("#password") !== null);
    await page.waitForTimeout(500);

    await page.locator("#email").fill(testEmail);
    await page.locator("#password").fill(testPassword);
    await page.getByRole("button", { name: /login/i }).click();

    // Should redirect away from the login page after successful auth
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
