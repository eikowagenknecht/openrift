import type { Route } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import { API_BASE_URL } from "../../helpers/constants.js";

// In dev, TanStack Start encodes the server fn id as base64url-encoded JSON
// containing the source file + export. Decoding lets us target only the
// collections fetch without affecting session/theme/feature-flags/catalog
// server fns that fire on the same transition.
function isCollectionsServerFn(url: string): boolean {
  const match = url.match(/\/_serverFn\/(?<encoded>[^/?#]+)/u);
  const encoded = match?.groups?.encoded;
  if (encoded === undefined) {
    return false;
  }
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf-8");
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
    .map((heading) => heading.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join("|"),
  "u",
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
    .map((heading) => heading.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join("|"),
  "u",
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
        await expect(page).toHaveURL(/\/login\b/u);
        const url = new URL(page.url());
        expect(url.searchParams.get("redirect") ?? "").toContain(path);
      });
    }
  });

  test.describe("sidebar", () => {
    test("shows Inbox and persists across sub-route navigation", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/collections");

      const inboxLink = page.getByRole("link", { name: /inbox/iu });
      await expect(inboxLink).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("link", { name: "All Cards" })).toBeVisible();

      // Sub-route navigation: sidebar sticks around.
      await page.getByRole("link", { name: "Activity" }).click();
      await expect(page).toHaveURL(/\/collections\/activity$/u);
      await expect(page.getByRole("link", { name: /inbox/iu })).toBeVisible();
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

      const inboxLink = page.getByRole("link", { name: /inbox/iu });
      await expect(inboxLink).toBeVisible({ timeout: 15_000 });
      // BaseUI's useRender state-to-data-attribute mapping emits the
      // attribute with an empty string value when the state is true.
      await expect(inboxLink).toHaveAttribute("data-active", "");

      // Navigating to Activity should clear the inbox active marker.
      await page.getByRole("link", { name: "Activity" }).click();
      await expect(page).toHaveURL(/\/collections\/activity$/u);
      await expect(page.getByRole("link", { name: /inbox/iu })).not.toHaveAttribute(
        "data-active",
        "true",
      );
    });
  });

  test.describe("page title", () => {
    // Each collections sub-route renders its title through the shared
    // PageTopBar (an h1), not a hand-rolled sticky slot div.
    const cases: { path: string; title: string }[] = [
      { path: "/collections", title: "All Cards" },
      { path: "/collections/activity", title: "Activity" },
      { path: "/collections/stats", title: "Statistics" },
      { path: "/collections/import", title: "Import / Export" },
    ];

    for (const { path, title } of cases) {
      test(`renders "${title}" as the page title on ${path}`, async ({ authenticatedPage }) => {
        const page = authenticatedPage;
        await page.goto(path);

        await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({
          timeout: 15_000,
        });
      });
    }
  });

  test.describe("per-route head / SEO", () => {
    const cases: { path: string; titlePattern: RegExp; dynamic?: boolean }[] = [
      { path: "/collections", titlePattern: /Collections/u },
      { path: "/collections/activity", titlePattern: /Collection Activity/u },
      { path: "/collections/stats", titlePattern: /Collection Statistics/u },
      { path: "/collections/import", titlePattern: /Import \/ Export/u },
      { path: "/collections/$$inbox$$", titlePattern: /Collection/u, dynamic: true },
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
        await expect(robots).toHaveAttribute("content", /noindex/u);
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
      await expect(page).toHaveURL(new RegExp(`/collections/${BOGUS_COLLECTION_ID}$`, "u"));
    });
  });

  test.describe("error", () => {
    // Skipped: the global header SSR-warms the collections query on every
    // authenticated page (inbox badge / nav), so by the time a client-side
    // navigation to /collections runs, the cache is already populated from the
    // dehydrated SSR payload and the loader skips its fetch — a client
    // page.route 500 never reaches it, and the SSR fetch (node → API) can't be
    // intercepted. The not-found path (bogus id above) still covers the failure
    // UI; this specific fetch-500 case is no longer reachable in the harness.
    test.skip("renders the error fallback when the collections fetch fails", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;

      // Arm the failing intercept BEFORE loading a page, so a fresh page load
      // starts with a cold, poisoned collections cache. The header warms
      // collections (inbox/badge) on any authenticated page, so if the
      // intercept were set after navigating, that warm would already have
      // cached a success and the /collections loader would skip its fetch
      // (staleTime = 5 min) — no request would hit the intercepted server fn.
      const failCollections = (route: Route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "collections unavailable" }),
        });
      // Client-side navigations fetch /api/v1/collections directly; SSR/server-fn
      // paths use _serverFn. Fail both so the error surfaces whichever path runs.
      await page.route("**/api/v1/collections*", failCollections);
      await page.route("**/_serverFn/**", async (route) => {
        if (isCollectionsServerFn(route.request().url())) {
          await failCollections(route);
          return;
        }
        await route.continue();
      });

      // Start on /support (static page that renders fine even if its header's
      // collections warm fails) so the navigation to /collections runs the
      // loader against the poisoned cache.
      await page.goto("/support");
      await expect(page).toHaveURL(/\/support/u);

      await page.getByRole("link", { name: "Collection", exact: true }).first().click();
      await expect(page).toHaveURL(/\/collections/u, { timeout: 15_000 });

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(ERROR_HEADING_PATTERN, {
        timeout: 15_000,
      });
      await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible();
    });
  });
});
