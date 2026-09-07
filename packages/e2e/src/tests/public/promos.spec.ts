import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { API_BASE_URL, WEB_BASE_URL } from "../../helpers/constants.js";

const PROMOS_TITLE = "Promo Cards - OpenRift";
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
  sets: { id: string; slug: string }[];
  languages: string[];
}

async function fetchPromoList(language = "EN"): Promise<PromoFixture> {
  const res = await fetch(`${API_BASE_URL}/api/v1/promos?language=${language}`);
  if (!res.ok) {
    throw new Error(`/api/v1/promos fetch failed: ${res.status}`);
  }
  return (await res.json()) as PromoFixture;
}

// TanStack Start encodes the server fn id as base64url-encoded JSON containing
// the source file + export.
function isPromoListServerFn(url: string): boolean {
  const match = /\/_serverFn\/(?<encoded>[^/?#]+)/u.exec(url);
  const encoded = match?.groups?.encoded;
  if (encoded === undefined) {
    return false;
  }
  try {
    return Buffer.from(encoded, "base64url").toString("utf-8").includes("fetchPromoList");
  } catch {
    return false;
  }
}

// SSR resolves the loader server-side and bypasses page.route intercepts, so
// this drives a client navigation via the mobile drawer (the desktop "More"
// menu is a hover-driven BaseUI NavigationMenu Playwright can't open reliably).
async function clientSideNavigateToPromos(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cards");

  const menuButton = page.getByRole("button", { name: "Open menu" });
  await expect(menuButton).toBeVisible({ timeout: 15_000 });

  // Retry opening it (guards a click landing on the pre-hydration button); only
  // click while closed so a late-firing click never toggles it shut.
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await menuButton.click();
    }
    await expect(dialog).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });

  // Nav rows are SheetClose buttons, not links, so match by text.
  const promosItem = dialog.getByText("Promos", { exact: true });
  await expect(promosItem).toBeVisible();
  await promosItem.click();
}

test.describe("promos", () => {
  test.describe("rendering", () => {
    test("redirects to a language and renders the heading and intro paragraph", async ({
      page,
    }) => {
      await page.goto("/promos");

      await expect(page).toHaveURL(/\/promos\/EN$/u, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1, name: "Promos" })).toBeVisible();
      await expect(
        page.getByText(/All the cards you can.t pull from booster packs\./u),
      ).toBeVisible();
    });

    test("sets document title, description meta, and canonical", async ({ page }) => {
      await page.goto("/promos");

      await expect(page).toHaveTitle(PROMOS_TITLE);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        PROMOS_DESCRIPTION,
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${WEB_BASE_URL}/promos/EN`,
      );
    });

    test("renders the language aggregate line and channel section dividers", async ({ page }) => {
      const data = await fetchPromoList();
      const enPrintings = data.printings.filter((printing) => printing.language === "EN");
      test.skip(enPrintings.length === 0, "seed has no EN promo printings");

      await page.goto("/promos");
      await expect(page.getByRole("heading", { level: 1, name: "Promos" })).toBeVisible();

      await expect(
        page.getByText(
          /OpenRift currently has data on \d+ English promo printings? across \d+ cards?\./u,
        ),
      ).toBeVisible();

      // Channels render as <section id="lang-EN-ch-..."> with a "(N)" count in the divider.
      const firstSection = page.locator("section[id^='lang-EN-ch-']").first();
      await expect(firstSection).toBeVisible();
      await expect(firstSection).toContainText(/\(\d+\)/u);
    });
  });

  test.describe("empty state", () => {
    test("renders 'No promos yet.' when there are no printings", async ({ page }) => {
      await page.route("**/_serverFn/**", async (route) => {
        if (isPromoListServerFn(route.request().url())) {
          // Plain JSON skips the seroval deserializer; still needs the `{result}`
          // envelope createServerFn's client middleware unwraps.
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              result: {
                channels: [],
                cards: {},
                printings: [],
                sets: [],
                languages: [],
              },
            }),
          });
          return;
        }
        await route.continue();
      });

      await clientSideNavigateToPromos(page);

      // No printings means the loader can't pick a language, so the index stays put.
      await expect(page).toHaveURL(/\/promos$/u, { timeout: 15_000 });
      await expect(page.getByText("No promos yet.")).toBeVisible();
      await expect(page.locator(".aspect-card")).toHaveCount(0);
    });
  });

  test.describe("view mode", () => {
    test("defaults to grid view and toggles to table view", async ({ page }) => {
      await page.goto("/promos");
      await expect(page.getByRole("heading", { level: 1, name: "Promos" })).toBeVisible();

      const gridButton = page.getByRole("button", { name: "Grid view" });
      const tableButton = page.getByRole("button", { name: "Table view" });

      await expect(gridButton).toHaveAttribute("aria-pressed", "true");
      await expect(tableButton).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByRole("row")).toHaveCount(0);
      await expect(page.locator(".aspect-card").first()).toBeVisible();

      // Retry the click until the pressed state flips (handler wires up after hydration).
      await expect(async () => {
        await tableButton.click();
        await expect(tableButton).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
      }).toPass({ timeout: 15_000 });
      await expect(page.getByRole("row").first()).toBeVisible();

      await expect(async () => {
        await gridButton.click();
        await expect(gridButton).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
      }).toPass({ timeout: 15_000 });
      await expect(page.getByRole("row")).toHaveCount(0);
    });
  });

  test.describe("selection", () => {
    test("clicking a grid card opens the card detail", async ({ page }) => {
      await page.goto("/promos");
      await expect(page.getByRole("heading", { level: 1, name: "Promos" })).toBeVisible();

      // Anchor on a seeded card's art, not "the first tile": filter chips are
      // also <img>-bearing buttons, and imageless cards overlay a "suggest image" link.
      const firstCard = page.getByRole("img", { name: /^Wuju Bladesman, Starter$/u }).first();
      await expect(firstCard).toBeVisible();

      // Modal or docked pane depending on preference; both close controls share a name.
      await expect(async () => {
        await firstCard.click();
        await expect(page.getByRole("button", { name: /close card details/iu })).toBeVisible({
          timeout: 2000,
        });
      }).toPass({ timeout: 15_000 });
      await expect(page).toHaveURL(/\/promos\/EN$/u);
    });

    test("clicking a table row opens the card detail", async ({ page }) => {
      await page.goto("/promos");
      await expect(page.getByRole("heading", { level: 1, name: "Promos" })).toBeVisible();

      const tableButton = page.getByRole("button", { name: "Table view" });
      await expect(async () => {
        await tableButton.click();
        await expect(page.getByRole("row").first()).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 15_000 });

      const firstRow = page.getByRole("row").first();
      await expect(firstRow).toBeVisible();
      await firstRow.click();

      await expect(page.getByRole("button", { name: /close card details/iu })).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // PromosPending is unreachable here: the index loader awaits the promo fetch
  // before redirecting, so the query is already cached when the target route mounts.

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
