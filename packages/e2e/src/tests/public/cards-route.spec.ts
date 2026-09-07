import { expect, test } from "@playwright/test";

import { WEB_BASE_URL } from "../../helpers/constants.js";

const CARDS_DESCRIPTION =
  "Complete Riftbound TCG card database with marketplace price comparison. Filter by set, domain, rarity, cost, and keyword to browse every card and printing.";

// TanStack Start encodes the server fn id as base64url-encoded JSON containing
// the source file + export.
function isCatalogServerFn(url: string): boolean {
  const match = /\/_serverFn\/(?<encoded>[^/?#]+)/u.exec(url);
  const encoded = match?.groups?.encoded;
  if (encoded === undefined) {
    return false;
  }
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf-8");
    return decoded.includes("fetchCatalog");
  } catch {
    return false;
  }
}

test.describe("/cards route essentials", () => {
  test("sets SEO meta and canonical tags", async ({ page }) => {
    await page.goto("/cards");

    await expect(page).toHaveTitle(/Cards/u);

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", CARDS_DESCRIPTION);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", `${WEB_BASE_URL}/cards`);

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Cards/u);

    const ogDescription = page.locator('meta[property="og:description"]');
    await expect(ogDescription).toHaveAttribute("content", CARDS_DESCRIPTION);

    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", "website");

    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl).toHaveAttribute("content", `${WEB_BASE_URL}/cards`);

    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", `${WEB_BASE_URL}/og-image.png`);

    const ogSiteName = page.locator('meta[property="og:site_name"]');
    await expect(ogSiteName).toHaveAttribute("content", "OpenRift");

    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveAttribute("content", "summary_large_image");

    const twitterTitle = page.locator('meta[name="twitter:title"]');
    await expect(twitterTitle).toHaveAttribute("content", /Cards/u);

    const twitterDescription = page.locator('meta[name="twitter:description"]');
    await expect(twitterDescription).toHaveAttribute("content", CARDS_DESCRIPTION);

    const twitterImage = page.locator('meta[name="twitter:image"]');
    await expect(twitterImage).toHaveAttribute("content", `${WEB_BASE_URL}/og-image.png`);
  });

  // Playwright hovers before clicking, so `/cards` links preload on intent and
  // the pendingComponent never mounts: unobservable in this harness.
  test.skip("renders the pending skeleton while the catalog query is in flight", () => {});

  test("renders the error fallback when the catalog fetch fails", async ({ page }) => {
    // Client navigations hit /api/v1/catalog directly; SSR hits _serverFn.
    // Fail both so the test works regardless of which path the loader takes.
    await page.route("**/api/v1/catalog*", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "catalog unavailable" }),
      });
    });
    await page.route("**/_serverFn/**", async (route) => {
      if (isCatalogServerFn(route.request().url())) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "catalog unavailable" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/");
    await page.getByRole("link", { name: /browse cards/iu }).click();

    // RouteErrorFallback picks a heading at random from error-message.tsx.
    const errorHeadings = [
      "The Rift collapsed",
      "Critical misprint detected",
      "This page pulled a blank",
      "Shuffled into the void",
      "Well, that wasn't supposed to happen",
      "We drew a bug",
      "Something broke (no, you can't grade it)",
      "That's not ideal",
      "Yeah, that's a bug",
    ];
    const headingPattern = new RegExp(
      errorHeadings
        .map((heading) => heading.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
        .join("|"),
      "u",
    );
    // Scope by name: strict mode briefly sees two h1s during the transition.
    await expect(page.getByRole("heading", { level: 1, name: headingPattern })).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Show details/u })).toBeVisible();
  });
});
