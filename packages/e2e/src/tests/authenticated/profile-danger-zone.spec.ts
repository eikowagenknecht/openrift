import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function createVerifiedUser(
  request: APIRequestContext,
  sql: Sql,
  email: string,
  password: string,
) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Danger Zone E2E" },
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
  await page.getByRole("button", { name: /login/iu }).click();
  await expect(page).not.toHaveURL(/\/login/u, { timeout: 15_000 });
}

async function setupUser(
  request: APIRequestContext,
  slug: string,
): Promise<{ email: string; password: string }> {
  const sql = loadDb();
  const email = `danger-zone-${slug}-${Date.now()}@test.com`;
  const password = "DangerZoneTestPassword1!";
  try {
    await createVerifiedUser(request, sql, email, password);
  } finally {
    await sql.end();
  }
  return { email, password };
}

async function openDialog(page: Page) {
  await expect(page.getByRole("heading", { name: "Danger Zone", level: 2 })).toBeVisible({
    timeout: 15_000,
  });
  // The component tree remounts when useSession() resolves, detaching the
  // trigger; poll the click+visibility check until it sticks.
  await expect(async () => {
    // The "Delete account" trigger is unique on the profile page.
    const trigger = page.getByRole("button", { name: "Delete account", exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  return page.getByRole("alertdialog");
}

const DELETE_USER_PATH = "/api/auth/delete-user";

test.describe("profile danger zone", () => {
  test.describe("rendering", () => {
    test("shows the Danger Zone card with destructive trigger", async ({ page, request }) => {
      const { email, password } = await setupUser(request, "render-card");
      await loginViaForm(page, email, password);
      await page.goto("/profile");

      const heading = page.getByRole("heading", { name: "Danger Zone", level: 2 });
      await expect(heading).toBeVisible({ timeout: 15_000 });

      // CardTitle is a div, so the "Danger Zone" h2 sits outside the card and
      // can't anchor it; scope via the unique "Delete account" button instead.
      const section = page.locator('[data-slot="card"]').filter({
        has: page.getByRole("button", { name: "Delete account", exact: true }),
      });
      await expect(
        section.getByText(/Permanently deletes your account and everything in it\./u),
      ).toBeVisible();
      await expect(
        section.getByRole("button", { name: "Delete account", exact: true }),
      ).toBeVisible();
    });

    test("card region uses destructive styling via border class", async ({ page, request }) => {
      const { email, password } = await setupUser(request, "render-border");
      await loginViaForm(page, email, password);
      await page.goto("/profile");

      const heading = page.getByRole("heading", { name: "Danger Zone", level: 2 });
      await expect(heading).toBeVisible({ timeout: 15_000 });
      await heading.scrollIntoViewIfNeeded();

      // Class tokens are the only user-visible signal for the destructive styling.
      const card = page.locator('[data-slot="card"]').filter({
        has: page.getByRole("button", { name: "Delete account", exact: true }),
      });
      await expect(card).toHaveClass(/border-destructive/u);
    });
  });

  test.describe("dialog open/close", () => {
    test("opens with title, description, password field, and buttons", async ({
      page,
      request,
    }) => {
      const { email, password } = await setupUser(request, "dialog-open");
      await loginViaForm(page, email, password);
      await page.goto("/profile");

      const dialog = await openDialog(page);
      await expect(dialog.getByRole("heading", { name: "Delete your account?" })).toBeVisible();
      await expect(dialog.getByText(/permanently delete/iu)).toBeVisible();
      await expect(dialog.getByPlaceholder("Your password")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Delete account", exact: true }),
      ).toBeVisible();
    });

    test("Cancel closes the dialog without firing a network request", async ({ page, request }) => {
      const { email, password } = await setupUser(request, "dialog-cancel");
      await loginViaForm(page, email, password);
      await page.goto("/profile");

      const dialog = await openDialog(page);

      let deleteRequestFired = false;
      const onRequest = (req: { url: () => string }) => {
        if (req.url().includes(DELETE_USER_PATH)) {
          deleteRequestFired = true;
        }
      };
      page.on("request", onRequest);

      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden();

      // Give any stray request a chance to settle before asserting.
      await page.waitForTimeout(500);
      page.off("request", onRequest);
      expect(deleteRequestFired).toBe(false);
    });

    test("password field resets when the dialog is reopened", async ({ page, request }) => {
      const { email, password } = await setupUser(request, "dialog-reset");
      await loginViaForm(page, email, password);
      await page.goto("/profile");

      const dialog = await openDialog(page);
      const passwordInput = dialog.getByPlaceholder("Your password");
      await passwordInput.fill("SomeValueThatShouldBeCleared");
      await expect(passwordInput).toHaveValue("SomeValueThatShouldBeCleared");

      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toBeHidden();

      const reopened = await openDialog(page);
      await expect(reopened.getByPlaceholder("Your password")).toHaveValue("");
    });
  });

  test.describe("validation", () => {
    test("empty password shows inline error and skips the request", async ({ page, request }) => {
      const { email, password } = await setupUser(request, "validation-empty");
      await loginViaForm(page, email, password);
      await page.goto("/profile");

      const dialog = await openDialog(page);

      let deleteRequestFired = false;
      const onRequest = (req: { url: () => string }) => {
        if (req.url().includes(DELETE_USER_PATH)) {
          deleteRequestFired = true;
        }
      };
      page.on("request", onRequest);

      await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
      await expect(dialog.getByText("Password is required.")).toBeVisible();

      await page.waitForTimeout(500);
      page.off("request", onRequest);
      expect(deleteRequestFired).toBe(false);
    });
  });

  test.describe("wrong password", () => {
    test("surfaces an inline error and keeps the user row intact", async ({ page, request }) => {
      const { email, password } = await setupUser(request, "wrong-password");
      await loginViaForm(page, email, password);
      await page.goto("/profile");

      const dialog = await openDialog(page);
      await dialog.getByPlaceholder("Your password").fill("wrong-password-value");

      const deleteRequest = page.waitForRequest(
        (req) => req.method() === "POST" && req.url().includes(DELETE_USER_PATH),
      );
      await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
      await deleteRequest;

      // Error styling is driven by aria-invalid on the password input.
      const passwordInput = dialog.getByPlaceholder("Your password");
      await expect(passwordInput).toHaveAttribute("aria-invalid", "true", { timeout: 10_000 });

      const sql = loadDb();
      try {
        const rows = await sql<{ count: string }[]>`
          SELECT COUNT(*)::text AS count FROM users WHERE email = ${email}
        `;
        expect(rows[0]?.count).toBe("1");
      } finally {
        await sql.end();
      }

      await expect(dialog).toBeVisible();

      expect(new URL(page.url()).pathname).toBe("/profile");
    });
  });

  test.describe("happy path", () => {
    test("deletes the account, clears session, and redirects home", async ({ page, request }) => {
      const { email, password } = await setupUser(request, "happy");
      await loginViaForm(page, email, password);

      const sql = loadDb();
      let foundUserId: string | undefined;
      try {
        const rows = await sql<{ id: string }[]>`
          SELECT id FROM users WHERE email = ${email}
        `;
        foundUserId = rows[0]?.id;
      } finally {
        await sql.end();
      }
      if (foundUserId === undefined) {
        throw new Error(`no user row for ${email}`);
      }
      const userId = foundUserId;

      await page.goto("/profile");

      const dialog = await openDialog(page);
      await dialog.getByPlaceholder("Your password").fill(password);

      const deleteRequest = page.waitForRequest(
        (req) => req.method() === "POST" && req.url().includes(DELETE_USER_PATH),
      );
      await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
      await deleteRequest;

      // The authenticated-home guard on "/" can still see the just-invalidated
      // session and forward to /cards before it clears; accept either landing.
      await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/(?:cards\b.*)?$/u, {
        timeout: 15_000,
      });

      await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

      const verifySql = loadDb();
      try {
        const userRows = await verifySql<{ count: string }[]>`
          SELECT COUNT(*)::text AS count FROM users WHERE email = ${email}
        `;
        expect(userRows[0]?.count).toBe("0");

        const collectionRows = await verifySql<{ count: string }[]>`
          SELECT COUNT(*)::text AS count FROM collections WHERE user_id = ${userId}
        `;
        expect(collectionRows[0]?.count).toBe("0");

        // copies has no user_id column; scope by the deleted user's collections.
        const copyRows = await verifySql<{ count: string }[]>`
          SELECT COUNT(*)::text AS count FROM copies
          WHERE collection_id IN (SELECT id FROM collections WHERE user_id = ${userId})
        `;
        expect(copyRows[0]?.count).toBe("0");
      } finally {
        await verifySql.end();
      }

      await page.goto("/login");
      await page.locator("form").first().waitFor({ state: "attached" });
      // SSR renders the form before React attaches event handlers.
      await page.waitForFunction(
        () => {
          const formEl = document.querySelector("form");
          return formEl !== null && Object.keys(formEl).some((key) => key.startsWith("__react"));
        },
        { timeout: 10_000 },
      );
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: /login/iu }).click();
      await expect(page.getByText(/invalid email or password/iu)).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe("loading state", () => {
    test("confirm button reads Deleting... and stays disabled during flight", async ({
      page,
      request,
    }) => {
      const { email, password } = await setupUser(request, "loading");
      await loginViaForm(page, email, password);
      await page.goto("/profile");

      // Route must be installed before the dialog fires the request.
      await page.route(`**${DELETE_USER_PATH}`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      });

      const dialog = await openDialog(page);
      await dialog.getByPlaceholder("Your password").fill(password);

      const confirmButton = dialog.getByRole("button", { name: /delete account|deleting/iu });
      await confirmButton.click();

      await expect(confirmButton).toHaveText("Deleting...", { timeout: 5000 });
      await expect(confirmButton).toBeDisabled();
      await expect(dialog).toBeVisible();

      // The authenticated-home guard on "/" can still see the just-invalidated
      // session and forward to /cards before it clears; accept either landing.
      await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/(?:cards\b.*)?$/u, {
        timeout: 15_000,
      });
    });
  });
});
