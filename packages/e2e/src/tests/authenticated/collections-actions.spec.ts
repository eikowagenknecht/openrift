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
    data: { email, password, name: "Collection Actions E2E" },
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
  const email = `coll-actions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "CollActionsE2ePassword1!";
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

async function findInboxId(email: string): Promise<string> {
  const sql = loadDb();
  try {
    const rows = (await sql`
      SELECT c.id
      FROM collections c
      JOIN users u ON u.id = c.user_id
      WHERE u.email = ${email} AND c.is_inbox = true
      LIMIT 1
    `) as { id: string }[];
    if (rows.length === 0) {
      throw new Error(`No inbox for ${email}`);
    }
    return rows[0].id;
  } finally {
    await sql.end();
  }
}

async function findPrintingIdForCard(cardName: string): Promise<string> {
  const sql = loadDb();
  try {
    const rows = (await sql`
      SELECT p.id
      FROM printings p
      JOIN cards c ON c.id = p.card_id
      WHERE c.name = ${cardName}
      ORDER BY p.id
      LIMIT 1
    `) as { id: string }[];
    if (rows.length === 0) {
      throw new Error(`No printing for card ${cardName}`);
    }
    return rows[0].id;
  } finally {
    await sql.end();
  }
}

async function seedCopies(
  request: APIRequestContext,
  printingId: string,
  collectionId: string,
  count: number,
) {
  const copies = Array.from({ length: count }, () => ({ printingId, collectionId }));
  const response = await request.post(`${API_BASE_URL}/api/v1/copies`, {
    headers: { Origin: WEB_BASE_URL },
    data: { copies },
  });
  expect(response.ok()).toBeTruthy();
}

async function createCollectionViaApi(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/v1/collections`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

