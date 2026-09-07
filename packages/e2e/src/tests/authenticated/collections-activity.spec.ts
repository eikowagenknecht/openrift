import { readFileSync } from "node:fs";

import type { Browser, BrowserContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

// Seed printings from apps/api/src/test/fixtures/seed.sql.
const ANNIE_FIERY_NORMAL = "019cfc3b-03d6-74cf-adec-1dce41f631eb";
const GAREN_RUGGED_NORMAL = "019cfc3b-03d6-752a-adc5-19033009d65d";

interface TestUser {
  email: string;
  password: string;
}

interface BlockState {
  user: TestUser;
  inboxId: string;
}

interface CollectionSummary {
  id: string;
  name: string;
  isInbox: boolean;
}

interface CopyEntry {
  id: string;
  printingId: string;
  collectionId: string;
}

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function createVerifiedUser(context: BrowserContext, user: TestUser) {
  const response = await context.request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email: user.email, password: user.password, name: "Activity E2E" },
  });
  expect(response.ok()).toBeTruthy();
  const sql = loadDb();
  try {
    await sql`UPDATE users SET email_verified = true WHERE email = ${user.email}`;
  } finally {
    await sql.end();
  }
}

async function signIn(context: BrowserContext, user: TestUser) {
  const response = await context.request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email: user.email, password: user.password },
  });
  expect(response.ok()).toBeTruthy();
}

async function withSignedInContext<T>(
  user: TestUser,
  browser: Browser,
  fn: (context: BrowserContext) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext();
  try {
    await signIn(context, user);
    return await fn(context);
  } finally {
    await context.close();
  }
}

