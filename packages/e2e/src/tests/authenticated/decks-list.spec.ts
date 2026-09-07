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

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Decks List E2E" },
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
  const email = `decks-list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "DecksListE2ePassword1!";
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

async function apiCreateDeck(
  page: Page,
  name: string,
  format: "constructed" | "freeform" = "constructed",
): Promise<string> {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/decks`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name, format },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function deckExists(deckId: string): Promise<boolean> {
  const sql = loadDb();
  try {
    const rows = (await sql`SELECT 1 AS one FROM decks WHERE id = ${deckId}`) as { one: number }[];
    return rows.length > 0;
  } finally {
    await sql.end();
  }
}

// TanStack Start encodes each server fn id as base64url(JSON) with the source
// file + export name; decoding the segment lets us target a specific server fn
// without colliding with others that fire during the same route transition.
function isServerFn(url: string, fnName: string): boolean {
  const match = /\/_serverFn\/(?<encoded>[^/?#]+)/u.exec(url);
  const encoded = match?.groups?.encoded;
  if (encoded === undefined) {
    return false;
  }
  try {
    return Buffer.from(encoded, "base64url").toString("utf-8").includes(fnName);
  } catch {
    return false;
  }
}

// Valid UUID shape, guaranteed not to match any real deck.
const BOGUS_DECK_ID = "00000000-0000-0000-0000-0000000dead0";

test.describe("decks list", () => {
  test.describe("access", () => {
    // /decks and /decks/import are auth-optional: logged-out visitors see
    // their browser-local decks, so there's no login redirect.
    for (const path of ["/decks", "/decks/import"]) {
      test(`anonymous users can open ${path}`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", String.raw`\/`)}$`, "u"));
        await expect(page).not.toHaveURL(/\/login/u);
      });
    }

    test("redirects anonymous users from a specific deck to /login", async ({ page }) => {
      await page.goto(`/decks/${BOGUS_DECK_ID}`);
      await expect(page).toHaveURL(/\/login\b/u);
      const url = new URL(page.url());
      expect(url.searchParams.get("redirect") ?? "").toContain(`/decks/${BOGUS_DECK_ID}`);
    });
  });

  test.describe("SEO", () => {
    test("sets title and noindex robots meta on /decks", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/decks");
      await expect(page).toHaveTitle(/Decks/u, { timeout: 15_000 });
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute("content", /noindex/u);
    });
  });

  test.describe("empty state", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("fresh user sees the empty-state hint and CTA", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/decks");

      await expect(page.getByText("No decks yet")).toBeVisible({ timeout: 15_000 });
      const createFirst = page.getByRole("button", { name: "Create your first deck" });
      await expect(createFirst).toBeVisible();
    });

    test("clicking the empty-state CTA opens the create dialog", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/decks");

      await page.getByRole("button", { name: "Create your first deck" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "New deck" })).toBeVisible();
      await expect(dialog.getByLabel("Name")).toBeVisible();
      await expect(dialog.getByLabel("Format")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Create" })).toBeVisible();
    });
  });

  test.describe("top bar actions", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("shows the Decks title", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/decks");
      await expect(page.getByText("Decks").first()).toBeVisible({ timeout: 15_000 });
    });

    test("Import navigates to /decks/import", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/decks");

      // The top-bar Import control is a PageTopBarButton rendered as a Link
      // (role=button), so match the underlying anchor by href.
      const importLink = page.locator('a[href="/decks/import"]').first();
      await expect(importLink).toBeVisible({ timeout: 15_000 });

      await importLink.click();
      await expect(page).toHaveURL(/\/decks\/import$/u, { timeout: 15_000 });
    });

    test("New Deck button opens the create dialog", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/decks");

      await page.getByRole("button", { name: "New Deck" }).click();
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: "New deck" }),
      ).toBeVisible();
    });
  });

  test.describe("create deck", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("defaults, validation, and format selection", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/decks");

      await page.getByRole("button", { name: "New Deck" }).click();
      const dialog = page.getByRole("dialog");

      const nameInput = dialog.getByLabel("Name");
      await expect(nameInput).toHaveValue("New Deck");
      await expect(nameInput).toBeFocused();

      const formatTrigger = dialog.getByLabel("Format");
      await expect(formatTrigger).toHaveText(/Constructed/u);

      await formatTrigger.click();
      await expect(page.getByRole("option", { name: "Constructed" })).toBeVisible();
      await expect(page.getByRole("option", { name: "Freeform" })).toBeVisible();
      // Re-pick Constructed so the default is unchanged for the next assertion.
      await page.getByRole("option", { name: "Constructed" }).click();

      const createButton = dialog.getByRole("button", { name: "Create" });
      await nameInput.fill("");
      await expect(createButton).toBeDisabled();
      await nameInput.fill("New Deck");
      await expect(createButton).toBeEnabled();
    });

    test("submits with defaults, navigates to /decks/<id>, closes the dialog", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/decks");

      await page.getByRole("button", { name: "New Deck" }).click();
      const dialog = page.getByRole("dialog");

      const createRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "createDeckFn"),
      );
      await dialog.getByRole("button", { name: "Create" }).click();
      await createRequest;

      await expect(page).toHaveURL(/\/decks\/[0-9a-f-]+$/u, { timeout: 15_000 });
      await expect(dialog).toBeHidden();
    });

    test("creates a second deck with Freeform and both appear on /decks", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/decks");

      await page.getByRole("button", { name: "New Deck" }).click();
      let createDialog = page.getByRole("dialog");
      await createDialog.getByLabel("Name").fill("Constructed Starter");
      const firstRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "createDeckFn"),
      );
      await createDialog.getByRole("button", { name: "Create" }).click();
      await firstRequest;
      await expect(page).toHaveURL(/\/decks\/[0-9a-f-]+$/u, { timeout: 15_000 });

      await page.goto("/decks");
      await page.getByRole("button", { name: "New Deck" }).click();
      createDialog = page.getByRole("dialog");
      await createDialog.getByLabel("Name").fill("Freeform Brew");
      await createDialog.getByLabel("Format").click();
      await page.getByRole("option", { name: "Freeform" }).click();

      const secondRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "createDeckFn"),
      );
      await createDialog.getByRole("button", { name: "Create" }).click();
      await secondRequest;
      await expect(page).toHaveURL(/\/decks\/[0-9a-f-]+$/u, { timeout: 15_000 });

      await page.goto("/decks");
      await expect(
        page.getByRole("heading", { level: 3, name: "Constructed Starter" }),
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("heading", { level: 3, name: "Freeform Brew" })).toBeVisible();
    });
  });

  test.describe("tile rendering", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("shows name, format badge, and a menu trigger", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckName = `Tile Render ${Date.now()}`;
      const deckId = await apiCreateDeck(page, deckName, "freeform");

      await page.goto("/decks");

      // The tile is not the anchor: the name link stretches over it, so the
      // heading and the menu are siblings of the link, not its children.
      const deckLink = page.locator(`a[href="/decks/${deckId}"]`);
      await expect(deckLink).toBeVisible({ timeout: 15_000 });

      await expect(page.getByRole("heading", { level: 3, name: deckName })).toBeVisible();
      // The card count rides on the format badge; an empty deck shows the bare
      // format with no figure, so there is no "0 cards" text.
      await expect(page.getByText("Freeform")).toBeVisible();
      await expect(page.getByText(/\d+ cards/u)).toHaveCount(0);

      await expect(page.getByRole("button", { name: "Deck actions" })).toBeVisible();
    });

    test("clicking the tile navigates to /decks/<id>", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckName = `Tile Nav ${Date.now()}`;
      const deckId = await apiCreateDeck(page, deckName);

      await page.goto("/decks");
      const deckLink = page.locator(`a[href="/decks/${deckId}"]`);
      await expect(deckLink).toBeVisible({ timeout: 15_000 });

      await deckLink.click();
      await expect(page).toHaveURL(new RegExp(`/decks/${deckId}$`, "u"), { timeout: 15_000 });
    });
  });

  test.describe("rename from tile", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("dialog opens with the current name pre-filled", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckName = `Rename Open ${Date.now()}`;
      const deckId = await apiCreateDeck(page, deckName);

      await page.goto("/decks");
      const deckLink = page.locator(`a[href="/decks/${deckId}"]`);
      await expect(deckLink).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Deck actions" }).click();
      await page.getByRole("menuitem", { name: "Rename" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Rename deck" })).toBeVisible();
      const input = dialog.getByRole("textbox");
      await expect(input).toHaveValue(deckName);
    });

    test("clearing the name disables the Rename button", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckName = `Rename Validate ${Date.now()}`;
      const deckId = await apiCreateDeck(page, deckName);

      await page.goto("/decks");
      const deckLink = page.locator(`a[href="/decks/${deckId}"]`);
      await expect(deckLink).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Deck actions" }).click();
      await page.getByRole("menuitem", { name: "Rename" }).click();

      const dialog = page.getByRole("dialog");
      const input = dialog.getByRole("textbox");
      // "Rename" is the menu item that opens the dialog; its confirm button is "Save".
      const renameButton = dialog.getByRole("button", { name: "Save" });

      await input.fill("");
      await expect(renameButton).toBeDisabled();
      await input.fill("something");
      await expect(renameButton).toBeEnabled();
    });

    test("submitting a new name updates the tile", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckName = `Rename Submit ${Date.now()}`;
      const nextName = `${deckName} renamed`;
      const deckId = await apiCreateDeck(page, deckName);

      await page.goto("/decks");
      const deckLink = page.locator(`a[href="/decks/${deckId}"]`);
      await expect(deckLink).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Deck actions" }).click();
      await page.getByRole("menuitem", { name: "Rename" }).click();

      const dialog = page.getByRole("dialog");
      const input = dialog.getByRole("textbox");
      await input.fill(nextName);

      const updateRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "updateDeckFn"),
      );
      await dialog.getByRole("button", { name: "Save" }).click();
      await updateRequest;

      await expect(dialog).toBeHidden();
      await expect(page.getByRole("heading", { level: 3, name: nextName })).toBeVisible();
    });
  });

  test.describe("delete from tile", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("confirmation dialog shows destructive copy with the deck name", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckName = `Delete Copy ${Date.now()}`;
      const deckId = await apiCreateDeck(page, deckName);

      await page.goto("/decks");
      const deckLink = page.locator(`a[href="/decks/${deckId}"]`);
      await expect(deckLink).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Deck actions" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      const alert = page.getByRole("alertdialog");
      await expect(alert.getByRole("heading", { name: "Delete deck" })).toBeVisible();
      await expect(alert.getByText(new RegExp(`Delete .${deckName}.\\?`, "u"))).toBeVisible();
      await expect(alert.getByText(/cannot be undone/iu)).toBeVisible();
    });

    test("Cancel leaves the deck in place", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const deckName = `Delete Cancel ${Date.now()}`;
      const deckId = await apiCreateDeck(page, deckName);

      await page.goto("/decks");
      const deckLink = page.locator(`a[href="/decks/${deckId}"]`);
      await expect(deckLink).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Deck actions" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      const alert = page.getByRole("alertdialog");
      await alert.getByRole("button", { name: "Cancel" }).click();
      await expect(alert).toBeHidden();
      await expect(deckLink).toBeVisible();
      expect(await deckExists(deckId)).toBe(true);
    });

    test("confirming removes the tile, deletes the row, and returns to empty state", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      const deckName = `Delete Confirm ${Date.now()}`;
      const deckId = await apiCreateDeck(page, deckName);

      await page.goto("/decks");
      const deckLink = page.locator(`a[href="/decks/${deckId}"]`);
      await expect(deckLink).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Deck actions" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      const alert = page.getByRole("alertdialog");
      const deleteRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "deleteDeckFn"),
      );
      await alert.getByRole("button", { name: "Delete" }).click();
      await deleteRequest;

      await expect(deckLink).toHaveCount(0, { timeout: 15_000 });
      expect(await deckExists(deckId)).toBe(false);

      await expect(page.getByText("No decks yet")).toBeVisible();
      await expect(page.getByRole("button", { name: "Create your first deck" })).toBeVisible();
    });
  });
});
