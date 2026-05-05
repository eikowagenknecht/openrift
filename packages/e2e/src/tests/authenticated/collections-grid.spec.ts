import { readFileSync } from "node:fs";

import type { Browser, BrowserContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

// Seed printings (apps/api/src/test/fixtures/seed.sql).
// Annie, Fiery has two printings (foil promo + normal) of the same card.
// Garen, Rugged is a separate card we use as a "not-Annie" control.
const ANNIE_FIERY_NORMAL = "019cfc3b-03d6-74cf-adec-1dce41f631eb";
const ANNIE_FIERY_FOIL = "019d17a1-2723-733a-a21e-4630e4370046";
const GAREN_RUGGED_NORMAL = "019cfc3b-03d6-752a-adc5-19033009d65d";

interface TestUser {
  email: string;
  password: string;
}

interface CollectionSummary {
  id: string;
  name: string;
  isInbox: boolean;
}

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function createVerifiedUser(context: BrowserContext, sql: Sql, user: TestUser) {
  const response = await context.request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email: user.email, password: user.password, name: "Coll Grid E2E" },
  });
  expect(response.ok()).toBeTruthy();
  await sql`UPDATE users SET email_verified = true WHERE email = ${user.email}`;
}

async function signIn(context: BrowserContext, user: TestUser) {
  const response = await context.request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email: user.email, password: user.password },
  });
  expect(response.ok()).toBeTruthy();
}

