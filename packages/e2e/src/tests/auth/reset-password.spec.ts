import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { test } from "../../fixtures/test.js";
import { createVerifiedUser, loadDb, waitForHydration } from "../../helpers/auth-otp.js";
import { fetchLatestOtp } from "../../helpers/otp.js";

async function fillOtp(page: Page, value: string) {
  await page.locator('input[autocomplete="one-time-code"]').fill(value);
}

// ?email= only prefills step 1: the code step claims a code was sent, so only
// sending one gets there.
async function gotoStep2(page: Page, email: string, options?: { realSend?: boolean }) {
  if (!options?.realSend) {
    await page.route("**/api/auth/email-otp/send-verification-otp", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      }),
    );
  }
  await page.goto(`/reset-password?email=${encodeURIComponent(email)}`);
  await waitForHydration(page);
  await page.getByRole("button", { name: /^send code$/iu }).click();
  await expect(page.getByRole("button", { name: /reset password/iu })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("reset password", () => {
  test.describe("step 1: email", () => {
    test("lands on step 1 without ?email=", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
      await expect(page.locator("#reset-email")).toBeVisible();
      await expect(page.getByRole("button", { name: /send code/iu })).toBeVisible();
    });

    test("empty email shows 'Please enter a valid email address.'", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      await page.getByRole("button", { name: /send code/iu }).click();

      await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
      await expect(page.locator("#reset-email")).toBeVisible();
    });

    test("malformed email shows the same inline error", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      await page.locator("#reset-email").fill("foo");
      await page.getByRole("button", { name: /send code/iu }).click();

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
      await page.getByRole("button", { name: /send code/iu }).click();
      await otpRequest;

      await expect(page.getByRole("button", { name: /reset password/iu })).toBeVisible({
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
      await page.getByRole("button", { name: /send code/iu }).click();

      const sending = page.getByRole("button", { name: "Sending..." });
      await expect(sending).toBeVisible();
      await expect(sending).toBeDisabled();
    });
  });

  test.describe("step 2: reached from a prefilled ?email=", () => {
    test("sending the code replaces step 1 with the code step", async ({ page }) => {
      const email = "deeplink@test.com";
      await gotoStep2(page, email);

      await expect(page.getByRole("button", { name: /^send code$/iu })).toHaveCount(0);
      await expect(page.getByText(email, { exact: true })).toBeVisible();
    });

    test("Reset password is disabled when OTP is empty", async ({ page }) => {
      await gotoStep2(page, "foo@test.com");

      await page.locator("#new-password").fill("NewPassword1!");
      await expect(page.getByRole("button", { name: /reset password/iu })).toBeDisabled();
    });

    test("Reset password is disabled when OTP has fewer than 6 digits", async ({ page }) => {
      await gotoStep2(page, "foo@test.com");

      await fillOtp(page, "12345");
      await page.locator("#new-password").fill("NewPassword1!");
      await expect(page.getByRole("button", { name: /reset password/iu })).toBeDisabled();
    });

    test("Reset password is disabled when new password is empty", async ({ page }) => {
      await gotoStep2(page, "foo@test.com");

      await fillOtp(page, "123456");
      await expect(page.getByRole("button", { name: /reset password/iu })).toBeDisabled();
    });

    test("Reset password is enabled with a 6-digit OTP and a non-empty password", async ({
      page,
    }) => {
      await gotoStep2(page, "foo@test.com");

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("NewPassword1!");
      await expect(page.getByRole("button", { name: /reset password/iu })).toBeEnabled();
    });
  });

  test.describe("step 2: client validation", () => {
    test("password shorter than 8 chars shows 'at least 8 characters'", async ({ page }) => {
      await gotoStep2(page, "foo@test.com");

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("Short1!");
      await page.locator("#confirm-password").fill("Short1!");
      await page.getByRole("button", { name: /reset password/iu }).click();

      await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
    });

    test("mismatched confirm shows 'Passwords do not match'", async ({ page }) => {
      await gotoStep2(page, "foo@test.com");

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("Different1!");
      await page.getByRole("button", { name: /reset password/iu }).click();

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

      await gotoStep2(page, email, { realSend: true });

      await fillOtp(page, "000000");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/iu }).click();

      await expect(page.getByText("Incorrect code. Please try again.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("expired OTP is rejected with an error", async ({ page, request }) => {
      const sql = loadDb();
      const email = `reset-expired-${Date.now()}@test.com`;
      let otp: string;
      try {
        await createVerifiedUser(request, sql, email, "ResetPassword1!");

        await gotoStep2(page, email, { realSend: true });

        otp = await fetchLatestOtp(sql, email);
        await sql`
          UPDATE verifications
          SET expires_at = now() - interval '1 minute'
          WHERE identifier LIKE ${`%${email}%`}
        `;
      } finally {
        await sql.end();
      }

      await fillOtp(page, otp);
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/iu }).click();

      // better-auth's expired-row sweep race decides whether the code reports
      // as expired or merely invalid; either is a pass.
      await expect(
        page.getByText(
          /Code expired\. Please request a new one\.|Incorrect code\. Please try again\./u,
        ),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("TOO_MANY_ATTEMPTS renders the user-facing message", async ({ page }) => {
      await page.route("**/api/auth/email-otp/reset-password", async (route) => {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ code: "TOO_MANY_ATTEMPTS", message: "Too many attempts" }),
        });
      });

      await gotoStep2(page, "too-many@test.com");

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/iu }).click();

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

      await gotoStep2(page, "unknown-error@test.com");

      await fillOtp(page, "123456");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/iu }).click();

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

        await gotoStep2(page, email, { realSend: true });

        otp = await fetchLatestOtp(sql, email);
      } finally {
        await sql.end();
      }

      await fillOtp(page, otp);
      await page.locator("#new-password").fill(newPassword);
      await page.locator("#confirm-password").fill(newPassword);
      await page.getByRole("button", { name: /reset password/iu }).click();

      await expect(page).toHaveURL(/\/login\?/u, { timeout: 15_000 });
      const loginUrl = new URL(page.url());
      expect(loginUrl.pathname).toBe("/login");
      expect(loginUrl.searchParams.get("email")).toBe(email);

      await waitForHydration(page);
      await page.locator("#password").fill(newPassword);
      await page.getByRole("button", { name: /login/iu }).click();

      await expect(page).not.toHaveURL(/\/login/u, { timeout: 15_000 });
    });

    test("old password is rejected after reset", async ({ page, request }) => {
      const sql = loadDb();
      const email = `reset-old-reject-${Date.now()}@test.com`;
      const oldPassword = "OldPassword1!";
      const newPassword = "NewPassword1!";
      let otp: string;
      try {
        await createVerifiedUser(request, sql, email, oldPassword);

        await gotoStep2(page, email, { realSend: true });

        otp = await fetchLatestOtp(sql, email);
      } finally {
        await sql.end();
      }

      await fillOtp(page, otp);
      await page.locator("#new-password").fill(newPassword);
      await page.locator("#confirm-password").fill(newPassword);
      await page.getByRole("button", { name: /reset password/iu }).click();

      await expect(page).toHaveURL(/\/login\?/u, { timeout: 15_000 });
      await waitForHydration(page);

      await page.locator("#password").fill(oldPassword);
      await page.getByRole("button", { name: /login/iu }).click();

      await expect(page.getByText("Invalid email or password")).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("resend", () => {
    test("clicking Resend code fires a send-OTP request", async ({ page }) => {
      await gotoStep2(page, "resend@test.com");

      const resendRequest = page.waitForRequest((req) =>
        req.url().includes("/api/auth/email-otp/send-verification-otp"),
      );
      const resendButton = page.getByRole("button", { name: /^resend code$/iu });
      await resendButton.click();
      await resendRequest;

      await expect(resendButton).toBeVisible({ timeout: 10_000 });
    });

    test("Resend clears the prior error message", async ({ page, request }) => {
      const sql = loadDb();
      const email = `reset-resend-${Date.now()}@test.com`;
      try {
        await createVerifiedUser(request, sql, email, "ResetPassword1!");
      } finally {
        await sql.end();
      }

      await gotoStep2(page, email, { realSend: true });

      await fillOtp(page, "000000");
      await page.locator("#new-password").fill("NewPassword1!");
      await page.locator("#confirm-password").fill("NewPassword1!");
      await page.getByRole("button", { name: /reset password/iu }).click();
      await expect(page.getByText("Incorrect code. Please try again.")).toBeVisible({
        timeout: 10_000,
      });

      await page.getByRole("button", { name: /^resend code$/iu }).click();
      await expect(page.getByText("Incorrect code. Please try again.")).toHaveCount(0);
    });
  });

  test.describe("navigation", () => {
    test("step 1 'Back to login' without a typed email goes to /login", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      await page.getByRole("link", { name: /back to login/iu }).click();

      await expect(page).toHaveURL(/\/login(?:\?|$)/u);
      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("email")).toBeNull();
    });

    test("step 1 'Back to login' carries the typed email", async ({ page }) => {
      await page.goto("/reset-password");
      await waitForHydration(page);

      const typed = `typed-${Date.now()}@test.com`;
      await page.locator("#reset-email").fill(typed);
      await page.getByRole("link", { name: /back to login/iu }).click();

      await expect(page).toHaveURL(/\/login\?/u);
      const url = new URL(page.url());
      expect(url.searchParams.get("email")).toBe(typed);
    });

    test("step 1 'Back to login' carries the prefilled email", async ({ page }) => {
      const email = `deeplink-back-${Date.now()}@test.com`;
      await page.goto(`/reset-password?email=${encodeURIComponent(email)}`);
      await waitForHydration(page);

      await page.getByRole("link", { name: /back to login/iu }).click();

      await expect(page).toHaveURL(/\/login\?/u);
      const url = new URL(page.url());
      expect(url.searchParams.get("email")).toBe(email);
    });
  });

  test.describe("head / route", () => {
    test("document title contains 'Reset Password'", async ({ page }) => {
      await page.goto("/reset-password");
      await expect(page).toHaveTitle(/Reset Password/u);
    });

    test("includes a noindex robots meta tag", async ({ page }) => {
      await page.goto("/reset-password");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u, {
        timeout: 10_000,
      });
    });

    test("renders even when the user is already authenticated", async ({ authenticatedPage }) => {
      await authenticatedPage.goto("/reset-password");

      await expect(
        authenticatedPage.getByRole("heading", { name: "Reset your password" }),
      ).toBeVisible();
      await expect(authenticatedPage).toHaveURL(/\/reset-password/u);
    });
  });
});
