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
  return (await response.json()) as CopyEntry[];
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
          page.getByText(/Activity is recorded when you add, move, or remove cards\./),
        ).toBeVisible();

        const browseLink = page.getByRole("link", { name: /Browse cards/i });
        await expect(browseLink).toBeVisible();
        await expect(browseLink).toHaveAttribute("href", "/cards");

        // Toolbar (filters) does not render in the empty state.
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

    test("renders 'Activity' in the top-bar portal slot", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        const topBarSlot = page.locator("div.px-3.pt-3").first();
        await expect(topBarSlot).toContainText("Activity", { timeout: 15_000 });
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

        // formatDateHeading uses toLocaleDateString with weekday/month long.
        // Browser locale and Node locale can differ, so match on any weekday word
        // plus the current year — locale-independent enough to stay stable.
        const currentYear = new Date().getFullYear().toString();
        const weekdayPattern = /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/;
        const heading = page.getByRole("heading", { level: 2 }).first();
        await expect(heading).toBeVisible({ timeout: 15_000 });
        await expect(heading).toHaveText(weekdayPattern);
        await expect(heading).toContainText(currentYear);

        // Each event card shows the card name and the short code.
        await expect(page.getByText("Annie, Fiery")).toBeVisible();
        await expect(page.getByText("Garen, Rugged")).toBeVisible();
        await expect(page.getByText("OGS-001")).toBeVisible();

        // Day summary reports 3 adds.
        await expect(page.getByText(/3 added/)).toBeVisible();
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
        await expect(page.getByText(/3 added/)).toBeVisible();
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

        // Day summary says 1 moved (and 1 added from the initial add).
        await expect(page.getByText(/1 moved/)).toBeVisible({ timeout: 15_000 });

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
        // 2 adds
        await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await apiAddCopies(context, GAREN_RUGGED_NORMAL, 1, state.inboxId);
        // 1 remove
        const removable = await apiAddCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await apiDisposeCopies(
          context,
          removable.map((c) => c.id),
        );
        // 1 move
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

        // All (default): DaySummary lists all three parts.
        await expect(page.getByText(/4 added/)).toBeVisible();
        await expect(page.getByText(/1 removed/)).toBeVisible();
        await expect(page.getByText(/1 moved/)).toBeVisible();

        // Event cards are <a href="/cards?printingId=…"> inside the content area.
        const eventCards = page.locator('a[href*="/cards?printingId="]');

        // Added → 2 grouped cards (2 adds of Annie to Inbox + 2 adds of Garen
        // to Inbox collapse by (action, printingId, collectionId)).
        await addedButton.click();
        await expect(eventCards).toHaveCount(2);

        // Removed → just the single remove.
        await removedButton.click();
        await expect(eventCards).toHaveCount(1);
        await expect(page.getByText(/1 removed/)).toBeVisible();

        // Moved → just the single move.
        await movedButton.click();
        await expect(eventCards).toHaveCount(1);
        await expect(page.getByText(/1 moved/)).toBeVisible();

        // The active filter button uses the default variant (bg-primary class);
        // non-active buttons use the ghost variant.
        await expect(movedButton).toHaveClass(/bg-primary/);
        await expect(addedButton).not.toHaveClass(/bg-primary/);
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
        // Events scoped to non-overlapping collections so filtering is
        // unambiguous: Annie only in Inbox, Garen only in Ionia Box.
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

        // Open the collection select and pick "Ionia Box".
        const trigger = page.getByLabel("Collection");
        await trigger.click();
        await page.getByRole("option", { name: "Ionia Box" }).click();

        // Only the Ionia-scoped Garen event survives.
        await expect(eventCards).toHaveCount(1);
        await expect(eventCards.first()).toContainText("Garen, Rugged");

        // Switch back to "All collections" and both cards render again.
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

        // All time (default) → 3 date headings.
        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);

        // Today → only today's heading remains.
        await todayBtn.click();
        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);

        // 7 days → today + 3 days ago (2 headings); 60-days-ago is gone.
        await sevenDays.click();
        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);

        // 30 days → same 2 headings; 60-days-ago still excluded.
        await thirtyDays.click();
        await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);

        // All time → all 3 back.
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
        // Only adds into the Inbox — no removes touching Inbox exist.
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

        // Restore: switch back to All.
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

    test("clicking an event card navigates to /cards with its printingId and opens the detail pane", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/activity");

        const eventLink = page.getByRole("link", { name: /Annie, Fiery/ });
        await expect(eventLink).toBeVisible({ timeout: 15_000 });
        await eventLink.click();

        await expect(page).toHaveURL(new RegExp(`printingId=${ANNIE_FIERY_NORMAL}`), {
          timeout: 15_000,
        });

        const pane = page.getByRole("complementary");
        await expect(pane).toBeVisible();
        await expect(pane.getByRole("heading", { level: 2, name: /Annie, Fiery/ })).toBeVisible();
      });
    });
  });

  test.describe("infinite scroll", () => {
    test.describe.configure({ mode: "serial" });

    // The server defaults to limit=100 per page (see collection-events.ts).
    // The seed fixture only has 73 printings, so to exceed PAGE_SIZE we seed
    // two events per printing (an "added" + a "removed") against the Inbox.
    // The frontend grouping key is (action, printingId, collectionId), so these
    // render as distinct cards: 73 * 2 = 146 > PAGE_SIZE.
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

        // All events on "today", but staggered seconds apart so the cursor
        // comparison has a stable ordering. Each printing produces one "added"
        // and one "removed" event against the Inbox so the grouping key
        // (action, printingId, collectionId) yields a distinct card per event.
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

        // Wait for initial page to render.
        await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible({
          timeout: 15_000,
        });

        const eventCards = page.locator('a[href*="/cards?"]');
        await expect(eventCards).toHaveCount(PAGE_SIZE);

        // Watch for the cursor-paginated follow-up fetch. The server fn is
        // declared with method "GET" (see use-collection-events.ts).
        const secondPage = page.waitForRequest(
          (req) => req.method() === "GET" && isServerFn(req.url(), "fetchCollectionEventsFn"),
          { timeout: 15_000 },
        );

        // Scroll the sentinel into view.
        await page.mouse.wheel(0, 10_000);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await secondPage;

        await expect(eventCards).toHaveCount(seedCount, { timeout: 15_000 });
      });
    });
  });
});
