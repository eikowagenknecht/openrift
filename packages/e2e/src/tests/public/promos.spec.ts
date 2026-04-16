import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { API_BASE_URL, WEB_BASE_URL } from "../../helpers/constants.js";

const PROMOS_TITLE = "Promo Cards — Riftbound — OpenRift";
const PROMOS_DESCRIPTION =
  "Browse all promotional card printings for the Riftbound trading card game, grouped by promo type.";

interface PromoFixtureChannel {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  kind: string;
}

interface PromoFixturePrinting {
  id: string;
  cardId: string;
  language: string;
  distributionChannels: { channel: PromoFixtureChannel; distributionNote: string | null }[];
}

interface PromoFixture {
  channels: PromoFixtureChannel[];
  cards: Record<string, unknown>;
  printings: PromoFixturePrinting[];
  prices: Record<string, unknown>;
}

async function fetchPromoList(): Promise<PromoFixture> {
  const res = await fetch(`${API_BASE_URL}/api/v1/promos`);
  if (!res.ok) {
    throw new Error(`/api/v1/promos fetch failed: ${res.status}`);
  }
  return (await res.json()) as PromoFixture;
}

// TanStack Start encodes the server fn id as base64url-encoded JSON holding
// the source file + export. Decoding lets us pick out the promo list call
// without touching other server fns on the same route transition.
function isPromoListServerFn(url: string): boolean {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) {
    return false;
  }
  try {
    return Buffer.from(match[1], "base64url").toString("utf-8").includes("fetchPromoList");
  } catch {
    return false;
  }
}

// Client-side navigation to /promos via the header "More" dropdown, so any
// `page.route` intercept on the server fn actually fires (the initial SSR
// path bypasses the browser network layer).
async function clientSideNavigateToPromos(page: Page) {
  // Start on /cards — SSR-renders without hitting the promo list server fn.
  await page.goto("/cards");
  await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 15_000 });

  const moreTrigger = page.getByRole("button", { name: /^More$/ }).first();
  await moreTrigger.hover();
  const promosLink = page.getByRole("link", { name: /^Promos/ }).first();
  await expect(promosLink).toBeVisible();
  await promosLink.click();
  await expect(page).toHaveURL(/\/promos$/, { timeout: 15_000 });
}

