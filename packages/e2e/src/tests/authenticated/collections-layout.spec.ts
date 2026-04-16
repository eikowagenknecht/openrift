import { expect, test } from "../../fixtures/test.js";
import { API_BASE_URL } from "../../helpers/constants.js";

// In dev, TanStack Start encodes the server fn id as base64url-encoded JSON
// containing the source file + export. Decoding lets us target only the
// collections fetch without affecting session/theme/feature-flags/catalog
// server fns that fire on the same transition.
function isCollectionsServerFn(url: string): boolean {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) {
    return false;
  }
  try {
    const decoded = Buffer.from(match[1], "base64url").toString("utf-8");
    return decoded.includes("fetchCollections");
  } catch {
    return false;
  }
}

// Matches any of the possible headings from the NOT_FOUND_HEADINGS pool in
// apps/web/src/components/error-message.tsx (picked by pathname hash).
const NOT_FOUND_HEADING_PATTERN = new RegExp(
  [
    "Nothing here but dust",
    "This card was never printed",
    "Lost in the Rift",
    "Page not found",
    "You've wandered off the map",
    "This page doesn't exist",
    "No card at this address",
    "The Rift has no record of this",
  ]
    .map((heading) => heading.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
    .join("|"),
);

// Matches any heading from the HEADINGS pool (error fallback).
const ERROR_HEADING_PATTERN = new RegExp(
  [
    "The Rift collapsed",
    "Critical misprint detected",
    "This page pulled a blank",
    "Shuffled into the void",
    "Well, that wasn't supposed to happen",
    "We drew a bug",
    "Something broke (no, you can't grade it)",
    "That's not ideal",
    "Yeah, that's a bug",
  ]
    .map((heading) => heading.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
    .join("|"),
);

// Valid UUID shape, guaranteed not to match any real collection.
const BOGUS_COLLECTION_ID = "00000000-0000-0000-0000-0000000dead0";

test.describe("collections layout", () => {
  test.describe("auth gate", () => {
    const guardedPaths = [
      "/collections",
      "/collections/activity",
      "/collections/stats",
      "/collections/import",
      `/collections/${BOGUS_COLLECTION_ID}`,
    ];

    for (const path of guardedPaths) {
      test(`redirects anonymous users from ${path} to /login`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveURL(/\/login\b/);
        const url = new URL(page.url());
        expect(url.searchParams.get("redirect") ?? "").toContain(path);
      });
    }
  });

  test.describe("sidebar", () => {
    test("shows Inbox and persists across sub-route navigation", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/collections");

      const inboxLink = page.getByRole("link", { name: /inbox/i });
      await expect(inboxLink).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("link", { name: "All Cards" })).toBeVisible();

      // Sub-route navigation: sidebar sticks around.
      await page.getByRole("link", { name: "Activity" }).click();
      await expect(page).toHaveURL(/\/collections\/activity$/);
      await expect(page.getByRole("link", { name: /inbox/i })).toBeVisible();
      await expect(page.getByRole("link", { name: "All Cards" })).toBeVisible();
    });

    test("marks the active collection with data-active", async ({ authenticatedPage }) => {
      const page = authenticatedPage;

      // Fetch the inbox id from the API so we can visit it directly and
      // verify the active state matches the current route.
      const response = await page.request.get(`${API_BASE_URL}/api/v1/collections`);
      expect(response.ok()).toBe(true);
      const body = (await response.json()) as { items: { id: string; isInbox: boolean }[] };
      const inbox = body.items.find((col) => col.isInbox);
      expect(inbox).toBeDefined();

      await page.goto(`/collections/${inbox?.id ?? ""}`);

      const inboxLink = page.getByRole("link", { name: /inbox/i });
      await expect(inboxLink).toBeVisible({ timeout: 15_000 });
      await expect(inboxLink).toHaveAttribute("data-active", "true");

      // Navigating to Activity should clear the inbox active marker.
      await page.getByRole("link", { name: "Activity" }).click();
      await expect(page).toHaveURL(/\/collections\/activity$/);
      await expect(page.getByRole("link", { name: /inbox/i })).not.toHaveAttribute(
        "data-active",
        "true",
      );
    });
  });

  test.describe("top-bar portal", () => {
    // The CollectionLayout renders an empty `<div class="px-3 pt-3" />` above
    // the sidebar row, and each sub-route's component portals its PageTopBar
    // into that slot. Asserting the text lives inside that div proves the
    // portal is wired up (vs. matching sidebar link text elsewhere).
    const cases: { path: string; title: RegExp | string }[] = [
      { path: "/collections", title: "All Cards" },
      { path: "/collections/activity", title: "Activity" },
      { path: "/collections/stats", title: "Statistics" },
      { path: "/collections/import", title: "Import / Export" },
    ];

    for (const { path, title } of cases) {
      test(`renders "${title}" in the top-bar slot on ${path}`, async ({ authenticatedPage }) => {
        const page = authenticatedPage;
        await page.goto(path);

        const topBarSlot = page.locator("div.px-3.pt-3").first();
        await expect(topBarSlot).toContainText(title, { timeout: 15_000 });
      });
    }
  });

  test.describe("per-route head / SEO", () => {
    const cases: { path: string; titlePattern: RegExp; dynamic?: boolean }[] = [
      { path: "/collections", titlePattern: /Collections/ },
      { path: "/collections/activity", titlePattern: /Collection Activity/ },
      { path: "/collections/stats", titlePattern: /Collection Statistics/ },
      { path: "/collections/import", titlePattern: /Import \/ Export/ },
      { path: "/collections/$$inbox$$", titlePattern: /Collection/, dynamic: true },
    ];

    for (const { path, titlePattern, dynamic } of cases) {
      test(`sets title and noindex robots meta on ${path}`, async ({ authenticatedPage }) => {
        const page = authenticatedPage;

        let targetPath = path;
        if (dynamic) {
          const response = await page.request.get(`${API_BASE_URL}/api/v1/collections`);
          expect(response.ok()).toBe(true);
          const body = (await response.json()) as { items: { id: string; isInbox: boolean }[] };
          const inbox = body.items.find((col) => col.isInbox);
          expect(inbox).toBeDefined();
          targetPath = `/collections/${inbox?.id ?? ""}`;
        }

        await page.goto(targetPath);
        await expect(page).toHaveTitle(titlePattern, { timeout: 15_000 });

        const robots = page.locator('meta[name="robots"]');
        await expect(robots).toHaveAttribute("content", /noindex/);
      });
    }
  });

  test.describe("invalid collection id", () => {
    test("renders the not-found fallback for a nonexistent collection", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await page.goto(`/collections/${BOGUS_COLLECTION_ID}`);

      // Loader throws notFound() → bubbles to the router-level RouteNotFoundFallback.
      // The heading is picked at random from NOT_FOUND_HEADINGS (seeded by pathname).
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOT_FOUND_HEADING_PATTERN, {
        timeout: 15_000,
      });
      await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();

      // Still on the bogus URL (this is notFound, not redirect).
      await expect(page).toHaveURL(new RegExp(`/collections/${BOGUS_COLLECTION_ID}$`));
    });
  });

  test.describe("error", () => {
    test("renders the error fallback when the collections fetch fails", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;

      // Start on /cards (it doesn't load the collections query) so the
      // navigation to /collections runs the loader client-side through
      // the intercepted server fn.
      await page.goto("/cards");
      await expect(page).toHaveURL(/\/cards/);

      await page.route("**/_serverFn/**", async (route) => {
        if (isCollectionsServerFn(route.request().url())) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "collections unavailable" }),
          });
          return;
        }
        await route.continue();
      });

      await page.getByRole("link", { name: "Collection", exact: true }).first().click();
      await expect(page).toHaveURL(/\/collections/, { timeout: 15_000 });

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(ERROR_HEADING_PATTERN, {
        timeout: 15_000,
      });
      await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible();
    });
  });
});
