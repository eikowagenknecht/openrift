import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";
import { fetchLatestOtp } from "../../helpers/otp.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function signUp(
  request: APIRequestContext,
  email: string,
  password: string,
  name: string,
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name },
  });
  expect(response.ok()).toBeTruthy();
}

async function signIn(request: APIRequestContext, email: string, password: string): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
}

async function createAndLogin(
  page: Page,
  email: string,
  password: string,
  name: string,
): Promise<void> {
  const sql = loadDb();
  try {
    await signUp(page.request, email, password, name);
    await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
  } finally {
    await sql.end();
  }
  await signIn(page.request, email, password);
}

/**
 * Navigates to /profile and waits for the session-gated content to hydrate.
 *
 * The profile page returns null until `useSession` resolves, so typing into
 * inputs immediately after goto silently drops the input because React
 * remounts the form when the session data arrives.
 *
 * @returns resolves once the Account section is rendered.
 */
async function gotoProfileReady(page: Page): Promise<void> {
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Account", level: 2 })).toBeVisible({
    timeout: 15_000,
  });
  // Wait for React hydration on the Account Info form — the profile page is a
  // lazy route that renders `null` until `useSession` resolves, then mounts
  // the form. Typing before hydration silently drops input events.
  await page.waitForFunction(
    () => {
      const form = document.querySelector("form");
      if (!form) {
        return false;
      }
      return Object.keys(form).some((k) => k.startsWith("__react"));
    },
    { timeout: 15_000 },
  );
}