async function fetchCollections(context: BrowserContext): Promise<CollectionSummary[]> {
  const response = await context.request.get(`${API_BASE_URL}/api/v1/collections`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { items: CollectionSummary[] };
  return body.items;
}

async function apiCreateCollection(
  context: BrowserContext,
  name: string,
): Promise<CollectionSummary> {
  const response = await context.request.post(`${API_BASE_URL}/api/v1/collections`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as CollectionSummary;
}

async function apiAddCopies(
  context: BrowserContext,
  printingId: string,
  count: number,
  collectionId?: string,
): Promise<CopyEntry[]> {
  const copies = Array.from({ length: count }, () => ({
    printingId,
    ...(collectionId ? { collectionId } : {}),
  }));
  const response = await context.request.post(`${API_BASE_URL}/api/v1/copies`, {
    headers: { Origin: WEB_BASE_URL },
    data: { copies },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { items: CopyEntry[] };
  return body.items;
}

async function apiMoveCopies(
  context: BrowserContext,
  copyIds: string[],
  toCollectionId: string,
): Promise<void> {
  const response = await context.request.post(`${API_BASE_URL}/api/v1/copies/move`, {
    headers: { Origin: WEB_BASE_URL },
    data: { copyIds, toCollectionId },
  });
  expect(response.ok()).toBeTruthy();
}

async function apiDisposeCopies(context: BrowserContext, copyIds: string[]): Promise<void> {
  const response = await context.request.post(`${API_BASE_URL}/api/v1/copies/dispose`, {
    headers: { Origin: WEB_BASE_URL },
    data: { copyIds },
  });
  expect(response.ok()).toBeTruthy();
}

interface DirectEventInput {
  action: "added" | "removed" | "moved";
  printingId: string;
  fromCollectionId?: string;
  fromCollectionName?: string;
  toCollectionId?: string;
  toCollectionName?: string;
  createdAt: Date;
}

async function insertEventsDirectly(
  sql: Sql,
  email: string,
  events: DirectEventInput[],
): Promise<void> {
  for (const event of events) {
    await sql`
      INSERT INTO collection_events (
        user_id, action, printing_id,
        from_collection_id, from_collection_name,
        to_collection_id, to_collection_name,
        created_at
      )
      SELECT
        u.id, ${event.action}, ${event.printingId}::uuid,
        ${event.fromCollectionId ?? null}::uuid, ${event.fromCollectionName ?? null},
        ${event.toCollectionId ?? null}::uuid, ${event.toCollectionName ?? null},
        ${event.createdAt.toISOString()}::timestamptz
      FROM users u
      WHERE u.email = ${email}
    `;
  }
}

async function setupBlock(browser: Browser, blockLabel: string): Promise<BlockState> {
  const user: TestUser = {
    email: `activity-${blockLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
    password: "ActivityE2e1!",
  };
  const signupContext = await browser.newContext();
  try {
    await createVerifiedUser(signupContext, user);
  } finally {
    await signupContext.close();
  }

  return withSignedInContext(user, browser, async (context) => {
    const collections = await fetchCollections(context);
    const inbox = collections.find((c) => c.isInbox);
    if (!inbox) {
      throw new Error("Inbox collection not found for fresh user");
    }
    return { user, inboxId: inbox.id };
  });
}

async function deleteUser(email: string): Promise<void> {
  const sql = loadDb();
  try {
    await sql`DELETE FROM users WHERE email = ${email}`;
  } finally {
    await sql.end();
  }
}

// TanStack Start encodes the server fn id as base64url(JSON); decode to target
// a specific server fn out of the bundle during a route transition.
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

test.describe("collection activity", () => {
  test.describe("empty state", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "empty");
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("shows the empty-state hero and no toolbar when there are no events", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        await expect(
          page.getByRole("heading", { level: 1 }).or(page.getByText("No activity yet")).first(),
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("No activity yet")).toBeVisible();
        await expect(
          page.getByText(/Activity is recorded when you add, move, or remove cards\./u),
        ).toBeVisible();

        // May resolve to role="link" or role="button" depending on how BaseUI
        // merges the render prop; accept either.
        const browseLink = page
          .getByRole("link", { name: /Browse cards/iu })
          .or(page.getByRole("button", { name: /Browse cards/iu }));
        await expect(browseLink).toBeVisible();
        await expect(browseLink).toHaveAttribute("href", "/cards");

        await expect(page.getByRole("button", { name: "Added" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Today" })).toHaveCount(0);
      });
    });
  });

  test.describe("top bar", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "topbar");
      await withSignedInContext(state.user, browser, async (context) => {
        await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
      });
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("renders the 'Activity' page title in the top bar", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        // The page title renders through the shared PageTopBar (an h1), not a
        // hand-rolled sticky div.
        await expect(page.getByRole("heading", { name: "Activity" }).first()).toBeVisible({
          timeout: 15_000,
        });
      });
    });
  });

  test.describe("event rendering", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "render");
      await withSignedInContext(state.user, browser, async (context) => {
        await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await apiAddCopies(context, GAREN_RUGGED_NORMAL, 2, state.inboxId);
      });
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("renders today's date heading, event cards, and a day summary with counts", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        // Day headings are ISO days on the viewer's own clock (formatDayLocal),
        // so the seeded events group under today's local date.
        const now = new Date();
        const today = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, "0"),
          String(now.getDate()).padStart(2, "0"),
        ].join("-");
        const heading = page.getByRole("heading", { level: 2 }).first();
        await expect(heading).toBeVisible({ timeout: 15_000 });
        await expect(heading).toHaveText(today);

        await expect(page.getByText("Annie, Fiery")).toBeVisible();
        await expect(page.getByText("Garen, Rugged")).toBeVisible();
        await expect(page.getByText("OGS-001")).toBeVisible();

        await expect(page.getByText(/3 added/u)).toBeVisible();
      });
    });
  });

  test.describe("grouping same-day identical events", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "group");
      await withSignedInContext(state.user, browser, async (context) => {
        await apiAddCopies(context, ANNIE_FIERY_NORMAL, 3, state.inboxId);
      });
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("3 same-day adds of one printing collapse into one card with a 3x badge", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        await expect(page.getByText("Annie, Fiery")).toHaveCount(1, { timeout: 15_000 });
        await expect(page.getByText("3x", { exact: true })).toBeVisible();
        await expect(page.getByText(/3 added/u)).toBeVisible();
      });
    });
  });

  test.describe("move events show from → to", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "move");
      await withSignedInContext(state.user, browser, async (context) => {
        const secondary = await apiCreateCollection(context, "Demacia Box");
        const copies = await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await apiMoveCopies(
          context,
          copies.map((c) => c.id),
          secondary.id,
        );
      });
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("renders a moved event card with both collection names visible", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        // The day summary counts the earlier add too, so this reads 1 moved.
        await expect(page.getByText(/1 moved/u)).toBeVisible({ timeout: 15_000 });

        // Scope to the move event's Link so we don't accidentally match the
        // "Inbox"/"Demacia Box" entries in the sidebar.
        const moveCard = page
          .locator('a[href*="/cards?"]')
          .filter({ hasText: "Demacia Box" })
          .first();
        await expect(moveCard).toBeVisible();
        await expect(moveCard).toContainText("Inbox");
        await expect(moveCard).toContainText("Demacia Box");
        await expect(moveCard).toContainText("Annie, Fiery");
      });
    });
  });

  test.describe("action filter", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "action");
      await withSignedInContext(state.user, browser, async (context) => {
        const secondary = await apiCreateCollection(context, "Shurima Box");
        await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await apiAddCopies(context, GAREN_RUGGED_NORMAL, 1, state.inboxId);
        const removable = await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await apiDisposeCopies(
          context,
          removable.map((c) => c.id),
        );
        const movable = await apiAddCopies(context, GAREN_RUGGED_NORMAL, 1, state.inboxId);
        await apiMoveCopies(
          context,
          movable.map((c) => c.id),
          secondary.id,
        );
      });
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("narrows rendered events to the selected action", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        const toolbar = page.locator("div.mb-4.flex.flex-wrap").first();
        const allButton = toolbar.getByRole("button", { name: "All", exact: true });
        const addedButton = toolbar.getByRole("button", { name: "Added", exact: true });
        const removedButton = toolbar.getByRole("button", { name: "Removed", exact: true });
        const movedButton = toolbar.getByRole("button", { name: "Moved", exact: true });

        await expect(allButton).toBeVisible({ timeout: 15_000 });

        await expect(page.getByText(/4 added/u)).toBeVisible();
        await expect(page.getByText(/1 removed/u)).toBeVisible();
        await expect(page.getByText(/1 moved/u)).toBeVisible();

        const eventCards = page.locator('a[href*="/cards?printingId="]');

        await addedButton.click();
        await expect(eventCards).toHaveCount(2);

        await removedButton.click();
        await expect(eventCards).toHaveCount(1);
        await expect(page.getByText(/1 removed/u)).toBeVisible();

        await movedButton.click();
        await expect(eventCards).toHaveCount(1);
        await expect(page.getByText(/1 moved/u)).toBeVisible();

        await expect(movedButton).toHaveAttribute("aria-pressed", "true");
        await expect(addedButton).toHaveAttribute("aria-pressed", "false");
      });
    });
  });

  test.describe("collection filter", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "colfilter");
      await withSignedInContext(state.user, browser, async (context) => {
        const secondary = await apiCreateCollection(context, "Ionia Box");
        await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await apiAddCopies(context, GAREN_RUGGED_NORMAL, 1, secondary.id);
      });
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("narrows events to those touching the selected collection", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        const eventCards = page.locator('a[href*="/cards?printingId="]');
        await expect(eventCards).toHaveCount(2, { timeout: 15_000 });

        const trigger = page.getByLabel("Collection");
        await trigger.click();
        await page.getByRole("option", { name: "Ionia Box" }).click();

        await expect(eventCards).toHaveCount(1);
        await expect(eventCards.first()).toContainText("Garen, Rugged");

        await trigger.click();
        await page.getByRole("option", { name: "All collections" }).click();
        await expect(eventCards).toHaveCount(2);
      });
    });
  });

  test.describe("date filter", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "datefilter");
      const sql = loadDb();
      try {
        const now = new Date();
        const threeDaysAgo = new Date(now);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const sixtyDaysAgo = new Date(now);
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        await insertEventsDirectly(sql, state.user.email, [
          {
            action: "added",
            printingId: ANNIE_FIERY_NORMAL,
            toCollectionId: state.inboxId,
            toCollectionName: "Inbox",
            createdAt: now,
          },
          {
            action: "added",
            printingId: GAREN_RUGGED_NORMAL,
            toCollectionId: state.inboxId,
            toCollectionName: "Inbox",
            createdAt: threeDaysAgo,
          },
          {
            action: "added",
            printingId: ANNIE_FIERY_NORMAL,
            toCollectionId: state.inboxId,
            toCollectionName: "Inbox",
            createdAt: sixtyDaysAgo,
          },
        ]);
      } finally {
        await sql.end();
      }
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("date presets cut events to the chosen window", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        const toolbar = page.locator("div.mb-4.flex.flex-wrap").first();
        const allTime = toolbar.getByRole("button", { name: "All time", exact: true });
        const todayBtn = toolbar.getByRole("button", { name: "Today", exact: true });
        const sevenDays = toolbar.getByRole("button", { name: "7 days", exact: true });
        const thirtyDays = toolbar.getByRole("button", { name: "30 days", exact: true });

        await expect(allTime).toBeVisible({ timeout: 15_000 });

        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);

        await todayBtn.click();
        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);

        await sevenDays.click();
        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);

        await thirtyDays.click();
        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);

        await allTime.click();
        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
      });
    });
  });

  test.describe("filter combinations + filtered empty", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "combo");
      await withSignedInContext(state.user, browser, async (context) => {
        await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
      });
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("Action=Removed yields the filtered empty state; clearing filters restores events", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });

        const toolbar = page.locator("div.mb-4.flex.flex-wrap").first();
        await toolbar.getByRole("button", { name: "Removed", exact: true }).click();

        await expect(page.getByText("No matching activity")).toBeVisible();
        await expect(page.getByText("Annie, Fiery")).toBeHidden();

        await toolbar.getByRole("button", { name: "All", exact: true }).click();
        await expect(page.getByText("Annie, Fiery")).toBeVisible();
        await expect(page.getByText("No matching activity")).toBeHidden();
      });
    });
  });

  test.describe("event navigation", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "nav");
      await withSignedInContext(state.user, browser, async (context) => {
        await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
      });
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("clicking an event card navigates to /cards with its printingId and opens the card detail", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        const eventLink = page.getByRole("link", { name: /Annie, Fiery/u });
        await expect(eventLink).toBeVisible({ timeout: 15_000 });
        await eventLink.click();

        await expect(page).toHaveURL(new RegExp(`printingId=${ANNIE_FIERY_NORMAL}`, "u"), {
          timeout: 15_000,
        });

        // The docked pane is opt-in (the `paneDocked` display preference,
        // off by default), so a card click opens the detail dialog instead.
        const detail = page.getByRole("dialog");
        await expect(detail).toBeVisible();
        await expect(detail.getByRole("heading", { name: /Annie, Fiery/u }).first()).toBeVisible();
      });
    });
  });

  test.describe("infinite scroll", () => {
    test.describe.configure({ mode: "serial" });

    // The server defaults to limit=100/page; the 73-printing seed fixture
    // needs 2 events each (added + removed) to exceed it: 73*2=146 > PAGE_SIZE.
    const PAGE_SIZE = 100;
    let seedCount = 0;

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "scroll");
      const sql = loadDb();
      try {
        const rows = (await sql`
          SELECT id::text AS id FROM printings ORDER BY id
        `) as { id: string }[];
        const printingIds = rows.map((r) => r.id);
        expect(printingIds.length).toBeGreaterThan(PAGE_SIZE / 2);

        // Staggered seconds apart so the cursor comparison has a stable
        // ordering; added/removed pairs group into distinct cards.
        const now = Date.now();
        const events: DirectEventInput[] = printingIds.flatMap((printingId, idx) => [
          {
            action: "added",
            printingId,
            toCollectionId: state.inboxId,
            toCollectionName: "Inbox",
            createdAt: new Date(now - idx * 2000),
          },
          {
            action: "removed",
            printingId,
            fromCollectionId: state.inboxId,
            fromCollectionName: "Inbox",
            createdAt: new Date(now - idx * 2000 - 1000),
          },
        ]);
        seedCount = events.length;
        expect(seedCount).toBeGreaterThan(PAGE_SIZE);
        await insertEventsDirectly(sql, state.user.email, events);
      } finally {
        await sql.end();
      }
    });

    test.afterAll(async () => {
      await deleteUser(state.user.email);
    });

    test("loads the next page when the sentinel intersects the viewport", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({
          timeout: 15_000,
        });

        const eventCards = page.locator('a[href*="/cards?"]');
        await expect(eventCards).toHaveCount(PAGE_SIZE);

        // The cursor-paginated follow-up fetch is a GET server fn call.
        const secondPage = page.waitForRequest(
          (req) => req.method() === "GET" && isServerFn(req.url(), "fetchCollectionEventsFn"),
          { timeout: 15_000 },
        );

        await page.mouse.wheel(0, 10_000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await secondPage;

        await expect(eventCards).toHaveCount(seedCount, { timeout: 15_000 });
      });
    });
  });
});