// TanStack Start encodes the server fn id as base64url(JSON) referencing the
// source file + exported const name. Decoding lets us single out the move or
// dispose mutation without matching the unrelated session/feature-flag/etc.
// server fns that fire on the same page.
function isServerFn(constName: string) {
  return (url: string) => {
    const match = url.match(/\/_serverFn\/([^/?#]+)/);
    if (!match) {
      return false;
    }
    try {
      return Buffer.from(match[1], "base64url").toString("utf-8").includes(constName);
    } catch {
      return false;
    }
  };
}

async function enterSelectMode(page: Page) {
  // The desktop "Select …" top-bar button has a visible text label; its mobile
  // icon-only twin has no accessible name, so role+name picks it unambiguously.
  await page.getByRole("button", { name: /^Select (cards|printings|copies)$/ }).click();
}

async function waitForCollectionReady(page: Page) {
  // The "Select cards" button renders as soon as the top-bar hydrates on a
  // collection page — a reliable readiness signal that doesn't depend on any
  // specific card being seeded.
  await expect(page.getByRole("button", { name: /^Select (cards|printings|copies)$/ })).toBeVisible(
    { timeout: 15_000 },
  );
}

const ANNIE_FIERY = "Annie, Fiery";
const ANNIE_STUBBORN = "Annie, Stubborn";

test.describe("collection actions", () => {
  test.describe("selection", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("toggles, adds to, and clears the selection via the floating bar", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const inboxId = await findInboxId(userEmail);
      const [annie, stubborn] = await Promise.all([
        findPrintingIdForCard(ANNIE_FIERY),
        findPrintingIdForCard(ANNIE_STUBBORN),
      ]);
      await seedCopies(page.request, annie, inboxId, 1);
      await seedCopies(page.request, stubborn, inboxId, 1);

      await page.goto(`/collections/${inboxId}`);
      await waitForCollectionReady(page);

      // Default view is "cards" so each seeded card is its own tile.
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible({ timeout: 10_000 });

      await enterSelectMode(page);

      const checkboxes = page.getByRole("button", { name: /select card/i });
      await expect(checkboxes).toHaveCount(2);

      // Select first → floating bar shows 1 selected.
      await checkboxes.nth(0).click();
      await expect(page.getByText("1 selected")).toBeVisible();

      // Second tile → 2 selected.
      await checkboxes.nth(1).click();
      await expect(page.getByText("2 selected")).toBeVisible();

      // Clicking the same tile again deselects → 1 selected.
      await checkboxes.nth(1).click();
      await expect(page.getByText("1 selected")).toBeVisible();

      // Clear button (aria-label "Clear selection") hides the bar.
      await page.getByRole("button", { name: /clear selection/i }).click();
      await expect(page.getByText(/\d+ selected/)).toBeHidden();
    });
  });

  test.describe("move", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("moves selected copies into another collection", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const inboxId = await findInboxId(userEmail);
      const targetId = await createCollectionViaApi(page.request, "Target");
      const annie = await findPrintingIdForCard(ANNIE_FIERY);
      await seedCopies(page.request, annie, inboxId, 2);

      await page.goto(`/collections/${inboxId}`);
      await waitForCollectionReady(page);
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible({ timeout: 10_000 });

      await enterSelectMode(page);
      await page
        .getByRole("button", { name: /select card/i })
        .first()
        .click();
      await expect(page.getByText("2 selected")).toBeVisible();

      await page.getByRole("button", { name: /^Move$/ }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Move to collection")).toBeVisible();

      // Source inbox is filtered out (collections.filter(c.id !== collectionId));
      // only "Target" is listed here.
      await expect(dialog.getByRole("button", { name: "Target" })).toBeVisible();

      const movePromise = page.waitForRequest((request) =>
        isServerFn("moveCopiesFn")(request.url()),
      );
      await dialog.getByRole("button", { name: "Target" }).click();
      await dialog.getByRole("button", { name: /^Move$/ }).click();
      await movePromise;

      await expect(dialog).toBeHidden();
      await expect(page.getByText(/Moved 2 cards?/)).toBeVisible({ timeout: 10_000 });

      // Source grid no longer shows the card; Target grid does.
      await page.goto(`/collections/${inboxId}`);
      await waitForCollectionReady(page);
      await expect(page.getByText(ANNIE_FIERY)).toHaveCount(0);

      await page.goto(`/collections/${targetId}`);
      await waitForCollectionReady(page);
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible({ timeout: 10_000 });
    });

    test("shows 'No other collections available' when the user has only an Inbox", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      const inboxId = await findInboxId(userEmail);
      const annie = await findPrintingIdForCard(ANNIE_FIERY);
      await seedCopies(page.request, annie, inboxId, 1);

      await page.goto(`/collections/${inboxId}`);
      await waitForCollectionReady(page);
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible({ timeout: 10_000 });

      await enterSelectMode(page);
      await page
        .getByRole("button", { name: /select card/i })
        .first()
        .click();
      await page.getByRole("button", { name: /^Move$/ }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByText("No other collections available.")).toBeVisible();
      await expect(dialog.getByRole("button", { name: /^Move$/ })).toBeDisabled();
    });

    test("move button shows 'Moving…' and is disabled while the request is in flight", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      const inboxId = await findInboxId(userEmail);
      await createCollectionViaApi(page.request, "Target");
      const annie = await findPrintingIdForCard(ANNIE_FIERY);
      await seedCopies(page.request, annie, inboxId, 1);

      // Delay the move server fn so the pending state is observable.
      await page.route("**/_serverFn/**", async (route) => {
        if (isServerFn("moveCopiesFn")(route.request().url())) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        await route.continue();
      });

      await page.goto(`/collections/${inboxId}`);
      await waitForCollectionReady(page);
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible({ timeout: 10_000 });

      await enterSelectMode(page);
      await page
        .getByRole("button", { name: /select card/i })
        .first()
        .click();
      await page.getByRole("button", { name: /^Move$/ }).click();

      const dialog = page.getByRole("alertdialog");
      await dialog.getByRole("button", { name: "Target" }).click();
      await dialog.getByRole("button", { name: /^Move$/ }).click();

      const moving = dialog.getByRole("button", { name: /^Moving…$/ });
      await expect(moving).toBeVisible();
      await expect(moving).toBeDisabled();
    });
  });

  test.describe("dispose", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("cancelling leaves the grid unchanged", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const inboxId = await findInboxId(userEmail);
      const annie = await findPrintingIdForCard(ANNIE_FIERY);
      await seedCopies(page.request, annie, inboxId, 3);

      await page.goto(`/collections/${inboxId}`);
      await waitForCollectionReady(page);
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible({ timeout: 10_000 });

      await enterSelectMode(page);
      await page
        .getByRole("button", { name: /select card/i })
        .first()
        .click();
      await expect(page.getByText("3 selected")).toBeVisible();

      await page.getByRole("button", { name: /^Dispose$/ }).click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByText("Remove cards from collection")).toBeVisible();

      await dialog.getByRole("button", { name: /^Cancel$/ }).click();
      await expect(dialog).toBeHidden();

      // Still 3 selected, still visible.
      await expect(page.getByText("3 selected")).toBeVisible();
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible();
    });

    test("confirming removes the copies and records a collection event", async ({ page }) => {
      const email = await createAndLogin(page);
      userEmail = email;
      const inboxId = await findInboxId(email);
      const annie = await findPrintingIdForCard(ANNIE_FIERY);
      await seedCopies(page.request, annie, inboxId, 3);

      await page.goto(`/collections/${inboxId}`);
      await waitForCollectionReady(page);
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible({ timeout: 10_000 });

      await enterSelectMode(page);
      await page
        .getByRole("button", { name: /select card/i })
        .first()
        .click();
      await expect(page.getByText("3 selected")).toBeVisible();

      await page.getByRole("button", { name: /^Dispose$/ }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByText(/permanently remove 3 cards/i)).toBeVisible();
      const confirm = dialog.getByRole("button", { name: /^Remove 3 cards$/ });
      await expect(confirm).toBeVisible();

      const disposePromise = page.waitForRequest((request) =>
        isServerFn("disposeCopiesFn")(request.url()),
      );
      await confirm.click();
      await disposePromise;

      await expect(dialog).toBeHidden();
      await expect(page.getByText(/Removed 3 cards?/)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(ANNIE_FIERY)).toHaveCount(0);

      // DB: copies are hard-deleted and a "removed" collection event is logged.
      const sql = loadDb();
      try {
        const copyRows = (await sql`
          SELECT COUNT(*)::int AS count
          FROM copies cp
          JOIN users u ON u.id = cp.user_id
          WHERE u.email = ${email}
        `) as { count: number }[];
        expect(copyRows[0].count).toBe(0);

        const eventRows = (await sql`
          SELECT COUNT(*)::int AS count
          FROM collection_events e
          JOIN users u ON u.id = e.user_id
          WHERE u.email = ${email} AND e.action = 'removed'
        `) as { count: number }[];
        expect(eventRows[0].count).toBe(3);
      } finally {
        await sql.end();
      }
    });

    test("description and button use singular wording with 1 selected", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const inboxId = await findInboxId(userEmail);
      const annie = await findPrintingIdForCard(ANNIE_FIERY);
      await seedCopies(page.request, annie, inboxId, 1);

      await page.goto(`/collections/${inboxId}`);
      await waitForCollectionReady(page);
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible({ timeout: 10_000 });

      await enterSelectMode(page);
      await page
        .getByRole("button", { name: /select card/i })
        .first()
        .click();
      await expect(page.getByText("1 selected")).toBeVisible();

      await page.getByRole("button", { name: /^Dispose$/ }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog.getByText(/permanently remove 1 card[^s]/i)).toBeVisible();
      await expect(dialog.getByRole("button", { name: /^Remove 1 card$/ })).toBeVisible();
    });

    test("confirm button shows 'Removing…' and is disabled while the request is in flight", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      const inboxId = await findInboxId(userEmail);
      const annie = await findPrintingIdForCard(ANNIE_FIERY);
      await seedCopies(page.request, annie, inboxId, 2);

      await page.route("**/_serverFn/**", async (route) => {
        if (isServerFn("disposeCopiesFn")(route.request().url())) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        await route.continue();
      });

      await page.goto(`/collections/${inboxId}`);
      await waitForCollectionReady(page);
      await expect(page.getByText(ANNIE_FIERY).first()).toBeVisible({ timeout: 10_000 });

      await enterSelectMode(page);
      await page
        .getByRole("button", { name: /select card/i })
        .first()
        .click();
      await page.getByRole("button", { name: /^Dispose$/ }).click();

      const dialog = page.getByRole("alertdialog");
      await dialog.getByRole("button", { name: /^Remove 2 cards$/ }).click();

      const removing = dialog.getByRole("button", { name: /^Removing…$/ });
      await expect(removing).toBeVisible();
      await expect(removing).toBeDisabled();
    });
  });
});
