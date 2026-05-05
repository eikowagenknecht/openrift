import { readFileSync } from "node:fs";

import type { Browser, BrowserContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

// Seed printings (apps/api/src/test/fixtures/seed.sql).
// Annie, Fiery: Unit, Fury domain, Epic rarity (two printings — normal + foil promo).
// Garen, Rugged: Unit, Body domain, Rare rarity (normal).
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
    data: { email: user.email, password: user.password, name: "Coll Stats E2E" },
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
    headers: { Origin: WEB_BASE_URL },
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
    headers: { Origin: WEB_BASE_URL },
    data: { copies },
  });
  expect(response.ok()).toBeTruthy();
}

async function getUserId(sql: Sql, email: string): Promise<string> {
  const rows = (await sql`SELECT id FROM users WHERE email = ${email}`) as { id: string }[];
  expect(rows.length).toBe(1);
  return rows[0].id;
}

async function setFlagOverride(sql: Sql, userId: string, flagKey: string, enabled: boolean) {
  // Use a per-user override only. The authenticated /feature-flags endpoint
  // merges per-user overrides on top of global defaults, and the web app's
  // `fetchFeatureFlags` server fn forwards cookies via the `withCookies`
  // middleware (see apps/web/src/lib/feature-flags.ts), so per-user
  // overrides are visible during SSR and client-side fetches alike.
  //
  // We intentionally do NOT mirror onto the global `feature_flags` table —
  // the global row is shared across all tests, and flipping it would race
  // with parallel describe blocks that assume the default state.
  await sql`
    INSERT INTO user_feature_flags (user_id, flag_key, enabled)
    VALUES (${userId}, ${flagKey}, ${enabled})
    ON CONFLICT (user_id, flag_key) DO UPDATE SET enabled = EXCLUDED.enabled
  `;
}

async function clearFlagOverride(sql: Sql, userId: string, flagKey: string) {
  await sql`
    DELETE FROM user_feature_flags WHERE user_id = ${userId} AND flag_key = ${flagKey}
  `;
}

interface BlockState {
  user: TestUser;
  userId: string;
  inboxId: string;
}

