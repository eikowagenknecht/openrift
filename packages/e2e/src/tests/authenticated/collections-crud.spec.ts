import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Collections CRUD E2E" },
  });
  expect(response.ok()).toBeTruthy();
}

async function signIn(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
}

async function createAndLogin(page: Page): Promise<string> {
  const sql = loadDb();
  const email = `collections-crud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "CollectionsE2ePassword1!";
  try {
    await signUp(page.request, email, password);
    await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
  } finally {
    await sql.end();
  }
  await signIn(page.request, email, password);
  return email;
}

async function deleteUser(email: string) {
  const sql = loadDb();
  try {
    await sql`DELETE FROM users WHERE email = ${email}`;
  } finally {
    await sql.end();
  }
}

async function apiCreateCollection(page: Page, name: string): Promise<string> {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/collections`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function getInboxId(email: string): Promise<string> {
  const sql = loadDb();
  try {
    const rows = (await sql`
      SELECT c.id
      FROM collections c
      JOIN users u ON u.id = c.user_id
      WHERE u.email = ${email} AND c.is_inbox = true
      LIMIT 1
    `) as { id: string }[];
    expect(rows.length).toBe(1);
    return rows[0].id;
  } finally {
    await sql.end();
  }
}

async function seedCopiesInCollection(
  email: string,
  collectionId: string,
  count: number,
): Promise<void> {
  const sql = loadDb();
  try {
    await sql`
      INSERT INTO copies (user_id, collection_id, printing_id)
      SELECT u.id, ${collectionId}::uuid, p.id
      FROM users u
      CROSS JOIN LATERAL (SELECT id FROM printings ORDER BY id LIMIT ${count}) p
      WHERE u.email = ${email}
    `;
  } finally {
    await sql.end();
  }
}

async function countCopiesInCollection(collectionId: string): Promise<number> {
  const sql = loadDb();
  try {
    const rows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM copies
      WHERE collection_id = ${collectionId}
    `) as { count: number }[];
    return rows[0].count;
  } finally {
    await sql.end();
  }
}

// TanStack Start encodes the server fn id as base64url(JSON) referencing the
// source file + export name; matching on the decoded payload lets us target a
// single server fn out of the bundle that fires during a route transition.
function isServerFn(url: string, fnName: string): boolean {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) {
    return false;
  }
  try {
    return Buffer.from(match[1], "base64url").toString("utf-8").includes(fnName);
  } catch {
    return false;
  }
}

test.describe("collections CRUD", () => {
  let userEmail: string | undefined;

  test.afterEach(async () => {
    if (userEmail) {
      await deleteUser(userEmail);
      userEmail = undefined;
    }
  });

  test.describe("create", () => {
    test("creates a collection, appears in sidebar, navigates to it", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections");
      await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "New collection" }).click();

      const input = page.getByPlaceholder("Collection name");
      await expect(input).toBeFocused();

      const name = `E2E Create ${Date.now()}`;
      await input.fill(name);

      const createRequest = page.waitForRequest(
        (req) => req.method() === "POST" && isServerFn(req.url(), "createCollectionFn"),
      );
      await input.press("Enter");
      await createRequest;

      const sidebarLink = page.getByRole("link", { name });
      await expect(sidebarLink).toBeVisible();
      await sidebarLink.click();

      await expect(page).toHaveURL(/\/collections\/[0-9a-f-]+/);
      // Desktop top bar renders the collection name as the page title.
      await expect(page.getByText(name).first()).toBeVisible();
    });

    test("whitespace-only input does not create a collection", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections");
      await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });

      let serverFnFired = false;
      page.on("request", (req) => {
        if (req.method() === "POST" && isServerFn(req.url(), "createCollectionFn")) {
          serverFnFired = true;
        }
      });

      await page.getByRole("button", { name: "New collection" }).click();
      const input = page.getByPlaceholder("Collection name");
      await input.fill("   ");
      await input.press("Enter");

      // Give the event loop a beat to fire any request that would have gone out.
      await page.waitForTimeout(500);

      expect(serverFnFired).toBe(false);
      // Input is still open (handleCreate returns without flipping isCreating).
      await expect(input).toBeVisible();
    });

    test("blur with empty input cancels and restores the button", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections");
      await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });

      const newCollectionButton = page.getByRole("button", { name: "New collection" });
      await newCollectionButton.click();

      const input = page.getByPlaceholder("Collection name");
      await expect(input).toBeFocused();

      // Blur without typing — onBlur resets isCreating because the value is empty.
      await input.evaluate((el: HTMLInputElement) => el.blur());

      await expect(input).toHaveCount(0);
      await expect(newCollectionButton).toBeVisible();
    });

    test("blur with typed text keeps the input open", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections");
      await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "New collection" }).click();
      const input = page.getByPlaceholder("Collection name");
      await input.fill("Pending name");

      // onBlur only closes when the trimmed value is empty; typed text keeps it open.
      await input.evaluate((el: HTMLInputElement) => el.blur());

      await expect(input).toBeVisible();
      await expect(input).toHaveValue("Pending name");
      await expect(page.getByRole("button", { name: "New collection" })).toHaveCount(0);
    });
  });

  test.describe("delete", () => {
    test("opens the dialog and cancel keeps the collection", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const name = `E2E Delete Cancel ${Date.now()}`;
      const collectionId = await apiCreateCollection(page, name);

      await page.goto(`/collections/${collectionId}`);
      await expect(page.getByRole("link", { name })).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Delete collection" }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByText("Delete collection")).toBeVisible();
      await expect(dialog.getByText(new RegExp(name))).toBeVisible();
      await expect(dialog.getByText("This collection is empty.")).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("link", { name })).toBeVisible();
    });

    test("confirm deletes the collection, redirects to /collections", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const name = `E2E Delete Confirm ${Date.now()}`;
      const collectionId = await apiCreateCollection(page, name);

      await page.goto(`/collections/${collectionId}`);
      await expect(page.getByRole("link", { name })).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Delete collection" }).click();

      const dialog = page.getByRole("alertdialog");
      const deleteRequest = page.waitForRequest(
        (req) => req.method() === "POST" && isServerFn(req.url(), "deleteCollectionFn"),
      );
      await dialog.getByRole("button", { name: "Delete" }).click();
      await deleteRequest;

      await expect(page).toHaveURL(/\/collections\/?$/, { timeout: 15_000 });
      await expect(page.getByRole("link", { name })).toHaveCount(0);
    });

    test("non-empty delete moves copies to Inbox", async ({ page }) => {
      const email = await createAndLogin(page);
      userEmail = email;
      const name = `E2E Delete NonEmpty ${Date.now()}`;
      const collectionId = await apiCreateCollection(page, name);
      await seedCopiesInCollection(email, collectionId, 2);
      const inboxId = await getInboxId(email);

      await page.goto(`/collections/${collectionId}`);
      await expect(page.getByRole("link", { name })).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Delete collection" }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(
        dialog.getByText(/The 2 cards in this collection will be moved to your Inbox\./),
      ).toBeVisible();

      const deleteRequest = page.waitForRequest(
        (req) => req.method() === "POST" && isServerFn(req.url(), "deleteCollectionFn"),
      );
      await dialog.getByRole("button", { name: "Delete" }).click();
      await deleteRequest;

      await expect(page).toHaveURL(/\/collections\/?$/, { timeout: 15_000 });

      await expect.poll(() => countCopiesInCollection(inboxId), { timeout: 10_000 }).toBe(2);
      expect(await countCopiesInCollection(collectionId)).toBe(0);
    });

    test("Delete button shows loading state during flight", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const name = `E2E Delete Loading ${Date.now()}`;
      const collectionId = await apiCreateCollection(page, name);

      await page.goto(`/collections/${collectionId}`);
      await expect(page.getByRole("link", { name })).toBeVisible({ timeout: 15_000 });

      await page.route("**/_serverFn/**", async (route) => {
        if (isServerFn(route.request().url(), "deleteCollectionFn")) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        await route.continue();
      });

      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("menuitem", { name: "Delete collection" }).click();

      const dialog = page.getByRole("alertdialog");
      await dialog.getByRole("button", { name: "Delete" }).click();

      const deletingButton = dialog.getByRole("button", { name: "Deleting..." });
      await expect(deletingButton).toBeVisible();
      await expect(deletingButton).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();

      await expect(page).toHaveURL(/\/collections\/?$/, { timeout: 15_000 });
    });
  });

  test.describe("inbox is undeletable", () => {
    test("the delete trigger is not rendered on the Inbox", async ({ page }) => {
      const email = await createAndLogin(page);
      userEmail = email;
      const inboxId = await getInboxId(email);

      await page.goto(`/collections/${inboxId}`);
      await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });

      // canDeleteCollection is false on the Inbox, so the kebab menu (which is the
      // only trigger whose accessible name is "More" on this page) is absent.
      await expect(page.getByRole("button", { name: "More" })).toHaveCount(0);
    });
  });
});
