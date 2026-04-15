import { expect, test } from "@playwright/test";

import { WEB_BASE_URL } from "../../helpers/constants.js";

const CARDS_DESCRIPTION =
  "Complete Riftbound TCG card database with marketplace price comparison. Filter by set, domain, rarity, cost, and keyword to browse every card and printing.";

// In dev, TanStack Start encodes the server fn id as base64url-encoded JSON
// containing the source file + export. Decoding lets us single out the
// catalog fetch without affecting the session/theme/feature-flags server fns
// that fire on the same route transition.
function isCatalogServerFn(url: string): boolean {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) {
    return false;
  }
  try {
    const decoded = Buffer.from(match[1], "base64url").toString("utf8");
    return decoded.includes("fetchCatalog");
  } catch {
    return false;
  }
}

test.describe("/cards route essentials", () => {
  test("sets SEO meta and canonical tags", async ({ page }) => {
    await page.goto("/cards");

    await expect(page).toHaveTitle(/Cards/);

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", CARDS_DESCRIPTION);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", `${WEB_BASE_URL}/cards`);

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /Cards/);

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
    await expect(twitterTitle).toHaveAttribute("content", /Cards/);

    const twitterDescription = page.locator('meta[name="twitter:description"]');
    await expect(twitterDescription).toHaveAttribute("content", CARDS_DESCRIPTION);

    const twitterImage = page.locator('meta[name="twitter:image"]');
    await expect(twitterImage).toHaveAttribute("content", `${WEB_BASE_URL}/og-image.png`);
  });

  test("renders the pending skeleton while the catalog query is in flight", async ({ page }) => {
    // Delay only the catalog server fn. Other server fns (session, theme,
    // feature flags, site settings) pass through so the shell can render.
    await page.route("**/_serverFn/**", async (route) => {
      if (isCatalogServerFn(route.request().url())) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await route.continue();
    });

    // Start on the home page (SSR-rendered, no catalog fetch needed) so
    // the navigation to /cards happens client-side and runs the loader
    // against our intercepted server fn.
    await page.goto("/");
    await expect(page.getByRole("link", { name: /browse cards/i })).toBeVisible();

    await page.getByRole("link", { name: /browse cards/i }).click();

    // The skeleton grid contains 20 card-shaped Skeleton elements; the real
    // CardBrowser never renders `.aspect-card.animate-pulse`, so this
    // locator only matches the pending component.
    const cardSkeletons = page.locator('[data-slot="skeleton"].aspect-card');
    await expect(cardSkeletons.first()).toBeVisible({ timeout: 5000 });
    await expect(cardSkeletons).toHaveCount(20);

    // Cards page URL is reached before the loader resolves.
    await expect(page).toHaveURL(/\/cards/);
  });

  test("renders the error fallback when the catalog fetch fails", async ({ page }) => {
    // Client-side navigations fetch /api/v1/catalog directly (for edge
    // caching); SSR/server-fn paths still hit _serverFn. Fail both so the
    // test works regardless of which path the loader takes.
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
    await page.getByRole("link", { name: /browse cards/i }).click();

    // RouteErrorFallback picks a heading/subtext/emoji at random from the
    // arrays in error-message.tsx, so match against the union of all
    // possible headings rather than a single string.
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
        .map((heading) => heading.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
        .join("|"),
    );
    // Scope by name so we don't race against the home page's <h1> during the
    // client-side transition — otherwise strict mode sees two h1s briefly.
    await expect(page.getByRole("heading", { level: 1, name: headingPattern })).toBeVisible({
      timeout: 10_000,
    });

    // The fallback always renders a "Reshuffle" reload button and a dev
    // details toggle when an error message is attached.
    await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Show details/ })).toBeVisible();
  });
});