test.describe("promos", () => {
  test.describe("rendering", () => {
    test("renders the page heading and intro paragraph", async ({ page }) => {
      await page.goto("/promos");

      await expect(page.getByRole("heading", { level: 1, name: "Promo Cards" })).toBeVisible();
      await expect(
        page.getByText(/Promos are alternate printings distributed outside booster products/),
      ).toBeVisible();
    });

    test("sets document title and description meta", async ({ page }) => {
      await page.goto("/promos");

      await expect(page).toHaveTitle(PROMOS_TITLE);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        PROMOS_DESCRIPTION,
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${WEB_BASE_URL}/promos`,
      );
    });

    test("renders at least one promo type section with h2 and printing count", async ({ page }) => {
      const data = await fetchPromoList();
      const eventChannels = data.channels.filter((c) => c.kind === "event");
      test.skip(eventChannels.length === 0, "seed has no event channels");
      const firstChannel = eventChannels[0];
      const expectedCount = data.printings.filter(
        (p) =>
          p.language === "EN" &&
          p.distributionChannels.some((link) => link.channel.id === firstChannel.id),
      ).length;
      test.skip(expectedCount === 0, "first event channel has no EN printings");

      await page.goto("/promos");

      await expect(page.getByRole("heading", { level: 2, name: firstChannel.label })).toBeVisible();

      // Printing count paragraph sits directly under the h2, singular vs
      // plural based on count. With the default EN filter, only EN printings
      // are in view for this channel.
      const section = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { level: 2, name: firstChannel.label }) });
      const countText = expectedCount === 1 ? "1 printing" : `${expectedCount} printings`;
      await expect(section.getByText(countText, { exact: true })).toBeVisible();
    });
  });

  test.describe("empty state", () => {
    test("renders 'No event channels yet.' and hides the language filter", async ({ page }) => {
      await page.route("**/_serverFn/**", async (route) => {
        if (isPromoListServerFn(route.request().url())) {
          // Plain JSON with no `x-tss-serialized` header — skips the seroval
          // deserializer in serverFnFetcher.ts. The payload must still be
          // wrapped in the `{result}` envelope that createServerFn's client
          // middleware unwraps (see createServerFn.ts → `return result.result`).
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              result: {
                channels: [],
                cards: {},
                printings: [],
                prices: {},
              },
            }),
          });
          return;
        }
        await route.continue();
      });

      await clientSideNavigateToPromos(page);

      await expect(page.getByText("No event channels yet.")).toBeVisible();
      await expect(page.getByText(/^Languages:$/)).toHaveCount(0);
      // No h2 sections rendered.
      await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
    });
  });

  test.describe("language filter", () => {
    test("hides the language filter when only one language is present", async ({ page }) => {
      // Real seed only has EN promo printings (see apps/api/src/test/fixtures/seed.sql),
      // which exercises the `presentLanguages.length > 1` gate in promos.lazy.tsx.
      const data = await fetchPromoList();
      const languages = new Set(data.printings.map((p) => p.language));
      test.skip(
        languages.size !== 1,
        "seed has multiple promo languages — covered by the multi-language test",
      );

      await page.goto("/promos");
      await expect(page.getByRole("heading", { level: 1, name: "Promo Cards" })).toBeVisible();

      // Language picker row is absent entirely.
      await expect(page.getByText("Languages:", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "English" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^(Clear|Select) all$/ })).toHaveCount(0);
    });

    test("shows per-language toggle and clear/select-all when multiple languages exist", async ({
      page,
    }) => {
      const data = await fetchPromoList();
      const languages = new Set(data.printings.map((p) => p.language));
      test.skip(
        languages.size < 2,
        "seed has only one promo language — multi-language branch not covered by real data",
      );

      await page.goto("/promos");

      await expect(page.getByText("Languages:", { exact: true })).toBeVisible();
      // At least two language buttons render.
      for (const lang of languages) {
        // Use the code as a fallback if the label lookup hasn't populated,
        // but the label map should normally resolve (e.g. EN → "English").
        const button = page.getByRole("button", {
          name: new RegExp(`^(${lang}|English|French|Chinese|German|Spanish)$`),
        });
        await expect(button.first()).toBeVisible();
      }
      await expect(page.getByRole("button", { name: /^(Clear|Select) all$/ })).toBeVisible();
    });
  });

  test.describe("view mode", () => {
    test("defaults to grid view and toggles to list view", async ({ page }) => {
      await page.goto("/promos");
      await expect(page.getByRole("heading", { level: 1, name: "Promo Cards" })).toBeVisible();
      // Wait for hydration before clicking — without this the click can land
      // on the static SSR button before React attaches the onClick handler.
      await page.waitForLoadState("networkidle");

      const gridButton = page.getByRole("button", { name: "Grid view" });
      const listButton = page.getByRole("button", { name: "List view" });

      await expect(gridButton).toHaveAttribute("aria-pressed", "true");
      await expect(listButton).toHaveAttribute("aria-pressed", "false");

      // Grid: card thumbnails are .aspect-card elements.
      await expect(page.locator(".aspect-card").first()).toBeVisible();
      // No <table> in grid mode.
      await expect(page.locator("table")).toHaveCount(0);

      await listButton.click();

      await expect(gridButton).toHaveAttribute("aria-pressed", "false");
      await expect(listButton).toHaveAttribute("aria-pressed", "true");
      // Desktop renders a table; the mobile stacked variant is hidden on wide viewports.
      await expect(page.locator("table").first()).toBeVisible();

      await gridButton.click();
      await expect(gridButton).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("table")).toHaveCount(0);
      await expect(page.locator(".aspect-card").first()).toBeVisible();
    });
  });

  test.describe("navigation", () => {
    test("grid thumbnails navigate to /cards/<slug>", async ({ page }) => {
      const data = await fetchPromoList();
      test.skip(
        data.channels.filter((c) => c.kind === "event").length === 0,
        "seed has no event channels",
      );

      await page.goto("/promos");
      await expect(page.getByRole("heading", { level: 1, name: "Promo Cards" })).toBeVisible();
      await page.waitForLoadState("networkidle");

      await page.locator(".aspect-card").first().click();

      await expect(page).toHaveURL(/\/cards\/[^/]+$/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });

    test("list-view rows navigate to /cards/<slug>", async ({ page }) => {
      const data = await fetchPromoList();
      test.skip(
        data.channels.filter((c) => c.kind === "event").length === 0,
        "seed has no event channels",
      );

      await page.goto("/promos");
      await expect(page.getByRole("heading", { level: 1, name: "Promo Cards" })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "List view" }).click();
      const firstRow = page.locator("table tbody tr").first();
      await expect(firstRow).toBeVisible();
      await firstRow.click();

      await expect(page).toHaveURL(/\/cards\/[^/]+$/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  });

  test.describe("pending", () => {
    test("renders the skeleton while the promo list query is in flight", async ({ page }) => {
      // Loader delay must comfortably exceed the router's defaultPendingMs
      // (1000ms) so PromosPending has time to mount and stay visible. The
      // router preloads on hover (defaultPreload: "intent"), so the pending
      // window starts narrowing as soon as Playwright moves the mouse over
      // the link — keep this generous.
      await page.route("**/_serverFn/**", async (route) => {
        if (isPromoListServerFn(route.request().url())) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        await route.continue();
      });

      await page.goto("/cards");
      await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 15_000 });

      const moreTrigger = page.getByRole("button", { name: /^More$/ }).first();
      await moreTrigger.hover();
      await page
        .getByRole("link", { name: /^Promos/ })
        .first()
        .click();

      // PromosPending renders Skeleton elements (data-slot="skeleton") before
      // the loader resolves; the real PromosPage h1 only mounts after.
      await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible({ timeout: 4000 });
      await expect(page.getByRole("heading", { level: 1, name: "Promo Cards" })).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test.describe("error", () => {
    test("renders the route error fallback when the promo list fetch 500s", async ({ page }) => {
      await page.route("**/_serverFn/**", async (route) => {
        if (isPromoListServerFn(route.request().url())) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "promos unavailable" }),
          });
          return;
        }
        await route.continue();
      });

      await clientSideNavigateToPromos(page);

      await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible({
        timeout: 15_000,
      });
    });
  });
});
