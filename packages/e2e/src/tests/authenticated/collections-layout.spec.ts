import type { Route } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import { API_BASE_URL } from "../../helpers/constants.js";

// TanStack Start encodes the server fn id as base64url(JSON) containing the
// source file + export; decode to target only the collections fetch.
function isCollectionsServerFn(url: string): boolean {
  const match = /\/_serverFn\/(?<encoded>[^/?#]+)/u.exec(url);
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

// Matches any heading in the NOT_FOUND_HEADINGS pool (apps/web/src/components/error-message.tsx).
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

      await page.getByRole("link", { name: "Activity" }).click();
      await expect(page).toHaveURL(/\/collections\/activity$/u);
      await expect(page.getByRole("link", { name: /inbox/iu })).toBeVisible();
      await expect(page.getByRole("link", { name: "All Cards" })).toBeVisible();
    });

    test("marks the active collection with data-active", async ({ authenticatedPage }) => {
      const page = authenticatedPage;

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

      await page.getByRole("link", { name: "Activity" }).click();
      await expect(page).toHaveURL(/\/collections\/activity$/u);
      await expect(page.getByRole("link", { name: /inbox/iu })).not.toHaveAttribute(
        "data-active",
        "true",
      );
    });
  });

  test.describe("page title", () => {
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

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOT_FOUND_HEADING_PATTERN, {
        timeout: 15_000,
      });
      await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();

      await expect(page).toHaveURL(new RegExp(`/collections/${BOGUS_COLLECTION_ID}$`, "u"));
    });
  });

  test.describe("error", () => {
    // Skipped: the global header SSR-warms the collections query, so a client
    // page.route 500 never reaches the loader; the SSR fetch isn't interceptable.
    test.skip("renders the error fallback when the collections fetch fails", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;

      const failCollections = (route: Route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "collections unavailable" }),
        });
      // Client navigations hit /api/v1/collections directly; SSR uses _serverFn.
      await page.route("**/api/v1/collections*", failCollections);
      await page.route("**/_serverFn/**", async (route) => {
        if (isCollectionsServerFn(route.request().url())) {
          await failCollections(route);
          return;
        }
        await route.continue();
      });

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
