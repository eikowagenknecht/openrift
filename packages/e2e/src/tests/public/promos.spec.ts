import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { API_BASE_URL, WEB_BASE_URL } from "../../helpers/constants.js";

// /promos is now a per-language card-browser surface: the index route redirects
// to /promos/$language (EN by default) and the page renders like /cards —
// grouped channel sections, a grid/table view toggle, and a click-to-open
// detail pane. There is no per-language <h2> and clicking a card opens the
// selection pane rather than navigating to /cards/<slug>.
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

// Client-side navigation to /promos so a `page.route` intercept on the promo
// list server fn actually fires — the SSR path resolves the loader on the
// server and bypasses the browser network layer. The desktop header "More"
// dropdown is a hover-driven BaseUI NavigationMenu that Playwright can't open
// reliably, so drive the click-based mobile drawer instead: it opens on a
// plain click and always exposes a Promos link.
async function clientSideNavigateToPromos(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cards");

  const menuButton = page.getByRole("button", { name: "Open menu" });
  await expect(menuButton).toBeVisible({ timeout: 15_000 });

  // The drawer's open handler wires up after hydration; retry opening it until
  // the dialog is actually rendered, guarding against a click that lands on the
  // pre-hydration button. Only click when the dialog is closed so a late-firing
  // click never toggles it shut.
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await menuButton.click();
    }
    await expect(dialog).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });

  // The nav rows are SheetClose buttons (not links), so match by text and click
  // to both close the drawer and client-navigate to /promos.
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

      // The index redirects to /promos/<language> (EN by default in the seed).
      await expect(page).toHaveURL(/\/promos\/EN$/u, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1, name: "Promos" })).toBeVisible();
      await expect(
        page.getByText(/Promos are all the cards you can.t get by just opening booster packs/u),
      ).toBeVisible();
    });

    test("sets document title, description meta, and canonical", async ({ page }) => {
      await page.goto("/promos");

      await expect(page).toHaveTitle(PROMOS_TITLE);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        PROMOS_DESCRIPTION,
      );
      // Canonical points at the resolved per-language URL.
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

      // Per-language aggregate sentence under the intro paragraph.
      await expect(
        page.getByText(
          /OpenRift currently has data on \d+ English promo printings? across \d+ cards?\./u,
        ),
      ).toBeVisible();

      // Channels render as <section id="lang-EN-ch-..."> with a divider header
      // carrying a "(N)" printing count — there are no per-channel headings.
      const firstSection = page.locator("section[id^='lang-EN-ch-']").first();
      await expect(firstSection).toBeVisible();
      await expect(firstSection).toContainText(/\(\d+\)/u);
    });
  });

  test.describe("empty state", () => {
    test("renders 'No promos yet.' when there are no printings", async ({ page }) => {
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

      // With no printings the loader can't pick a language, so the index route
      // stays put and renders its empty state instead of redirecting.
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

      // Grid view is the default: the toggle reflects it and the CardTable
      // header (role="table") is absent while card thumbnails are shown.
      await expect(gridButton).toHaveAttribute("aria-pressed", "true");
      await expect(tableButton).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByRole("table")).toHaveCount(0);
      await expect(page.locator(".aspect-card").first()).toBeVisible();

      // The view toggle handler wires up after hydration, so retry the click
      // until the pressed state flips.
      await expect(async () => {
        await tableButton.click();
        await expect(tableButton).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
      }).toPass({ timeout: 15_000 });
      await expect(page.getByRole("table").first()).toBeVisible();

      await expect(async () => {
        await gridButton.click();
        await expect(gridButton).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
      }).toPass({ timeout: 15_000 });
      await expect(page.getByRole("table")).toHaveCount(0);
    });
  });

  test.describe("selection", () => {
    test("clicking a grid card opens the card detail", async ({ page }) => {
      await page.goto("/promos");
      await expect(page.getByRole("heading", { level: 1, name: "Promos" })).toBeVisible();

      // Anchor on a seeded card's art rather than "the first tile": the domain
      // and rarity filter chips are buttons with <img> icons too, and a card
      // still awaiting an image overlays its thumbnail with a "suggest image"
      // link that navigates to /contribute instead of selecting the card.
      // Master Yi is the first promo in the seed that has real art.
      const firstCard = page.getByRole("img", { name: /Master Yi, Wuju Bladesman/u }).first();
      await expect(firstCard).toBeVisible();

      // Clicking a card selects it and opens the card detail rather than
      // navigating. Which surface that is depends on the docked-pane
      // preference (modal by default), and all three name their close control
      // "Close card details".
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
        await expect(page.getByRole("table").first()).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 15_000 });

      const firstRow = page.getByRole("row").first();
      await expect(firstRow).toBeVisible();
      await firstRow.click();

      await expect(page.getByRole("button", { name: /close card details/iu })).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  // Note: PromosPending (the loading skeleton) is the pendingComponent on the
  // /promos/$language route, but it is unreachable from a client navigation in
  // this harness. The /promos index loader awaits the promo fetch *before*
  // throwing its redirect, so a slow fetch is consumed on the index route
  // (which has no skeleton); by the time /promos/$language mounts the query is
  // already cached and resolves instantly. The skeleton would only stream on a
  // direct SSR load of /promos/$language, whose server-side fetch can't be
  // intercepted with page.route. There is no client-side link straight to
  // /promos/$language to force the loader to run in the browser, so this state
  // has no reliable e2e trigger after the index-redirect redesign.

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