test.describe("profile account & security", () => {
  test.describe("display name", () => {
    test("pre-fills the field and disables Save when unchanged", async ({ page }) => {
      const email = uniqueEmail("name-prefill");
      await createAndLogin(page, email, "ProfileTestPassword1!", "Initial Name");

      await gotoProfileReady(page);

      const nameInput = page.getByLabel("Name", { exact: true });
      await expect(nameInput).toHaveValue("Initial Name", { timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    });

    test("updates the display name and reflects it in the header card", async ({ page }) => {
      const email = uniqueEmail("name-update");
      await createAndLogin(page, email, "ProfileTestPassword1!", "Initial Name");

      await gotoProfileReady(page);

      const nameInput = page.getByLabel("Name", { exact: true });
      await expect(nameInput).toHaveValue("Initial Name", { timeout: 15_000 });

      await nameInput.fill("Updated Name");
      await expect(nameInput).toHaveValue("Updated Name");
      const save = page.getByRole("button", { name: "Save", exact: true });
      await expect(save).toBeEnabled({ timeout: 10_000 });

      const updateRequest = page.waitForResponse(
        (res) => res.url().includes("/api/auth/update-user") && res.request().method() === "POST",
      );
      await save.click();
      await updateRequest;

      await expect(page.getByText("Name updated.")).toBeVisible({ timeout: 10_000 });
      // There are multiple card titles on the profile page (Display, Marketplaces,
      // Account Info, etc.) — scope to the header card (size xl) which shows
      // the user's display name.
      await expect(page.locator('[data-slot="card-title"].text-xl')).toHaveText("Updated Name", {
        timeout: 10_000,
      });
    });

    test("shows 'Name is required.' when the field is empty", async ({ page }) => {
      const email = uniqueEmail("name-empty");
      await createAndLogin(page, email, "ProfileTestPassword1!", "Initial Name");

      await gotoProfileReady(page);

      const nameInput = page.getByLabel("Name", { exact: true });
      await expect(nameInput).toHaveValue("Initial Name", { timeout: 15_000 });

      await nameInput.fill("");
      // The schema runs on submit; click Save (still enabled because "" !== defaultName).
      await page.getByRole("button", { name: "Save", exact: true }).click();

      await expect(page.getByText("Name is required.")).toBeVisible({ timeout: 10_000 });
    });

    test("re-disables Save when the value reverts to the original", async ({ page }) => {
      const email = uniqueEmail("name-revert");
      await createAndLogin(page, email, "ProfileTestPassword1!", "Initial Name");

      await gotoProfileReady(page);

      const nameInput = page.getByLabel("Name", { exact: true });
      await expect(nameInput).toHaveValue("Initial Name", { timeout: 15_000 });

      const save = page.getByRole("button", { name: "Save", exact: true });
      await nameInput.fill("Different");
      await expect(save).toBeEnabled();

      await nameInput.fill("Initial Name");
      await expect(save).toBeDisabled();
    });

    test("treats whitespace padding as unchanged (Save stays disabled)", async ({ page }) => {
      const email = uniqueEmail("name-padding");
      await createAndLogin(page, email, "ProfileTestPassword1!", "Initial Name");

      await gotoProfileReady(page);

      const nameInput = page.getByLabel("Name", { exact: true });
      await expect(nameInput).toHaveValue("Initial Name", { timeout: 15_000 });

      await nameInput.fill("   Initial Name   ");
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    });
  });

  test.describe("email change", () => {
    test("walks through the full current-then-new OTP flow", async ({ page }) => {
      const sql = loadDb();
      const oldEmail = uniqueEmail("email-old");
      const newEmail = uniqueEmail("email-new");
      const password = "EmailTestPassword1!";
      await createAndLogin(page, oldEmail, password, "Email E2E");

      await gotoProfileReady(page);

      // Step input → send OTP to current email.
      const newEmailInput = page.getByLabel(/^new email$/i);
      await expect(newEmailInput).toBeVisible({ timeout: 15_000 });

      const sendButton = page.getByRole("button", { name: /send code to current email/i });
      await expect(sendButton).toBeDisabled();

      await newEmailInput.fill(newEmail);
      await expect(sendButton).toBeEnabled();

      const sendCurrentRequest = page.waitForResponse(
        (res) =>
          res.url().includes("/api/auth/email-otp/send-verification-otp") &&
          res.request().method() === "POST",
      );
      await sendButton.click();
      await sendCurrentRequest;

      // Step verify-current.
      await expect(
        page.getByText(new RegExp(`Enter the 6-digit code sent to ${oldEmail}`, "i")),
      ).toBeVisible({ timeout: 10_000 });

      try {
        const currentOtp = await fetchLatestOtp(sql, oldEmail);
        await page.locator('input[autocomplete="one-time-code"]').first().fill(currentOtp);
        const requestEmailChange = page.waitForResponse((res) =>
          res.url().includes("/api/auth/email-otp/request-email-change"),
        );
        await page.getByRole("button", { name: /^verify$/i }).click();
        await requestEmailChange;

        // Step verify-new.
        await expect(
          page.getByText(new RegExp(`Enter the 6-digit code sent to ${newEmail}`, "i")),
        ).toBeVisible({ timeout: 10_000 });

        const newOtp = await fetchLatestOtp(sql, newEmail);
        await page.locator('input[autocomplete="one-time-code"]').first().fill(newOtp);

        const changeEmail = page.waitForResponse((res) =>
          res.url().includes("/api/auth/email-otp/change-email"),
        );
        await page.getByRole("button", { name: /^confirm$/i }).click();
        await changeEmail;

        await expect(page.getByText("Email updated successfully.")).toBeVisible({
          timeout: 10_000,
        });

        // The currentEmail label updates after the session re-invalidates.
        await expect(page.getByText(`(${newEmail})`)).toBeVisible({ timeout: 10_000 });

        // DB confirms the change.
        const rows = (await sql`
          SELECT email FROM users WHERE email = ${newEmail}
        `) as { email: string }[];
        expect(rows).toHaveLength(1);
      } finally {
        await sql.end();
      }
    });

    test("shows 'Code expired' when the current-email OTP is past expiry", async ({ page }) => {
      const sql = loadDb();
      const oldEmail = uniqueEmail("email-expired");
      const newEmail = uniqueEmail("email-expired-new");
      await createAndLogin(page, oldEmail, "EmailTestPassword1!", "Email E2E");

      await gotoProfileReady(page);
      await page.getByLabel(/^new email$/i).fill(newEmail);

      const sendCurrentRequest = page.waitForResponse((res) =>
        res.url().includes("/api/auth/email-otp/send-verification-otp"),
      );
      await page.getByRole("button", { name: /send code to current email/i }).click();
      await sendCurrentRequest;

      let otp: string;
      try {
        otp = await fetchLatestOtp(sql, oldEmail);
        await sql`
          UPDATE verifications
          SET expires_at = now() - interval '1 minute'
          WHERE identifier LIKE ${`%${oldEmail}%`}
        `;
      } finally {
        await sql.end();
      }

      await page.locator('input[autocomplete="one-time-code"]').first().fill(otp);
      await page.getByRole("button", { name: /^verify$/i }).click();

      await expect(page.getByText("Code expired. Please request a new one.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("shows 'Incorrect code' when the current-email OTP is wrong", async ({ page }) => {
      const oldEmail = uniqueEmail("email-wrong");
      const newEmail = uniqueEmail("email-wrong-new");
      await createAndLogin(page, oldEmail, "EmailTestPassword1!", "Email E2E");

      await gotoProfileReady(page);
      await page.getByLabel(/^new email$/i).fill(newEmail);

      const sendCurrentRequest = page.waitForResponse((res) =>
        res.url().includes("/api/auth/email-otp/send-verification-otp"),
      );
      await page.getByRole("button", { name: /send code to current email/i }).click();
      await sendCurrentRequest;

      await page.locator('input[autocomplete="one-time-code"]').first().fill("000000");
      await page.getByRole("button", { name: /^verify$/i }).click();

      await expect(page.getByText("Incorrect code. Please try again.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("shows 'Too many attempts' when the server returns TOO_MANY_ATTEMPTS", async ({
      page,
    }) => {
      const oldEmail = uniqueEmail("email-toomany");
      const newEmail = uniqueEmail("email-toomany-new");
      await createAndLogin(page, oldEmail, "EmailTestPassword1!", "Email E2E");

      // Intercept the request-email-change call before driving the UI.
      await page.route("**/api/auth/email-otp/request-email-change", async (route) => {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code: "TOO_MANY_ATTEMPTS", message: "Too many attempts" }),
        });
      });

      await gotoProfileReady(page);
      await page.getByLabel(/^new email$/i).fill(newEmail);
      const sendCurrentRequest = page.waitForResponse((res) =>
        res.url().includes("/api/auth/email-otp/send-verification-otp"),
      );
      await page.getByRole("button", { name: /send code to current email/i }).click();
      await sendCurrentRequest;

      await page.locator('input[autocomplete="one-time-code"]').first().fill("123456");
      await page.getByRole("button", { name: /^verify$/i }).click();

      await expect(page.getByText("Too many attempts. Please request a new code.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("'Resend code' on the verify-current step refires send-verification-otp", async ({
      page,
    }) => {
      const oldEmail = uniqueEmail("email-resend");
      const newEmail = uniqueEmail("email-resend-new");
      await createAndLogin(page, oldEmail, "EmailTestPassword1!", "Email E2E");

      await gotoProfileReady(page);
      await page.getByLabel(/^new email$/i).fill(newEmail);

      const firstSend = page.waitForResponse((res) =>
        res.url().includes("/api/auth/email-otp/send-verification-otp"),
      );
      await page.getByRole("button", { name: /send code to current email/i }).click();
      await firstSend;

      const resendRequest = page.waitForRequest((req) =>
        req.url().includes("/api/auth/email-otp/send-verification-otp"),
      );
      await page.getByRole("button", { name: /^resend code$/i }).click();
      await resendRequest;
    });

    test("'Cancel' on the verify-current step resets the form", async ({ page }) => {
      const oldEmail = uniqueEmail("email-cancel");
      const newEmail = uniqueEmail("email-cancel-new");
      await createAndLogin(page, oldEmail, "EmailTestPassword1!", "Email E2E");

      await gotoProfileReady(page);

      const newEmailInput = page.getByLabel(/^new email$/i);
      await newEmailInput.fill(newEmail);

      const sendCurrentRequest = page.waitForResponse((res) =>
        res.url().includes("/api/auth/email-otp/send-verification-otp"),
      );
      await page.getByRole("button", { name: /send code to current email/i }).click();
      await sendCurrentRequest;

      await page.getByRole("button", { name: /^cancel$/i }).click();

      // Back at the input step with a cleared field.
      await expect(page.getByLabel(/^new email$/i)).toHaveValue("");
      await expect(
        page.getByRole("button", { name: /send code to current email/i }),
      ).toBeDisabled();
    });
  });

  test.describe("password change", () => {
    test("rejects a too-short new password client-side", async ({ page }) => {
      const email = uniqueEmail("pw-short");
      await createAndLogin(page, email, "OldPassword1!", "Password E2E");

      await gotoProfileReady(page);

      await page.getByLabel(/^current password$/i).fill("OldPassword1!");
      await page.getByLabel(/^new password$/i).fill("New");
      await page.getByLabel(/^confirm new password$/i).fill("New");
      await page.getByRole("button", { name: /update password/i }).click();

      await expect(page.getByText("New password must be at least 8 characters.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("rejects mismatching new and confirm passwords", async ({ page }) => {
      const email = uniqueEmail("pw-mismatch");
      await createAndLogin(page, email, "OldPassword1!", "Password E2E");

      await gotoProfileReady(page);

      await page.getByLabel(/^current password$/i).fill("OldPassword1!");
      await page.getByLabel(/^new password$/i).fill("NewPassword1!");
      await page.getByLabel(/^confirm new password$/i).fill("Different1!");
      await page.getByRole("button", { name: /update password/i }).click();

      await expect(page.getByText("Passwords do not match.")).toBeVisible({ timeout: 10_000 });
    });

    test("updates the password and resets the form on success", async ({ page }) => {
      const email = uniqueEmail("pw-success");
      await createAndLogin(page, email, "OldPassword1!", "Password E2E");

      await gotoProfileReady(page);

      await page.getByLabel(/^current password$/i).fill("OldPassword1!");
      await page.getByLabel(/^new password$/i).fill("NewPassword1!");
      await page.getByLabel(/^confirm new password$/i).fill("NewPassword1!");

      const changeRequest = page.waitForResponse((res) =>
        res.url().includes("/api/auth/change-password"),
      );
      await page.getByRole("button", { name: /update password/i }).click();
      await changeRequest;

      await expect(page.getByText("Password updated.")).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel(/^current password$/i)).toHaveValue("");
      await expect(page.getByLabel(/^new password$/i)).toHaveValue("");
      await expect(page.getByLabel(/^confirm new password$/i)).toHaveValue("");
    });

    test("surfaces 'Current password is incorrect.' when the current password is wrong", async ({
      page,
    }) => {
      const email = uniqueEmail("pw-wrong");
      await createAndLogin(page, email, "OldPassword1!", "Password E2E");

      await gotoProfileReady(page);

      await page.getByLabel(/^current password$/i).fill("NotMyPassword1!");
      await page.getByLabel(/^new password$/i).fill("NewPassword1!");
      await page.getByLabel(/^confirm new password$/i).fill("NewPassword1!");
      await page.getByRole("button", { name: /update password/i }).click();

      await expect(page.getByText("Current password is incorrect.")).toBeVisible({
        timeout: 10_000,
      });
    });

    test("the new password is the only one that works after a successful change", async ({
      page,
      browser,
    }) => {
      const email = uniqueEmail("pw-applied");
      await createAndLogin(page, email, "OldPassword1!", "Password E2E");

      await gotoProfileReady(page);
      await page.getByLabel(/^current password$/i).fill("OldPassword1!");
      await page.getByLabel(/^new password$/i).fill("NewPassword1!");
      await page.getByLabel(/^confirm new password$/i).fill("NewPassword1!");

      const changeRequest = page.waitForResponse((res) =>
        res.url().includes("/api/auth/change-password"),
      );
      await page.getByRole("button", { name: /update password/i }).click();
      await changeRequest;
      await expect(page.getByText("Password updated.")).toBeVisible({ timeout: 10_000 });

      // Use a fresh APIRequestContext so we don't pollute the page's cookies.
      const fresh = await browser.newContext();
      try {
        const oldAttempt = await fresh.request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
          headers: { Origin: WEB_BASE_URL },
          data: { email, password: "OldPassword1!" },
        });
        expect(oldAttempt.ok()).toBeFalsy();

        const newAttempt = await fresh.request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
          headers: { Origin: WEB_BASE_URL },
          data: { email, password: "NewPassword1!" },
        });
        expect(newAttempt.ok()).toBeTruthy();
      } finally {
        await fresh.close();
      }
    });
  });

  test.describe("connected accounts", () => {
    test("shows Connect for both Google and Discord on a fresh user", async ({ page }) => {
      const email = uniqueEmail("connected-empty");
      await createAndLogin(page, email, "ConnectedTestPassword1!", "Connected E2E");

      await gotoProfileReady(page);

      // Scope to the Connected Accounts card so we don't match the footer
      // Discord link by accident.
      const card = page.locator('[data-slot="card"]', {
        has: page.getByText("Connected Accounts"),
      });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card.getByText("Google", { exact: true })).toBeVisible();
      await expect(card.getByText("Discord", { exact: true })).toBeVisible();

      // Both providers offer Connect; neither shows Unlink yet.
      await expect(card.getByRole("button", { name: /^connect$/i })).toHaveCount(2);
      await expect(card.getByRole("button", { name: /^unlink$/i })).toHaveCount(0);
    });

    test("clicking Connect on Google triggers a link-social redirect to Google", async ({
      page,
    }) => {
      const email = uniqueEmail("connected-link");
      await createAndLogin(page, email, "ConnectedTestPassword1!", "Connected E2E");

      // Stop the browser from actually leaving for accounts.google.com.
      await page.route("https://accounts.google.com/**", (route) => route.abort());

      // Intercept the link-social response and capture the body before the
      // browser navigates (otherwise the response body is garbage-collected
      // and response.json() throws a "No resource with given identifier" error).
      const capturedUrl = new Promise<string>((resolve) => {
        void page.route("**/api/auth/link-social", async (route) => {
          const response = await route.fetch();
          const body = (await response.json()) as { url?: string };
          resolve(body.url ?? "");
          await route.fulfill({ response });
        });
      });

      await gotoProfileReady(page);
      await expect(page.getByText("Connected Accounts")).toBeVisible({ timeout: 15_000 });

      // The first Connect button corresponds to the first SOCIAL_PROVIDERS entry (Google).
      await page
        .getByRole("button", { name: /^connect$/i })
        .first()
        .click();
      const url = await capturedUrl;
      expect(url).toContain("accounts.google.com");
    });

    test("can unlink a previously linked Google account", async ({ page }) => {
      const sql = loadDb();
      const email = uniqueEmail("connected-unlink");
      const password = "ConnectedTestPassword1!";
      try {
        await signUp(page.request, email, password, "Connected E2E");
        await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;

        const userRows = (await sql`
          SELECT id FROM users WHERE email = ${email}
        `) as { id: string }[];
        const userId = userRows[0].id;
        const accountId = `e2e-google-${Date.now()}`;
        await sql`
          INSERT INTO accounts (id, user_id, account_id, provider_id)
          VALUES (${`acc-${accountId}`}, ${userId}, ${accountId}, 'google')
        `;
      } finally {
        await sql.end();
      }
      await signIn(page.request, email, password);

      await gotoProfileReady(page);
      await expect(page.getByText("Connected Accounts")).toBeVisible({ timeout: 15_000 });

      const unlink = page.getByRole("button", { name: /^unlink$/i });
      await expect(unlink).toBeVisible({ timeout: 10_000 });
      await expect(unlink).toBeEnabled();

      const unlinkRequest = page.waitForResponse((res) =>
        res.url().includes("/api/auth/unlink-account"),
      );
      await unlink.click();
      await unlinkRequest;

      await expect(page.getByRole("button", { name: /^unlink$/i })).toHaveCount(0, {
        timeout: 10_000,
      });
      await expect(page.getByRole("button", { name: /^connect$/i })).toHaveCount(2);
    });

    // The "single linked account" tooltip guard requires a user with exactly
    // one social account and no credential password. listAccounts returns the
    // credential row alongside any social row, so the disabled-Unlink path is
    // not reachable for users created via email/password sign-up. See
    // apps/web/src/components/profile/connected-accounts-section.tsx:70.
    test.skip("disables Unlink on the only remaining account and shows the tooltip", () => {});
  });
});
