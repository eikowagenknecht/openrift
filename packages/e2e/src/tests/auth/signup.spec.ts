import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { test } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function waitForHydration(page: Page) {
  await page.locator("form").first().waitFor({ state: "attached" });
  await page.waitForFunction(
    () => {
      const formEl = document.querySelector("form");
      return formEl !== null && Object.keys(formEl).some((key) => key.startsWith("__react"));
    },
    { timeout: 10_000 },
  );
}

async function signUpViaApi(
  request: APIRequestContext,
  email: string,
  password: string,
  name = "Signup E2E",
) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("signup page", () => {
  test.describe("form shell", () => {
    test("renders heading, fields, and submit button", async ({ page }) => {
      await page.goto("/signup");

      await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
      await expect(page.getByLabel("Name")).toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByRole("button", { name: /^sign up$/i })).toBeVisible();
    });

    test("has a sign-in link pointing to /login", async ({ page }) => {
      await page.goto("/signup");

      // The header also has a "Sign in" link; scope to the body form's
      // "Already have an account? Sign in" link.
      const signInLink = page
        .getByText(/Already have an account/i)
        .getByRole("link", { name: /sign in/i });
      await expect(signInLink).toBeVisible();
      const href = await signInLink.getAttribute("href");
      expect(href).toContain("/login");
    });

    test("renders Google and Discord social auth buttons", async ({ page }) => {
      await page.goto("/signup");

      await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /discord/i })).toBeVisible();
    });
  });

  test.describe("client validation", () => {
    test("shows error for empty name", async ({ page }) => {
      await page.goto("/signup");
      await waitForHydration(page);

      await page.getByLabel("Email").fill("valid@test.com");
      await page.getByLabel("Password").fill("Password1!");
      await page.getByRole("button", { name: /^sign up$/i }).click();

      await expect(page.getByText("Name is required.")).toBeVisible();
    });

    test("shows error for invalid email format", async ({ page }) => {
      await page.goto("/signup");
      await waitForHydration(page);

      await page.getByLabel("Name").fill("Test User");
      await page.getByLabel("Email").fill("not-an-email");
      await page.getByLabel("Password").fill("Password1!");
      await page.getByRole("button", { name: /^sign up$/i }).click();

      await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
    });

    test("shows error for 7-character password", async ({ page }) => {
      await page.goto("/signup");
      await waitForHydration(page);

      await page.getByLabel("Name").fill("Test User");
      await page.getByLabel("Email").fill("valid@test.com");
      await page.getByLabel("Password").fill("abcdefg");
      await page.getByRole("button", { name: /^sign up$/i }).click();

      await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
    });
  });

  test.describe("search-param wiring", () => {
    test("pre-fills email from ?email= param", async ({ page }) => {
      await page.goto("/signup?email=foo%40example.com");

      await expect(page.getByLabel("Email")).toHaveValue("foo@example.com");
    });

    test("sign-in link preserves typed email and the redirect param", async ({ page }) => {
      await page.goto("/signup?redirect=%2Fcards");
      await waitForHydration(page);

      const typed = `typed-${Date.now()}@test.com`;
      await page.getByLabel("Email").fill(typed);

      // Scope to the body form link; the header "Sign in" doesn't carry params.
      const signInLink = page
        .getByText(/Already have an account/i)
        .getByRole("link", { name: /sign in/i });
      const href = await signInLink.getAttribute("href");
      expect(href).not.toBeNull();
      const linkUrl = new URL(href ?? "", WEB_BASE_URL);
      expect(linkUrl.pathname).toBe("/login");
      expect(linkUrl.searchParams.get("redirect")).toBe("/cards");
      expect(linkUrl.searchParams.get("email")).toBe(typed);
      expect(href).toContain("redirect=%2Fcards");
      expect(href).toContain(`email=${encodeURIComponent(typed)}`);
    });

    test("strips an unsafe redirect param from the sign-in link", async ({ page }) => {
      await page.goto("/signup?redirect=https%3A%2F%2Fevil.com");
      await waitForHydration(page);

      // Scope to the body form link; the header "Sign in" doesn't carry params.
      const signInLink = page
        .getByText(/Already have an account/i)
        .getByRole("link", { name: /sign in/i });
      const href = await signInLink.getAttribute("href");
      expect(href).not.toBeNull();
      expect(href).not.toContain("evil.com");
      const linkUrl = new URL(href ?? "", WEB_BASE_URL);
      expect(linkUrl.searchParams.get("redirect")).toBeNull();
    });
  });

  test.describe("happy path", () => {
    test("creates the user and redirects to /verify-email", async ({ page }) => {
      const email = `signup-happy-${Date.now()}@test.com`;
      const password = "SignupTestPassword1!";

      await page.goto("/signup");
      await waitForHydration(page);

      await page.getByLabel("Name").fill("Happy Path");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: /^sign up$/i }).click();

      await expect(page).toHaveURL(
        new RegExp(
          `/verify-email\\?email=${encodeURIComponent(email).replaceAll(".", String.raw`\.`)}`,
        ),
        { timeout: 15_000 },
      );

      const sql = loadDb();
      try {
        const rows = (await sql`SELECT email FROM users WHERE email = ${email}`) as {
          email: string;
        }[];
        expect(rows).toHaveLength(1);
      } finally {
        await sql.end();
      }
    });
  });

  test.describe("errors", () => {
    test("surfaces an error or resend-verification flow for an already-registered email", async ({
      page,
      request,
    }) => {
      const email = `signup-dupe-${Date.now()}@test.com`;
      const password = "SignupTestPassword1!";
      await signUpViaApi(request, email, password);

      await page.goto("/signup");
      await waitForHydration(page);

      await page.getByLabel("Name").fill("Duplicate User");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: /^sign up$/i }).click();

      // Better-auth's sign-up/email endpoint returns success for an
      // unverified duplicate (re-sends the OTP), so the UI navigates to
      // /verify-email. For a verified duplicate it returns USER_ALREADY_EXISTS
      // which surfaces as an inline error. Accept either outcome.
      await expect(async () => {
        const url = page.url();
        const hasError = await page
          .getByText(/already exists/i)
          .isVisible()
          .catch(() => false);
        if (hasError) {
          return;
        }
        if (/\/verify-email/.test(url)) {
          return;
        }
        throw new Error(`Expected duplicate-signup error or /verify-email, got ${url}`);
      }).toPass({ timeout: 10_000 });
    });
  });

  test.describe("loading state", () => {
    test("disables the button and shows 'Signing up...' while the request is in flight", async ({
      page,
    }) => {
      await page.route("**/api/auth/sign-up/email", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      });

      const email = `signup-loading-${Date.now()}@test.com`;
      await page.goto("/signup");
      await waitForHydration(page);

      await page.getByLabel("Name").fill("Loading User");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("SignupTestPassword1!");
      await page.getByRole("button", { name: /^sign up$/i }).click();

      const loadingButton = page.getByRole("button", { name: /signing up/i });
      await expect(loadingButton).toBeVisible();
      await expect(loadingButton).toBeDisabled();
    });
  });

  test.describe("head / seo", () => {
    test("sets title, description, and noindex meta", async ({ page }) => {
      await page.goto("/signup");

      await expect(page).toHaveTitle(/Sign Up/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        "Create a free OpenRift account to track your Riftbound card collection and build decks.",
        { timeout: 10_000 },
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/, {
        timeout: 10_000,
      });
    });
  });

  test.describe("authenticated user", () => {
    test("still sees the signup form instead of being redirected", async ({ browser, request }) => {
      const sql = loadDb();
      const email = `signup-authed-${Date.now()}@test.com`;
      const password = "SignupTestPassword1!";
      try {
        await signUpViaApi(request, email, password);
        await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
      } finally {
        await sql.end();
      }

      const context = await browser.newContext();
      try {
        const signInResponse = await context.request.post(
          `${API_BASE_URL}/api/auth/sign-in/email`,
          {
            headers: { Origin: WEB_BASE_URL },
            data: { email, password },
          },
        );
        expect(signInResponse.ok()).toBeTruthy();

        const page = await context.newPage();
        await page.goto("/signup");

        await expect(page).toHaveURL(/\/signup/);
        await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
        await expect(page.getByLabel("Name")).toBeVisible();
        await expect(page.getByLabel("Email")).toBeVisible();
        await expect(page.getByLabel("Password")).toBeVisible();
      } finally {
        await context.close();
      }
    });
  });
});
