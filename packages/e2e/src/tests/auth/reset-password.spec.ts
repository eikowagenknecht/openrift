import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { test } from "../../fixtures/test.js";
import { createVerifiedUser, loadDb, waitForHydration } from "../../helpers/auth-otp.js";
import { API_BASE_URL, WEB_BASE_URL } from "../../helpers/constants.js";
import { fetchLatestOtp } from "../../helpers/otp.js";

async function sendResetOtp(request: APIRequestContext, email: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/email-otp/send-verification-otp`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, type: "forget-password" },
  });
  expect(response.ok()).toBeTruthy();
}

async function fillOtp(page: Page, value: string) {
  await page.locator('input[autocomplete="one-time-code"]').fill(value);
}

test.describe("reset password", () => {
  test.describe("step 1: email", () => {
    test("lands on step 1 without ?email=", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
      await expect(page.locator("#reset-email")).toBeVisible();
      await expect(page.getByRole("button", { name: /send code/i })).toBeVisible();
    });

    test("empty email shows 'Please enter a valid email address.'", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      await page.getByRole("button", { name: /send code/i }).click();

      await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
      await expect(page.locator("#reset-email")).toBeVisible();
    });

    test("malformed email shows the same inline error", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      await page.locator("#reset-email").fill("foo");
      await page.getByRole("button", { name: /send code/i }).click();

      await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
    });

    test("valid email advances to step 2 after the send-OTP request", async ({ page, request }) => {
      const sql = loadDb();
      const email = `reset-step1-advance-${Date.now()}@test.com`;
      try {
        await createVerifiedUser(request, sql, email, "ResetPassword1!");
      } finally {
        await sql.end();
      }

      await page.goto("/reset-password");
      await waitForHydration(page);
      await page.locator("#reset-email").fill(email);

      const otpRequest = page.waitForRequest((req) =>
        req.url().includes("/api/auth/email-otp/send-verification-otp"),
      );
      await page.getByRole("button", { name: /send code/i }).click();
      await otpRequest;

      await expect(page.getByRole("button", { name: /reset password/i })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(email, { exact: true })).toBeVisible();
    });

    test("Send code button shows a 'Sending...' loading state while in flight", async ({
      page,
    }) => {
      await page.route("**/api/auth/email-otp/send-verification-otp", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto("/reset-password");
      await waitForHydration(page);
      await page.locator("#reset-email").fill("loading-state@test.com");
      await page.getByRole("button", { name: /send code/i }).click();

      const sending = page.getByRole("button", { name: "Sending..." });
      await expect(sending).toBeVisible();
      await expect(sending).toBeDisabled();
    });
  });

  test.describe("step 2: deep-linked via ?email=", () => {
    test("renders step 2 directly (no Send code button)", async ({ page }) => {
      const email = "deeplink@test.com";
      await page.goto(`/reset-password?email=${encodeURIComponent(email)}`);
      await waitForHydration(page);

      await expect(page.getByRole("button", { name: /reset password/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /send code/i })).toHaveCount(0);
      await expect(page.getByText(email, { exact: true })).toBeVisible();
    });

    test("Reset password is disabled when OTP is empty", async ({ page }) => {
      await page.goto("/reset-password?email=foo@test.com");
      await waitForHydration(page);

      await page.locator("#new-password").fill("NewPassword1!");
      await expect(page.getByRole("button", { name: /reset password/i })).toBeDisabled();
    });

    test("Reset password is disabled when OTP has fewer than 6 digits", async ({ page }) => {
      await page.goto("/reset-password?email=foo@test.com");
      await waitForHydration(page);

      await fillOtp(page, "12345");
      await page.locator("#new-password").fill("NewPassword1!");
      await expect(page.getByRole("button", { name: /reset password/i })).toBeDisabled();
    });

    test("Reset password is disabled when new password is empty", async ({ page }) => {
      await page.goto("/reset-password?email=foo@test.com");
      await waitForHydration(page);

      await fillOtp(page, "123456");
      await expect(page.getByRole("button", { name: /reset password/i })).toBeDisabled();
    });

    test("Reset password is enabled with a 6-digit OTP and a non-empty password", async ({
      page,
    }) => {
      await page.goto("/reset-password?email=foo@test.com");
      await waitForHydration(page);

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("NewPassword1!");
      await expect(page.getByRole("button", { name: /reset password/i })).toBeEnabled();
    });
  });

  test.describe("step 2: client validation", () => {
    test("password shorter than 8 chars shows 'at least 8 characters'", async ({ page }) => {
      await page.goto("/reset-password?email=foo@test.com");
      await waitForHydration(page);

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("Short1!");
      await page.locator("#confirm-password").fill("Short1!");
      await page.getByRole("button", { name: /reset password/i }).click();

      await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
    });

    test("mismatched confirm shows 'Passwords do not match'", async ({ page }) => {
      await page.goto("/reset-password?email=foo@test.com");
      await waitForHydration(page);

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("Different1!");
      await page.getByRole("button", { name: /reset password/i }).click();

      await expect(page.getByText("Passwords do not match.")).toBeVisible();
    });
  });

  test.describe("step 2: server errors", () => {
    test("wrong OTP shows 'Incorrect code. Please try again.'", async ({ page, request }) => {
      const sql = loadDb();
      const email = `reset-wrong-${Date.now()}@test.com`;
      try {
        await createVerifiedUser(request, sql, email, "ResetPassword1!");
      } finally {
        await sql.end();
      }
      await sendResetOtp(request, email);

      await page.goto(`/reset-password?email=${encodeURIComponent(email)}`);
      await waitForHydration(page);

      await fillOtp(page, "000000");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/i }).click();

      await expect(page.getByText("Incorrect code. Please try again.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("expired OTP shows 'Code expired. Please request a new one.'", async ({
      page,
      request,
    }) => {
      const sql = loadDb();
      const email = `reset-expired-${Date.now()}@test.com`;
      let otp: string;
      try {
        await createVerifiedUser(request, sql, email, "ResetPassword1!");
        await sendResetOtp(request, email);
        otp = await fetchLatestOtp(sql, email);
        await sql`
          UPDATE verifications
          SET expires_at = now() - interval '1 minute'
          WHERE identifier LIKE ${`%${email}%`}
        `;
      } finally {
        await sql.end();
      }

      await page.goto(`/reset-password?email=${encodeURIComponent(email)}`);
      await waitForHydration(page);

      await fillOtp(page, otp);
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/i }).click();

      await expect(page.getByText("Code expired. Please request a new one.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("TOO_MANY_ATTEMPTS renders the user-facing message", async ({ page }) => {
      await page.route("**/api/auth/email-otp/reset-password", async (route) => {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ code: "TOO_MANY_ATTEMPTS", message: "Too many attempts" }),
        });
      });

      await page.goto("/reset-password?email=too-many@test.com");
      await waitForHydration(page);

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/i }).click();

      await expect(page.getByText("Too many attempts. Please request a new code.")).toBeVisible();
    });

    test("error with no code or message falls back to 'Something went wrong.'", async ({
      page,
    }) => {
      await page.route("**/api/auth/email-otp/reset-password", async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "",
        });
      });

      await page.goto("/reset-password?email=unknown-error@test.com");
      await waitForHydration(page);

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/i }).click();

      await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible();
    });
  });

  test.describe("step 2: success", () => {
    test("resets password, redirects to /login?email=, and the new password works", async ({
      page,
      request,
    }) => {
      const sql = loadDb();
      const email = `reset-success-${Date.now()}@test.com`;
      const oldPassword = "OldPassword1!";
      const newPassword = "NewPassword1!";
      let otp: string;
      try {
        await createVerifiedUser(request, sql, email, oldPassword);
        await sendResetOtp(request, email);
        otp = await fetchLatestOtp(sql, email);
      } finally {
        await sql.end();
      }

      await page.goto(`/reset-password?email=${encodeURIComponent(email)}`);
      await waitForHydration(page);

      await fillOtp(page, otp);
      await page.locator("#new-password").fill(newPassword);
      await page.locator("#confirm-password").fill(newPassword);
      await page.getByRole("button", { name: /reset password/i }).click();

      await expect(page).toHaveURL(/\/login\?/, { timeout: 15_000 });
      const loginUrl = new URL(page.url());
      expect(loginUrl.pathname).toBe("/login");
      expect(loginUrl.searchParams.get("email")).toBe(email);

      await waitForHydration(page);
      await page.locator("#password").fill(newPassword);
      await page.getByRole("button", { name: /login/i }).click();

      await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    });

    test("old password is rejected after reset", async ({ page, request }) => {
      const sql = loadDb();
      const email = `reset-old-reject-${Date.now()}@test.com`;
      const oldPassword = "OldPassword1!";
      const newPassword = "NewPassword1!";
      let otp: string;
      try {
        await createVerifiedUser(request, sql, email, oldPassword);
        await sendResetOtp(request, email);
        otp = await fetchLatestOtp(sql, email);
      } finally {
        await sql.end();
      }

      await page.goto(`/reset-password?email=${encodeURIComponent(email)}`);
      await waitForHydration(page);

      await fillOtp(page, otp);
      await page.locator("#new-password").fill(newPassword);
      await page.locator("#confirm-password").fill(newPassword);
      await page.getByRole("button", { name: /reset password/i }).click();

      await expect(page).toHaveURL(/\/login\?/, { timeout: 15_000 });
      await waitForHydration(page);

      await page.locator("#password").fill(oldPassword);
      await page.getByRole("button", { name: /login/i }).click();

      await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("resend", () => {
    test("clicking Resend code fires a send-OTP request", async ({ page }) => {
      await page.goto("/reset-password?email=resend@test.com");
      await waitForHydration(page);

      const resendRequest = page.waitForRequest((req) =>
        req.url().includes("/api/auth/email-otp/send-verification-otp"),
      );
      const resendButton = page.getByRole("button", { name: /^resend code$/i });
      await resendButton.click();
      await resendRequest;

      await expect(resendButton).toBeVisible({ timeout: 10_000 });
    });

    test("Resend clears the prior error message", async ({ page, request }) => {
      const sql = loadDb();
      const email = `reset-resend-${Date.now()}@test.com`;
      try {
        await createVerifiedUser(request, sql, email, "ResetPassword1!");
        await sendResetOtp(request, email);
      } finally {
        await sql.end();
      }

      await page.goto(`/reset-password?email=${encodeURIComponent(email)}`);
      await waitForHydration(page);

      await fillOtp(page, "000000");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/i }).click();
      await expect(page.getByText("Incorrect code. Please try again.")).toBeVisible({
        timeout: 10_000,
      });

      await page.getByRole("button", { name: /^resend code$/i }).click();
      await expect(page.getByText("Incorrect code. Please try again.")).toHaveCount(0);
    });
  });

  test.describe("navigation", () => {
    test("step 1 'Back to login' without a typed email goes to /login", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      await page.getByRole("link", { name: /back to login/i }).click();

      await expect(page).toHaveURL(/\/login(\?|$)/);
      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("email")).toBeNull();
    });

    test("step 1 'Back to login' carries the typed email", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      const typed = `typed-${Date.now()}@test.com`;
      await page.locator("#reset-email").fill(typed);
      await page.getByRole("link", { name: /back to login/i }).click();

      await expect(page).toHaveURL(/\/login\?/);
      const url = new URL(page.url());
      expect(url.searchParams.get("email")).toBe(typed);
    });

    test("step 2 'Back to login' carries the deep-linked email", async ({ page }) => {
      const email = `deeplink-back-${Date.now()}@test.com`;
      await page.goto(`/reset-password?email=${encodeURIComponent(email)}`);
      await waitForHydration(page);

      await page.getByRole("link", { name: /back to login/i }).click();

      await expect(page).toHaveURL(/\/login\?/);
      const url = new URL(page.url());
      expect(url.searchParams.get("email")).toBe(email);
    });
  });

  test.describe("head / route", () => {
    test("document title contains 'Reset Password'", async ({ page }) => {
      await page.goto("/reset-password");
      await expect(page).toHaveTitle(/Reset Password/);
    });

    test("includes a noindex robots meta tag", async ({ page }) => {
      await page.goto("/reset-password");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/, {
        timeout: 10_000,
      });
    });

    test("renders even when the user is already authenticated", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/reset-password");

      await expect(
        authenticatedPage.getByRole("heading", { name: "Reset your password" }),
      ).toBeVisible();
      await expect(authenticatedPage).toHaveURL(/\/reset-password/);
    });
  });
});