async function setupBlock(browser: Browser, label: string): Promise<BlockState> {
  const user: TestUser = {
    email: `coll-stats-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`,
    password: "CollStatsTest1!",
  };
  const signupContext = await browser.newContext();
  const sql = loadDb();
  let userId: string;
  try {
    await createVerifiedUser(signupContext, sql, user);
    userId = await getUserId(sql, user.email);
  } finally {
    await sql.end();
    await signupContext.close();
  }

  return withSignedInContext(user, browser, async (context) => {
    const collections = await fetchCollections(context);
    const inbox = collections.find((collection) => collection.isInbox);
    if (!inbox) {
      throw new Error("Inbox collection not found for fresh user");
    }
    return { user, userId, inboxId: inbox.id };
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

test.describe("collection stats", () => {
  test.describe("empty state", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "empty");
    });

    test("zero copies renders the empty state with a Browse cards button", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        await expect(page.getByText("No cards in collection yet")).toBeVisible({
          timeout: 15_000,
        });
        // The "Browse cards" button uses Button render={<Link />}; BaseUI's
        // Button primitive keeps role="button" even when rendered as an <a>,
        // so look up by both role and fall back to accessible-name text.
        const browse = page
          .getByRole("link", { name: /Browse cards/ })
          .or(page.getByRole("button", { name: /Browse cards/ }));
        await expect(browse).toBeVisible();
        await expect(browse).toHaveAttribute("href", "/cards");

        // Completion / Cost to Complete sections are gated on non-empty totals.
        await expect(page.getByRole("heading", { name: "Completion" })).toHaveCount(0);
      });
    });
  });

  test.describe("hero numbers and estimated value", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "hero");
      await withSignedInContext(state.user, browser, async (context) => {
        // 3 + 2 + 1 = 6 copies, 2 unique cards, 3 unique printings.
        await seedCopies(context, ANNIE_FIERY_NORMAL, 3, state.inboxId);
        await seedCopies(context, ANNIE_FIERY_FOIL, 2, state.inboxId);
        await seedCopies(context, GAREN_RUGGED_NORMAL, 1, state.inboxId);
      });
    });

    test("Unique Cards, Unique Printings, and Total Copies reflect the seed", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible({
          timeout: 15_000,
        });

        const heroCard = (title: string) =>
          page.locator('[data-slot="card"]').filter({
            has: page.locator('[data-slot="card-title"]', { hasText: title }),
          });

        await expect(heroCard("Unique Cards").locator("p.text-2xl")).toHaveText("2");
        await expect(heroCard("Unique Printings").locator("p.text-2xl")).toHaveText("3");
        await expect(heroCard("Total Copies").locator("p.text-2xl")).toHaveText("6");
      });
    });

    test("Estimated Value is a marketplace link with a marketplace badge", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        const valueLink = page
          .locator('a[target="_blank"]', { hasText: "Estimated Value" })
          .first();
        await expect(valueLink).toBeVisible({ timeout: 15_000 });
        await expect(valueLink).toHaveAttribute("rel", "noreferrer");
        // The link points to the user's preferred marketplace (first entry in
        // the prefs order). Default seed is CardTrader first, so accept any
        // of the known marketplace domains.
        await expect(valueLink).toHaveAttribute(
          "href",
          /(tcgplayer\.com|cardtrader\.com|cardmarket\.com)/,
        );

        // The value itself is rendered; we don't hard-code an amount since prices
        // vary across the seed but assert a non-empty numeric string is shown.
        const valueText = (await valueLink.locator("p.text-2xl").textContent()) ?? "";
        expect(valueText.trim().length).toBeGreaterThan(0);
      });
    });
  });

  test.describe("collection scope", () => {
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

    test("All collections → Inbox → second collection updates the hero numbers", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        const totalCopies = page
          .locator('[data-slot="card"]')
          .filter({
            has: page.locator('[data-slot="card-title"]', { hasText: "Total Copies" }),
          })
          .locator("p.text-2xl");

        // Default is "All collections": Annie (inbox) + Garen (second) = 2 copies.
        await expect(totalCopies).toHaveText("2", { timeout: 15_000 });

        const scopeTrigger = page.getByRole("combobox", { name: /Collection scope/i });

        await scopeTrigger.click();
        await page.getByRole("option", { name: "Inbox" }).click();
        await expect(totalCopies).toHaveText("1");

        await scopeTrigger.click();
        await page.getByRole("option", { name: "Demacia Box" }).click();
        await expect(totalCopies).toHaveText("1");

        await scopeTrigger.click();
        await page.getByRole("option", { name: "All collections" }).click();
        await expect(totalCopies).toHaveText("2");
      });
    });
  });

  test.describe("group by", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "group");
      await withSignedInContext(state.user, browser, async (context) => {
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await seedCopies(context, GAREN_RUGGED_NORMAL, 1, state.inboxId);
      });
    });

    test("Set → Domain → Rarity → Type swaps the Completion rows", async ({ browser }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        const groupGroup = page.getByRole("group", { name: /Group by/i });
        await expect(groupGroup).toBeVisible({ timeout: 15_000 });

        // Default is "Set" — the only seeded set is OGS (Proving Grounds, supplemental).
        await expect(page.getByText("Proving Grounds")).toBeVisible();
        await expect(page.getByText("Supplemental", { exact: true })).toBeVisible();

        await groupGroup.getByRole("button", { name: "Domain" }).click();
        // Annie is Fury, Garen is Body.
        await expect(page.getByText("fury", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("body", { exact: true }).first()).toBeVisible();

        await groupGroup.getByRole("button", { name: "Rarity" }).click();
        // Annie is Epic, Garen is Rare.
        await expect(page.getByText("epic", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("rare", { exact: true }).first()).toBeVisible();

        await groupGroup.getByRole("button", { name: "Type" }).click();
        // Both are Units.
        await expect(page.getByText("unit", { exact: true }).first()).toBeVisible();
      });
    });
  });

  test.describe("count mode", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "count");
      await withSignedInContext(state.user, browser, async (context) => {
        // 3 copies of one Annie printing — playset of a non-Legend card.
        await seedCopies(context, ANNIE_FIERY_NORMAL, 3, state.inboxId);
      });
    });

    test("Cards / Printings / Copies each render the Overall row with distinct totals", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        const countGroup = page.getByRole("group", { name: /Count mode/i });
        await expect(countGroup).toBeVisible({ timeout: 15_000 });

        const overallRow = page.locator("div", { hasText: /^Overall/ }).first();

        // Default "Cards": one unique card owned.
        await expect(overallRow).toContainText(/^Overall\s*1\s*\//);

        await countGroup.getByRole("button", { name: "Printings" }).click();
        // One printing owned.
        await expect(overallRow).toContainText(/^Overall\s*1\s*\//);

        await countGroup.getByRole("button", { name: "Copies" }).click();
        // Three copies counted toward a max-3 playset target.
        await expect(overallRow).toContainText(/^Overall\s*3\s*\//);
      });
    });
  });

  test.describe("filters", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "filters");
      await withSignedInContext(state.user, browser, async (context) => {
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await seedCopies(context, GAREN_RUGGED_NORMAL, 1, state.inboxId);
      });
    });

    test("toggle button expands/collapses the filter panel with hidden Owned/SuperType sections", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        const showFilters = page.getByRole("button", { name: "Show filters" });
        await expect(showFilters).toBeVisible({ timeout: 15_000 });
        await showFilters.click();

        const hideFilters = page.getByRole("button", { name: "Hide filters" });
        await expect(hideFilters).toBeVisible();

        // Visible sections inside the expanded panel. Domain/Rarity also appear
        // elsewhere on the stats page (as CardTitle for the distribution chart
        // and as a group-by button), so scope to the filter-section paragraph.
        const filterLabels = page.locator("p.text-muted-foreground.w-18.text-xs.font-medium");
        await expect(filterLabels.filter({ hasText: /^Domain$/ })).toBeVisible();
        await expect(filterLabels.filter({ hasText: /^Rarity$/ })).toBeVisible();

        // HIDDEN_FILTER_SECTIONS removes "owned" and "superTypes".
        await expect(filterLabels.filter({ hasText: /^Owned$/ })).toHaveCount(0);
        await expect(filterLabels.filter({ hasText: /^Super Type$/ })).toHaveCount(0);
      });
    });

    test("?domains=Fury narrows the Completion section and the ActiveFilters chip appears", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto(
          `/collections/stats?domains=${encodeURIComponent(JSON.stringify(["fury"]))}`,
        );

        await expect(page.getByRole("heading", { name: "Completion" })).toBeVisible({
          timeout: 15_000,
        });

        // Active-filter chip strip renders the domain label. The chip itself
        // is a div containing a label + close button; assert the "Domain:"
        // prefix chip is visible.
        await expect(page.getByText(/Domain:/).first()).toBeVisible();
        await expect(page.getByText("fury").first()).toBeVisible();

        // Group-by "Domain" reveals the per-domain rows — Fury should show owned > 0
        // (Annie is Fury). We no longer assert on "body" because Body is a
        // card subtype rather than a domain, and now appears in other stats
        // sections unrelated to the domain filter.
        const groupGroup = page.getByRole("group", { name: /Group by/i });
        await groupGroup.getByRole("button", { name: "Domain" }).click();
        await expect(page.getByText("fury", { exact: true }).first()).toBeVisible();
      });
    });
  });

  test.describe("distribution charts and price extremes", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "dist");
      await withSignedInContext(state.user, browser, async (context) => {
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
        await seedCopies(context, GAREN_RUGGED_NORMAL, 1, state.inboxId);
      });
    });

    test("Domain / Rarity / Type cards render with legend labels, and price extremes link into /cards", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible({
          timeout: 15_000,
        });

        // Distribution card titles.
        await expect(
          page.locator('[data-slot="card-title"]', { hasText: /^Domain$/ }),
        ).toBeVisible();
        await expect(
          page.locator('[data-slot="card-title"]', { hasText: /^Rarity$/ }),
        ).toBeVisible();
        await expect(page.locator('[data-slot="card-title"]', { hasText: /^Type$/ })).toBeVisible();

        // Seeded rarities are Epic (Annie) and Rare (Garen) — both appear in the
        // rarity chart legend.
        await expect(page.getByText("epic", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("rare", { exact: true }).first()).toBeVisible();

        // Price extremes — both card tiles link into /cards/<slug>.
        const cheapest = page.getByRole("link", { name: /Annie, Fiery|Garen, Rugged/ }).first();
        await expect(cheapest).toBeVisible();
        await expect(cheapest).toHaveAttribute("href", /^\/cards\//);
      });
    });
  });

  test.describe("energy & power", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "energy");
      await withSignedInContext(state.user, browser, async (context) => {
        // Annie, Fiery: Unit with energy=5 and power=1 — the chart renders.
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
      });
    });

    test("Energy & Power card renders when a seeded unit has energy/power data", async ({
      browser,
    }) => {
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        await expect(
          page.locator('[data-slot="card-title"]', { hasText: /Energy & Power/ }),
        ).toBeVisible({ timeout: 15_000 });
      });
    });
  });

  test.describe("price-history flag", () => {
    test.describe.configure({ mode: "serial" });

    let state: BlockState;

    test.beforeAll(async ({ browser }) => {
      state = await setupBlock(browser, "pricehist");
      await withSignedInContext(state.user, browser, async (context) => {
        await seedCopies(context, ANNIE_FIERY_NORMAL, 1, state.inboxId);
      });
    });

    test.afterAll(async () => {
      const sql = loadDb();
      try {
        await clearFlagOverride(sql, state.userId, "price-history");
      } finally {
        await sql.end();
      }
    });

    test("with price-history off: Value Over Time section is absent", async ({ browser }) => {
      const sql = loadDb();
      try {
        await setFlagOverride(sql, state.userId, "price-history", false);
      } finally {
        await sql.end();
      }
      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");
        // Wait for the stats page to finish loading before asserting the
        // absence of the Value Over Time heading (gated by the flag).
        await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByRole("heading", { name: "Value Over Time" })).toHaveCount(0);
      });
    });

    test("with price-history on: Value Over Time section renders", async ({ browser }) => {
      const sql = loadDb();
      try {
        await clearFlagOverride(sql, state.userId, "price-history");
      } finally {
        await sql.end();
      }

      await withSignedInContext(state.user, browser, async (context) => {
        const page = await context.newPage();
        await page.goto("/collections/stats");

        await expect(page.getByRole("heading", { name: "Value Over Time" })).toBeVisible({
          timeout: 15_000,
        });
      });
    });
  });
});