async function fetchCollections(context: BrowserContext): Promise<CollectionSummary[]> {
  const response = await context.request.get(`${API_BASE_URL}/api/v1/collections`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { items: CollectionSummary[] };
  return body.items;
}

async function createCollection(context: BrowserContext, name: string): Promise<CollectionSummary> {
  const response = await context.request.post(`${API_BASE_URL}/api/v1/collections`, {
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as CollectionSummary;
}

async function seedCopies(
  context: BrowserContext,
  printingId: string,
  count: number,
  collectionId?: string,
): Promise<void> {
  const copies = Array.from({ length: count }, () => ({
    printingId,
    ...(collectionId ? { collectionId } : {}),
  }));
  const response = await context.request.post(`${API_BASE_URL}/api/v1/copies`, {
    data: { copies },
  });
  expect(response.ok()).toBeTruthy();
}

async function resetUserData(sql: Sql, email: string) {
  // Wipe owned copies and any non-inbox collections so each test starts clean.
  await sql`
    DELETE FROM copies
    WHERE user_id = (SELECT id FROM users WHERE email = ${email})
  `;
  await sql`
    DELETE FROM collections
    WHERE user_id = (SELECT id FROM users WHERE email = ${email})
      AND is_inbox = false
  `;
}

interface BlockState {
  user: TestUser;
  inboxId: string;
}

async function setupBlock(browser: Browser, blockLabel: string): Promise<BlockState> {
  const user: TestUser = {
    email: `coll-grid-${blockLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
    password: "CollGridTest1!",
  };
  // First context only signs the user up; cookies are discarded.
  const signupContext = await browser.newContext();
  const sql = loadDb();
  try {
    await createVerifiedUser(signupContext, sql, user);
  } finally {
    await sql.end();
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

test.describe("collections grid", () => {
  test.describe("ownership scoping", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "own");
    });

    test.beforeEach(async () => {
      const sql = loadDb();
      try {
        await resetUserData(sql, state.user.email);
      } finally {
        await sql.end();
      }
    });

    test("empty inbox renders the empty state with no card tiles", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections");

        await expect(page.getByText("No cards yet")).toBeVisible({ timeout: 15_000 });
        // The empty-state copy was reworded — match the new phrasing that
        // references the user's inbox.
        await expect(page.getByText(/Browse the card catalog and add cards to/)).toBeVisible();
        await expect(page.getByText("Annie, Fiery")).toBeHidden();
        await expect(page.getByText("Garen, Rugged")).toBeHidden();
      });
    });

    test("seeding a single Annie copy shows only Annie in the grid", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);

        const page = await context.newPage();
        await page.goto("/collections");

        await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Garen, Rugged")).toBeHidden();
        await expect(page.getByText("Lux, Illuminated")).toBeHidden();
      });
    });

    test("two seeded printings appear under both /collections and /collections/<inbox-id>, but not in an empty collection", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await seedCopies(context, GAREN_RUGGED_NORMAL, 1, state.inboxId);
        const empty = await createCollection(context, "Empty Box");

        const page = await context.newPage();

        await page.goto("/collections");
        await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Garen, Rugged")).toBeVisible();

        await page.goto(`/collections/${state.inboxId}`);
        await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Garen, Rugged")).toBeVisible();

        await page.goto(`/collections/${empty.id}`);
        await expect(page.getByText("No cards yet")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Annie, Fiery")).toBeHidden();
        await expect(page.getByText("Garen, Rugged")).toBeHidden();
      });
    });

    test("empty collection shows 'No cards yet' even when a language filter is active", async ({
      browser,
    }) => {
      // Regression: when the URL had any filter (e.g. auto-seeded language prefs),
      // an empty collection fell through to the card grid and showed the misleading
      // "Couldn't load cards / server unreachable" message instead of the neutral
      // empty state.
      await withSignedInContext(state.user, browser, async (context) => {
        const empty = await createCollection(context, "Empty Box");
        const page = await context.newPage();
        await page.goto(`/collections/${empty.id}?languages=%5B%22EN%22%5D`);

        await expect(page.getByText("No cards yet")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Couldn't load cards")).toBeHidden();
        await expect(page.getByText("The server may be unreachable.")).toBeHidden();
      });
    });
  });

  test.describe("view modes: cards | printings | copies", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "view");
      // Seed once for the whole block: 3 + 1 = 4 copies of Annie across 2 printings.
      await withSignedInContext(state.user, browser, async (context) => {
        await seedCopies(context, ANNIE_FIERY_NORMAL, 3, state.inboxId);
        await seedCopies(context, ANNIE_FIERY_FOIL, 1, state.inboxId);
      });
    });

    test("?view=cards collapses to one tile and labels the count as cards", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections?view=cards");

        await expect(page.getByText("Annie, Fiery")).toHaveCount(1, { timeout: 15_000 });
        await expect(page.getByText(/\b1 cards\b/)).toBeVisible();
      });
    });

    test("?view=printings shows one tile per printing and labels the count as printings", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections?view=printings");

        await expect(page.getByText("Annie, Fiery")).toHaveCount(2, { timeout: 15_000 });
        await expect(page.getByText(/\b2 printings\b/)).toBeVisible();
      });
    });

    test("?view=copies shows one tile per copy and labels the count as copies", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections?view=copies");

        await expect(page.getByText("Annie, Fiery")).toHaveCount(4, { timeout: 15_000 });
        await expect(page.getByText(/\b4 copies\b/)).toBeVisible();
      });
    });

    test("clicking the Every-printing option in the view bar swaps the grid and updates the URL", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections");
        await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 15_000 });
        // Default view is "cards" (user-settable preference), so the initial
        // label is "1 cards" — Annie's 2 printings collapse into one tile.
        await expect(page.getByText(/\b1 cards\b/)).toBeVisible();

        const viewGroup = page.getByRole("group", { name: "View mode" });
        // Click the non-default "Every printing" option so the URL actually
        // updates; setView only writes a `view` param when the selected mode
        // differs from the user's default (see setView in use-card-filters.ts).
        await viewGroup.getByRole("button", { name: "Every printing" }).click();

        await expect(page).toHaveURL(/[?&]view=printings/);
        await expect(page.getByText(/\b2 printings\b/)).toBeVisible();
        await expect(page.getByText("Annie, Fiery")).toHaveCount(2);
      });
    });
  });

  test.describe("filters narrow the owned grid", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "filters");
      await withSignedInContext(state.user, browser, async (context) => {
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await seedCopies(context, GAREN_RUGGED_NORMAL, 1, state.inboxId);
      });
    });

    test("?domains=Body keeps only Garen visible on /collections", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto(`/collections?domains=${encodeURIComponent(JSON.stringify(["body"]))}`);

        await expect(page.getByText("Garen, Rugged")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Annie, Fiery")).toBeHidden();
      });
    });

    test("?search=Annie narrows to Annie; clearing the search restores Garen", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections?search=Annie");

        await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Garen, Rugged")).toBeHidden();

        await page.getByRole("button", { name: "Clear search" }).click();

        await expect(page.getByPlaceholder(/search/i)).toHaveValue("");
        await expect(page.getByText("Garen, Rugged")).toBeVisible();
        await expect(page.getByText("Annie, Fiery")).toBeVisible();
      });
    });

    test("?domains=Body still filters when scoped to /collections/<inbox-id>", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto(
          `/collections/${state.inboxId}?domains=${encodeURIComponent(JSON.stringify(["body"]))}`,
        );

        await expect(page.getByText("Garen, Rugged")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Annie, Fiery")).toBeHidden();
      });
    });
  });

  test.describe("per-collection scoping", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;
    let secondCollection: CollectionSummary;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "scope");
      await withSignedInContext(state.user, browser, async (context) => {
        secondCollection = await createCollection(context, "Demacia Box");
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await seedCopies(context, GAREN_RUGGED_NORMAL, 1, secondCollection.id);
      });
    });

    test("the inbox page shows only Annie, not Garen", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto(`/collections/${state.inboxId}`);

        await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Garen, Rugged")).toBeHidden();
      });
    });

    test("the second collection page shows only Garen, not Annie", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto(`/collections/${secondCollection.id}`);

        await expect(page.getByText("Garen, Rugged")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Annie, Fiery")).toBeHidden();
      });
    });

    test("the All Cards page shows both", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections");

        await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Garen, Rugged")).toBeVisible();
      });
    });
  });

  test.describe("top bar title", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;
    let namedCollection: CollectionSummary;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "title");
      await withSignedInContext(state.user, browser, async (context) => {
        namedCollection = await createCollection(context, "Vault of Champions");
        // Seed one copy in each so the grid renders past the empty state.
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await seedCopies(context, GAREN_RUGGED_NORMAL, 1, namedCollection.id);
      });
    });

    test("/collections renders the 'All Cards' title in the top bar", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections");

        // Top bar renders "All Cards" as the page heading, and the sidebar
        // has an "All Cards" link entry.
        await expect(page.getByRole("heading", { name: "All Cards" })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByRole("link", { name: /All Cards/ })).toBeVisible();
      });
    });

    test("/collections/<id> renders the collection's name in the top bar", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto(`/collections/${namedCollection.id}`);

        // The collection name appears as the top bar heading and as a sidebar link.
        await expect(page.getByRole("heading", { name: "Vault of Champions" })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByRole("link", { name: /Vault of Champions/ })).toBeVisible();
      });
    });
  });

  test.describe("browsing flag", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "browse");
      // Seed copies so the inbox sidebar entry shows a non-zero count badge.
      await withSignedInContext(state.user, browser, async (context) => {
        await seedCopies(context, ANNIE_FIERY_NORMAL, 3, state.inboxId);
      });
    });

    test("without ?browsing the inbox sidebar entry shows its copy count badge", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto(`/collections/${state.inboxId}`);

        // Sidebar shows "Inbox" with a "3" badge next to it; assert the count text
        // is visible. (Annie's grid renders the same number elsewhere, so we
        // anchor on the sidebar item by scoping to the row containing "Inbox".)
        const inboxRow = page.locator('a[href*="/collections/"]', { hasText: "Inbox" });
        await expect(inboxRow).toBeVisible({ timeout: 15_000 });
        await expect(inboxRow.getByText("3", { exact: true })).toBeVisible();
      });
    });

    // The browsing pulsing-red dot is rendered as a bare <span> with only
    // styling classes (no role, aria-label, or distinctive text). Per project
    // convention we don't scrape class names; flagging here so the team can
    // decide whether to add an aria-label (e.g. "Currently browsing the catalog").
    test.skip("with ?browsing=true the inbox sidebar entry shows the browsing indicator", () => {
      // Intentionally skipped: needs a user-visible cue (aria-label or role) on
      // the pulsing dot before this can be asserted without class scraping.
    });
  });

  test.describe("learn link", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "learn");
    });

    test("the empty state on /collections links to /help/cards-printings-copies", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections");

        const learnLink = page.getByRole("link", {
          name: /Learn about cards, printings & copies/,
        });
        await expect(learnLink).toBeVisible({ timeout: 15_000 });
        await expect(learnLink).toHaveAttribute("href", "/help/cards-printings-copies");

        await learnLink.click();
        await expect(page).toHaveURL(/\/help\/cards-printings-copies$/);
      });
    });
  });
});
