import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { cardImage, waitForCatalogLoaded } from "../../helpers/catalog.js";
import { scrollUntilVisible } from "../../helpers/virtualized.js";

// Seed data (apps/api/src/test/fixtures/seed.sql): a single set "Proving
// Grounds" (slug OGS), Unit/Spell/Legend types, and domains Fury/Order/Body/
// Mind/Calm/Chaos. Annie, Fiery is a Fury Unit; Firestorm is a Fury Spell;
// Lux, Illuminated is a Mind Unit. These drive the narrowing assertions.
//
// The filter UI is exercised through the mobile "Options" drawer. On desktop
// the filters live in a container-query left pane (only shown at ≥1720px
// container width) or a collapsible "Show filters" toggle; neither is reliably
// drivable in the dev-server harness (the collapsible toggle's click never
// commits, and the wide left pane never satisfies its container query here).
// The drawer renders the exact same FilterPanelContent, so it covers the real
// filter logic. Card tiles are image-only (name in the art image's alt) and the
// grid is window-virtualized, so cards are located by image role and scrolled
// into view. Domain/type slugs are lowercase in the URL ("fury", "spell") even
// though the badges display capitalized labels.

const CARDS_URL = "/cards";
const FOOTER_BUTTON = /^(?:Done|Show \d+ (?:cards?|printings?))$/u;

/**
 * Open the mobile filter drawer. The toolbar handlers wire up a beat after the
 * grid hydrates, so retry the trigger until the drawer actually appears.
 * @returns The drawer content locator.
 */
