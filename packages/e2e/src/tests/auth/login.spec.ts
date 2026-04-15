import { expect } from "@playwright/test";

import { test } from "../../fixtures/test.js";
import { createVerifiedUser, loadDb, signUp, waitForHydration } from "../../helpers/auth-otp.js";
import { fetchLatestOtp } from "../../helpers/otp.js";

test.describe("login page", () => {
  test.describe("password tab", () => {
    test("renders the login form", async ({ page }) => {
      await page.goto("/login");

      await expect(page.getByText("Welcome back")).toBeVisible();
      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator("#password")).toBeVisible();
      await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
    });

    test("shows error for invalid credentials", async ({ page }) => {
      await page.goto("/login");
      await waitForHydration(page);

      await page.locator("#email").fill("nonexistent@test.com");
      await page.locator("#password").fill("WrongPassword123!");
      await page.getByRole("button", { name: /login/i }).click();

      await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 10_000 });
    });

    test("logs in successfully with valid credentials", async ({ page, request }) => {
      const sql = loadDb();
      const email = `login-success-${Date.now()}@test.com`;
      const password = "LoginTestPassword1!";
      try {
        await createVerifiedUser(request, sql, email, password);
      } finally {
        await sql.end();
      }

      await page.goto("/login");
      await waitForHydration(page);

      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /login/i }).click();

      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    });

    test("shows client-side error for invalid email format", async ({ page }) => {
      await page.goto("/login");
      await waitForHydration(page);

      await page.locator("#email").fill("not-an-email");
      await page.locator("#password").fill("Whatever1!");
      await page.getByRole("button", { name: /login/i }).click();

      await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
    });

    test("shows client-side error for empty password", async ({ page }) => {
      await page.goto("/login");
      await waitForHydration(page);

      await page.locator("#email").fill("someone@test.com");
      await page.getByRole("button", { name: /login/i }).click();

      await expect(page.getByText("Password is required.")).toBeVisible();
    });

    test("shows resend button for unverified email and triggers resend", async ({
      page,
      request,
    }) => {
      const email = `unverified-${Date.now()}@test.com`;
      const password = "LoginTestPassword1!";
      await signUp(request, email, password);

      await page.goto("/login");
      await waitForHydration(page);

      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /login/i }).click();

      await expect(page.getByText(/Please verify your email/i)).toBeVisible({ timeout: 10_000 });

      const resend = page.getByRole("button", { name: "Resend verification email" });
      await expect(resend).toBeVisible();

      const resendRequest = page.waitForRequest((req) =>
        req.url().includes("/api/auth/send-verification-email"),
      );
      await resend.click();
      await resendRequest;

      await expect(page.getByRole("button", { name: "Resend verification email" })).toBeVisible({
        timeout: 10_000,
      });
    });

    test("forgot password link includes the typed email", async ({ page }) => {
      await page.goto("/login");
      await waitForHydration(page);

      const typed = `typed-${Date.now()}@test.com`;
      await page.locator("#email").fill(typed);

      await page.getByRole("link", { name: /forgot your password/i }).click();
      await expect(page).toHaveURL(/\/reset-password\?/);
      const url = new URL(page.url());
      expect(url.searchParams.get("email")).toBe(typed);
    });

    test("signup link preserves typed email and the redirect param", async ({ page }) => {
      await page.goto("/login?redirect=%2Fcollections");
      await waitForHydration(page);

      const typed = `typed-${Date.now()}@test.com`;
      await page.locator("#email").fill(typed);

      await page.getByRole("link", { name: /^sign up$/i }).click();
      await expect(page).toHaveURL(/\/signup\?/);
      const url = new URL(page.url());
      expect(url.searchParams.get("email")).toBe(typed);
      expect(url.searchParams.get("redirect")).toBe("/collections");
    });

    test("redirects to ?redirect= path after successful login", async ({ page, request }) => {
      const sql = loadDb();
      const email = `redirect-success-${Date.now()}@test.com`;
      const password = "LoginTestPassword1!";
      try {
        await createVerifiedUser(request, sql, email, password);
      } finally {
        await sql.end();
      }

      await page.goto("/login?redirect=%2Fcollections");
      await waitForHydration(page);

      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /login/i }).click();

      await expect(page).toHaveURL(/\/collections/, { timeout: 15_000 });
    });

    test("strips an unsafe redirect param and lands on /", async ({ page, request }) => {
      const sql = loadDb();
      const email = `redirect-unsafe-${Date.now()}@test.com`;
      const password = "LoginTestPassword1!";
      try {
        await createVerifiedUser(request, sql, email, password);
      } finally {
        await sql.end();
      }

      await page.goto("/login?redirect=https%3A%2F%2Fevil.com");
      await waitForHydration(page);

      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /login/i }).click();

      await expect(page).toHaveURL(/\/cards/, { timeout: 15_000 });
    });

    test("pre-fills email from ?email= param", async ({ page }) => {
      const prefilled = "prefilled@test.com";
      await page.goto(`/login?email=${encodeURIComponent(prefilled)}`);

      await expect(page.locator("#email")).toHaveValue(prefilled);
    });
  });

  test.describe("OTP tab", () => {
    test.describe.configure({ mode: "serial" });

    test("preserves the typed email when switching tabs", async ({ page }) => {
      await page.goto("/login");
      await waitForHydration(page);

      const typed = `tab-switch-${Date.now()}@test.com`;
      await page.locator("#email").fill(typed);

      await page.getByRole("tab", { name: "Email code" }).click();
      const otpEmail = page.locator("#otp-email");
      await expect(otpEmail).toHaveValue(typed);

      const updated = `tab-switch-2-${Date.now()}@test.com`;
      await otpEmail.fill(updated);

      await page.getByRole("tab", { name: "Password" }).click();
      await expect(page.locator("#email")).toHaveValue(updated);
    });

    test("send-code with invalid email shows inline error", async ({ page }) => {
      await page.goto("/login");
      await waitForHydration(page);

      await page.getByRole("tab", { name: "Email code" }).click();
      await page.locator("#otp-email").fill("not-an-email");
      await page.getByRole("button", { name: /send code/i }).click();

      await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
    });

    test("send-code with valid email advances to the 6-digit step", async ({ page, request }) => {
      const sql = loadDb();
      const email = `otp-step-${Date.now()}@test.com`;
      try {
        await createVerifiedUser(request, sql, email, "LoginTestPassword1!");
      } finally {
        await sql.end();
      }

      await page.goto("/login");
      await waitForHydration(page);

      await page.getByRole("tab", { name: "Email code" }).click();
      await page.locator("#otp-email").fill(email);
      await page.getByRole("button", { name: /send code/i }).click();

      await expect(page.getByRole("button", { name: /verify/i })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("button", { name: "Use a different email" })).toBeVisible();
    });

    test("entering a wrong OTP shows 'Incorrect code' error", async ({ page, request }) => {
      const sql = loadDb();
      const email = `otp-wrong-${Date.now()}@test.com`;
      try {
        await createVerifiedUser(request, sql, email, "LoginTestPassword1!");
      } finally {
        await sql.end();
      }

      await page.goto("/login");
      await waitForHydration(page);

      await page.getByRole("tab", { name: "Email code" }).click();
      await page.locator("#otp-email").fill(email);
      await page.getByRole("button", { name: /send code/i }).click();
      await expect(page.getByRole("button", { name: /verify/i })).toBeVisible({ timeout: 10_000 });

      await page.locator('input[autocomplete="one-time-code"]').fill("000000");
      await page.getByRole("button", { name: /verify/i }).click();

      await expect(page.getByText("Incorrect code. Please try again.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("entering an expired OTP shows 'Code expired' error", async ({ page, request }) => {
      const sql = loadDb();
      const email = `otp-expired-${Date.now()}@test.com`;
      let otp: string;
      try {
        await createVerifiedUser(request, sql, email, "LoginTestPassword1!");

        await page.goto("/login");
        await waitForHydration(page);

        await page.getByRole("tab", { name: "Email code" }).click();
        await page.locator("#otp-email").fill(email);
        await page.getByRole("button", { name: /send code/i }).click();
        await expect(page.getByRole("button", { name: /verify/i })).toBeVisible({
          timeout: 10_000,
        });

        otp = await fetchLatestOtp(sql, email);
        await sql`
          UPDATE verifications
          SET expires_at = now() - interval '1 minute'
          WHERE identifier LIKE ${`%${email}%`}
        `;
      } finally {
        await sql.end();
      }

      await page.locator('input[autocomplete="one-time-code"]').fill(otp);
      await page.getByRole("button", { name: /verify/i }).click();

      await expect(page.getByText("Code expired. Please request a new one.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("signs in successfully with a valid OTP", async ({ page, request }) => {
      const sql = loadDb();
      const email = `otp-success-${Date.now()}@test.com`;
      let otp: string;
      try {
        await createVerifiedUser(request, sql, email, "LoginTestPassword1!");

        await page.goto("/login?redirect=%2Fcollections");
        await waitForHydration(page);

        await page.getByRole("tab", { name: "Email code" }).click();
        await page.locator("#otp-email").fill(email);
        await page.getByRole("button", { name: /send code/i }).click();
        await expect(page.getByRole("button", { name: /verify/i })).toBeVisible({
          timeout: 10_000,
        });

        otp = await fetchLatestOtp(sql, email);
      } finally {
        await sql.end();
      }

      await page.locator('input[autocomplete="one-time-code"]').fill(otp);
      await page.getByRole("button", { name: /verify/i }).click();

      await expect(page).toHaveURL(/\/collections/, { timeout: 15_000 });
    });

    test("'Use a different email' resets to the email step and clears the OTP", async ({
      page,
      request,
    }) => {
      const sql = loadDb();
      const email = `otp-reset-${Date.now()}@test.com`;
      try {
        await createVerifiedUser(request, sql, email, "LoginTestPassword1!");
      } finally {
        await sql.end();
      }

      await page.goto("/login");
      await waitForHydration(page);

      await page.getByRole("tab", { name: "Email code" }).click();
      await page.locator("#otp-email").fill(email);
      await page.getByRole("button", { name: /send code/i }).click();
      await expect(page.getByRole("button", { name: /verify/i })).toBeVisible({ timeout: 10_000 });

      await page.locator('input[autocomplete="one-time-code"]').fill("123");

      await page.getByRole("button", { name: "Use a different email" }).click();

      await expect(page.locator("#otp-email")).toBeVisible();
      await expect(page.locator("#otp-email")).toHaveValue(email);
      await expect(page.getByRole("button", { name: /send code/i })).toBeVisible();

      await page.getByRole("button", { name: /send code/i }).click();
      await expect(page.getByRole("button", { name: /verify/i })).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('input[autocomplete="one-time-code"]')).toHaveValue("");
    });
  });

  test.describe("route & head", () => {
    test("includes a noindex robots meta tag", async ({ page }) => {
      await page.goto("/login");

      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/, {
        timeout: 10_000,
      });
    });

    test("renders the form even when already authenticated", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/login");

      await expect(authenticatedPage.getByText("Welcome back")).toBeVisible();
      await expect(authenticatedPage.locator("#email")).toBeVisible();
      await expect(authenticatedPage.locator("#password")).toBeVisible();
      await expect(authenticatedPage).toHaveURL(/\/login/);
    });
  });

  test.describe("a11y", () => {
    test("password tab order: email → password → login → forgot link", async ({ page }) => {
      await page.goto("/login");
      await waitForHydration(page);

      await page.locator("#email").focus();
      await expect(page.locator("#email")).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(page.locator("#password")).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: /login/i })).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: /forgot your password/i })).toBeFocused();
    });
  });
});
