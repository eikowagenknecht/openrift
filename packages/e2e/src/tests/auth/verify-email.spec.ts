import { readFileSync } from "node:fs";

import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

import { test } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";
import { fetchLatestOtp } from "../../helpers/otp.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Verify E2E" },
  });
  expect(response.ok()).toBeTruthy();
}

const VERIFY_URL_REGEX = /\/api\/auth\/email-otp\/verify-email/;
const SEND_URL_REGEX = /\/api\/auth\/email-otp\/send-verification-otp/;
const OTP_INPUT = 'input[autocomplete="one-time-code"]';

test.describe("verify email page", () => {
  test.describe("rendering", () => {
    test("renders all expected elements when ?email= is present", async ({ page }) => {
      await page.goto("/verify-email?email=foo@test.com");

      // The auth form card renders the OpenRift logo twice — a mobile version
      // (md:hidden) and a desktop version (hidden md:block). Only one is
      // visible per viewport, but both exist in the DOM.
      await expect(page.getByRole("img", { name: "OpenRift" }).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
      await expect(page.getByText(/foo@test\.com/)).toBeVisible();
      await expect(page.locator(OTP_INPUT)).toBeVisible();
      await expect(page.getByRole("button", { name: /^verify$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^resend code$/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /back to login/i })).toBeVisible();
    });

    test("verify button is disabled before any digits are entered", async ({ page }) => {
      await page.goto("/verify-email?email=foo@test.com");

      await expect(page.getByRole("button", { name: /^verify$/i })).toBeDisabled();
    });

    test("autofocuses the OTP input", async ({ page }) => {
      await page.goto("/verify-email?email=foo@test.com");

      await expect(page.locator(OTP_INPUT)).toBeFocused({ timeout: 10_000 });
    });

    test("renders without crashing when ?email= is missing", async ({ page }) => {
      await page.goto("/verify-email");

      await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
      await expect(page.locator(OTP_INPUT)).toBeVisible();
      await expect(page.getByRole("button", { name: /^verify$/i })).toBeVisible();
    });

    test("includes a noindex robots meta tag and a Verify Email title", async ({ page }) => {
      await page.goto("/verify-email?email=foo@test.com");

      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/, {
        timeout: 10_000,
      });
      await expect(page).toHaveTitle(/Verify Email/i, { timeout: 10_000 });
    });
  });

  test.describe("OTP input behavior", () => {
    test("verify button stays disabled with fewer than 6 digits", async ({ page }) => {
      await page.goto("/verify-email?email=foo@test.com");

      await page.locator(OTP_INPUT).fill("12345");

      await expect(page.getByRole("button", { name: /^verify$/i })).toBeDisabled();
    });
  });

  test.describe("errors", () => {
    test("shows 'Incorrect code' for an invalid OTP", async ({ page, request }) => {
      const email = `verify-invalid-${Date.now()}@test.com`;
      await signUp(request, email, "VerifyTestPassword1!");

      await page.goto(`/verify-email?email=${encodeURIComponent(email)}`);
      await page.locator(OTP_INPUT).fill("000000");

      await expect(page.getByText("Incorrect code. Please try again.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("shows 'Code expired' when the OTP has expired", async ({ page, request }) => {
      const sql = loadDb();
      const email = `verify-expired-${Date.now()}@test.com`;
      let otp: string;
      try {
        await signUp(request, email, "VerifyTestPassword1!");
        otp = await fetchLatestOtp(sql, email);
        await sql`
          UPDATE verifications
          SET expires_at = now() - interval '1 minute'
          WHERE identifier LIKE ${`%${email}%`}
        `;
      } finally {
        await sql.end();
      }

      await page.goto(`/verify-email?email=${encodeURIComponent(email)}`);
      await page.locator(OTP_INPUT).fill(otp);

      await expect(page.getByText("Code expired. Please request a new one.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("shows 'Too many attempts' when the API returns TOO_MANY_ATTEMPTS", async ({ page }) => {
      await page.route(VERIFY_URL_REGEX, async (route) => {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            code: "TOO_MANY_ATTEMPTS",
            message: "Too many attempts",
          }),
        });
      });

      await page.goto("/verify-email?email=foo@test.com");
      await page.locator(OTP_INPUT).fill("123456");

      await expect(page.getByText("Too many attempts. Please request a new code.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("renders an unknown error's message verbatim", async ({ page }) => {
      await page.route(VERIFY_URL_REGEX, async (route) => {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            code: "SOMETHING_ELSE",
            message: "A custom backend error message",
          }),
        });
      });

      await page.goto("/verify-email?email=foo@test.com");
      await page.locator(OTP_INPUT).fill("123456");

      await expect(page.getByText("A custom backend error message")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("falls back to a generic error when the response has no message", async ({ page }) => {
      await page.route(VERIFY_URL_REGEX, async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      });

      await page.goto("/verify-email?email=foo@test.com");
      await page.locator(OTP_INPUT).fill("123456");

      await expect(page.getByText("Something went wrong. Please try again.")).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test.describe("success", () => {
    test("verifies, redirects to /cards, and marks email_verified true", async ({
      page,
      request,
    }) => {
      const sql = loadDb();
      const email = `verify-success-${Date.now()}@test.com`;
      let otp: string;
      try {
        await signUp(request, email, "VerifyTestPassword1!");
        otp = await fetchLatestOtp(sql, email);

        await page.goto(`/verify-email?email=${encodeURIComponent(email)}`);
        await page.locator(OTP_INPUT).fill(otp);

        await expect(page).toHaveURL(/\/cards/, { timeout: 15_000 });

        const rows = (await sql`
          SELECT email_verified FROM users WHERE email = ${email}
        `) as { email_verified: boolean }[];
        expect(rows[0]?.email_verified).toBe(true);
      } finally {
        await sql.end();
      }
    });
  });

  test.describe("resend", () => {
    test("triggers a send-verification-otp request when Resend is clicked", async ({
      page,
      request,
    }) => {
      const email = `verify-resend-${Date.now()}@test.com`;
      await signUp(request, email, "VerifyTestPassword1!");

      await page.goto(`/verify-email?email=${encodeURIComponent(email)}`);
      // Wait for React to hydrate before clicking — the Resend button's
      // onClick isn't attached until then, and the first click otherwise
      // fires into the void.
      await expect(page.getByRole("button", { name: /^resend code$/i })).toBeVisible();
      await page.waitForFunction(
        () => {
          const btn = document.querySelector("button");
          return btn !== null && Object.keys(btn).some((k) => k.startsWith("__react"));
        },
        { timeout: 10_000 },
      );

      const resendRequest = page.waitForRequest((req) => SEND_URL_REGEX.test(req.url()));
      await page.getByRole("button", { name: /^resend code$/i }).click();
      await resendRequest;
    });

    test("clears a previous error when Resend is clicked", async ({ page, request }) => {
      const email = `verify-resend-clear-${Date.now()}@test.com`;
      await signUp(request, email, "VerifyTestPassword1!");

      await page.goto(`/verify-email?email=${encodeURIComponent(email)}`);
      await page.locator(OTP_INPUT).fill("000000");

      const error = page.getByText("Incorrect code. Please try again.");
      await expect(error).toBeVisible({ timeout: 10_000 });

      await page.getByRole("button", { name: /^resend code$/i }).click();

      await expect(error).toBeHidden({ timeout: 10_000 });
    });
  });

  test.describe("navigation", () => {
    test("'Back to login' link goes to /login without email or redirect params", async ({
      page,
    }) => {
      await page.goto("/verify-email?email=foo@test.com");

      const link = page.getByRole("link", { name: /back to login/i });
      const href = await link.getAttribute("href");
      expect(href).toBe("/login");

      await link.click();
      await expect(page).toHaveURL(/\/login(\?|$)/);
    });
  });
});