async function openFilterDrawer(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-slot="drawer-content"]');
  const options = page.getByRole("button", { name: "Options" });
  await expect(async () => {
    await options.click();
    await expect(drawer).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  return drawer;
}

/**
 * Locate a filter badge inside the drawer by its leading label text. Badges
 * render the label followed by a faceted count (e.g. "Fury6"), so match on a
 * `^Label` prefix rather than an exact string.
 * @returns The first matching badge locator.
 */
function drawerBadge(drawer: Locator, labelPrefix: RegExp): Locator {
  return drawer.locator('[data-slot="badge"]', { hasText: labelPrefix }).first();
}

/**
 * Click a filter badge and wait for its effect to land on the URL. Under load
 * the drawer re-renders continuously (hydration, owned-count bridge), detaching
 * an animated badge mid-click. Retry with a freshly-resolved locator, but only
 * click while the target URL state is not yet reached — the badges cycle
 * (include → exclude → off), so a blind repeat click would over-cycle. A normal
 * click auto-scrolls the badge into the scrollable drawer; a failed attempt is
 * swallowed so the retry loop continues to the assertion.
 * @returns Nothing.
 */
async function toggleDrawerFilter(
  page: Page,
  drawer: Locator,
  labelPrefix: RegExp,
  urlSignal: RegExp,
) {
  await expect(async () => {
    if (!urlSignal.test(page.url())) {
      // dispatchEvent fires the badge's React onClick synchronously without a
      // visibility / scroll / stability wait — the only reliable way to hit a
      // badge in a drawer that re-renders continuously under parallel load. A
      // stale node throws and the fresh locator retries.
      await drawerBadge(drawer, labelPrefix)
        .dispatchEvent("click")
        .catch(() => {});
    }
    await expect(page).toHaveURL(urlSignal, { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Close the drawer via its footer apply button, returning to the grid.
 * @returns Nothing.
 */
async function closeFilterDrawer(page: Page) {
  await page.getByRole("button", { name: FOOTER_BUTTON }).first().click();
  await expect(page.locator('[data-slot="drawer-content"]')).toBeHidden();
}

test.describe("card filters (mobile drawer)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the drawer opens and renders the set, domain, rarity, and type sections", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);

    for (const label of ["Set", "Domain", "Rarity", "Type"]) {
      await expect(drawer.locator("p", { hasText: new RegExp(`^${label}$`, "u") })).toBeVisible();
    }

    // Known badge contents inside the drawer.
    await expect(drawerBadge(drawer, /^Proving Grounds/u)).toBeVisible();
    await expect(drawerBadge(drawer, /^Fury/u)).toBeVisible();
    await expect(drawerBadge(drawer, /^Unit/u)).toBeVisible();
    await expect(drawerBadge(drawer, /^Epic/u)).toBeVisible();

    // The footer apply button carries the live result count.
    await expect(page.getByRole("button", { name: FOOTER_BUTTON })).toBeVisible();
  });

  test("clicking a domain badge narrows the grid, adds a chip, and updates the URL", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);
    await toggleDrawerFilter(page, drawer, /^Fury/u, /domains=[^&]*fury/u);
    // Footer count updates to the narrowed result set.
    await expect(page.getByRole("button", { name: /^Show \d+ cards?$/u })).toBeVisible();

    await closeFilterDrawer(page);

    // Mind-only Lux is filtered out; Fury Annie stays.
    await expect(cardImage(page, "Lux, Illuminated")).toHaveCount(0);
    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));

    // The active-filter strip shows a Fury chip (exact label, no count).
    await expect(page.locator('[data-slot="badge"]', { hasText: /^Fury$/u })).toBeVisible();
  });

  test("combining a domain and a type filter is AND", async ({ page }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);
    await toggleDrawerFilter(page, drawer, /^Fury/u, /domains=[^&]*fury/u);
    await toggleDrawerFilter(page, drawer, /^Spell/u, /[?&]types=[^&]*spell/iu);

    await closeFilterDrawer(page);

    // Fury AND Spell: Firestorm (Fury Spell) stays; Annie (Fury Unit) drops out.
    await expect(cardImage(page, "Annie, Fiery")).toHaveCount(0);
    await scrollUntilVisible(page, cardImage(page, "Firestorm"));
  });

  test("removing a chip restores the hidden cards and drops the query param", async ({ page }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);
    await toggleDrawerFilter(page, drawer, /^Fury/u, /domains=[^&]*fury/u);
    await closeFilterDrawer(page);
    await expect(cardImage(page, "Lux, Illuminated")).toHaveCount(0);

    // Each include chip carries an unnamed X button that removes just that value.
    const furyChip = page.locator('[data-slot="badge"]', { hasText: /^Fury$/u });
    await furyChip.getByRole("button").click();

    await expect(page).not.toHaveURL(/[?&]domains=/u);
    await scrollUntilVisible(page, cardImage(page, "Lux, Illuminated"));
  });

  test("clear-all resets the grid and clears every active chip", async ({ page }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);
    await toggleDrawerFilter(page, drawer, /^Fury/u, /domains=[^&]*fury/u);
    await toggleDrawerFilter(page, drawer, /^Spell/u, /[?&]types=[^&]*spell/iu);
    await closeFilterDrawer(page);
    await expect(cardImage(page, "Lux, Illuminated")).toHaveCount(0);

    await page.getByRole("button", { name: "Clear all filters" }).click();

    await expect(page).not.toHaveURL(/[?&]domains=/u);
    await expect(page).not.toHaveURL(/[?&]types=/u);

    // Full grid is back: both a Fury card and a Mind card are reachable again.
    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
    await scrollUntilVisible(page, cardImage(page, "Lux, Illuminated"));
  });

  test("the energy range slider adds energyMin/energyMax query params", async ({ page }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);

    // The Slider forwards its aria-label to both thumbs, so there are two
    // sliders named "Energy range" — the min thumb (first) and the max (last).
    const thumbs = drawer.getByRole("slider", { name: "Energy range" });
    await expect(thumbs).toHaveCount(2);

    await thumbs.first().focus();
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press("ArrowRight");
    }
    await thumbs.last().focus();
    for (let index = 0; index < 3; index++) {
      await page.keyboard.press("ArrowLeft");
    }

    // energyMin may be the -1 NONE sentinel when only the max thumb moved off
    // the edge — either way both params commit to the URL.
    await expect(page).toHaveURL(/[?&]energyMin=-?\d+/u);
    await expect(page).toHaveURL(/[?&]energyMax=-?\d+/u);
  });

  test("the Errata flag badge cycles include, exclude, then off", async ({ page }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);

    // Tri-state cycle: null → true → false → null (ADR-034). Each click waits
    // for its URL signal so a detached-mid-click retry never double-toggles.
    await toggleDrawerFilter(page, drawer, /^Errata/u, /[?&]errata=true/u);
    await toggleDrawerFilter(page, drawer, /^Errata/u, /[?&]errata=false/u);

    await expect(async () => {
      if (/[?&]errata=/u.test(page.url())) {
        await drawerBadge(drawer, /^Errata/u)
          .dispatchEvent("click")
          .catch(() => {});
      }
      await expect(page).not.toHaveURL(/[?&]errata=/u, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
  });
});
