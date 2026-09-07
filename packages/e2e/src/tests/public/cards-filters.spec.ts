import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { cardImage, waitForCatalogLoaded } from "../../helpers/catalog.js";
import { scrollUntilVisible } from "../../helpers/virtualized.js";

// Seed data: set OGS "Proving Grounds"; Annie, Fiery is a Fury Unit, Firestorm
// a Fury Spell, Lux, Illuminated a Mind Unit.
// Filters are exercised through the mobile "Options" drawer: the desktop
// container-query pane and collapsible toggle aren't reliably drivable in the
// dev-server harness, but the drawer renders the same FilterPanelContent.

const CARDS_URL = "/cards";
const FOOTER_BUTTON = /^(?:Done|Show \d+ (?:cards?|printings?))$/u;

/**
 * Opens the mobile filter drawer, retrying the trigger until it appears (the
 * toolbar handlers wire up a beat after the grid hydrates).
 */
async function openFilterDrawer(page: Page): Promise<Locator> {
  const drawer = page.locator('[data-slot="drawer-content"]');
  const options = page.getByRole("button", { name: "Options" });
  // A click that lands while the drawer is still opening closes it again, so
  // give each attempt room to settle before the next one.
  await expect(async () => {
    await options.click();
    await expect(drawer).toBeVisible({ timeout: 4000 });
  }).toPass({ timeout: 30_000 });
  return drawer;
}

/**
 * Locates a filter badge by its leading label; badges render the label
 * followed by a faceted count (e.g. "Fury6"), so match a `^Label` prefix.
 */
function drawerBadge(drawer: Locator, labelPrefix: RegExp): Locator {
  return drawer.locator('[data-slot="badge"]', { hasText: labelPrefix }).first();
}

/**
 * Locates one chip in the active-filter strip. A scrolled-in card tile can
 * carry a domain badge with the same label, so require the remove button too.
 */
function activeFilterChip(page: Page, label: RegExp): Locator {
  return page
    .locator('[data-slot="badge"]', { hasText: label })
    .filter({ has: page.locator('[data-slot="chip-remove-button"]') });
}

/**
 * Clicks a filter badge and waits for its effect to land on the URL. Only
 * clicks while the target URL state isn't reached yet — badges cycle
 * include → exclude → off, so a blind repeat click would over-cycle.
 */
async function toggleDrawerFilter(
  page: Page,
  drawer: Locator,
  labelPrefix: RegExp,
  urlSignal: RegExp,
) {
  await expect(async () => {
    if (!urlSignal.test(page.url())) {
      // dispatchEvent fires onClick synchronously without a visibility/stability
      // wait; a stale node throws and the fresh locator retries.
      await drawerBadge(drawer, labelPrefix)
        .dispatchEvent("click")
        .catch(() => {});
    }
    await expect(page).toHaveURL(urlSignal, { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Expands the drawer's "More filters" fold.
 * The panel re-renders while counts settle; a real click never stabilizes.
 */
async function openMoreFilters(drawer: Locator) {
  const trigger = drawer.getByRole("button", { name: "More filters" });
  if ((await trigger.getAttribute("aria-expanded")) === "true") {
    return;
  }
  await trigger.dispatchEvent("click").catch(() => {});
}

async function closeFilterDrawer(page: Page) {
  // The footer button re-renders as the live result count settles; a real click never stabilizes.
  const drawer = page.locator('[data-slot="drawer-content"]');
  await expect(async () => {
    await page
      .getByRole("button", { name: FOOTER_BUTTON })
      .first()
      .dispatchEvent("click")
      .catch(() => {});
    await expect(drawer).toBeHidden({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
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

    await expect(drawerBadge(drawer, /^Proving Grounds/u)).toBeVisible();
    await expect(drawerBadge(drawer, /^Fury/u)).toBeVisible();
    await expect(drawerBadge(drawer, /^Unit/u)).toBeVisible();
    await expect(drawerBadge(drawer, /^Epic/u)).toBeVisible();

    // Label only settles once the live result count does.
    await expect(page.getByRole("button", { name: FOOTER_BUTTON })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("clicking a domain badge narrows the grid, adds a chip, and updates the URL", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);
    await toggleDrawerFilter(page, drawer, /^Fury/u, /domains=[^&]*fury/u);
    await expect(page.getByRole("button", { name: FOOTER_BUTTON })).toBeVisible();

    await closeFilterDrawer(page);

    await expect(cardImage(page, "Lux, Illuminated")).toHaveCount(0);
    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));

    await expect(activeFilterChip(page, /^Fury$/u)).toBeVisible();
  });

  test("combining a domain and a type filter is AND", async ({ page }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);
    await toggleDrawerFilter(page, drawer, /^Fury/u, /domains=[^&]*fury/u);
    await toggleDrawerFilter(page, drawer, /^Spell/u, /[?&]types=[^&]*spell/iu);

    await closeFilterDrawer(page);

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

    await activeFilterChip(page, /^Fury$/u)
      .getByRole("button")
      .click();

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

    // The route writes ?languages= on its own a beat after hydration, which
    // can land on top of an early commit; retry until each one sticks.
    await expect(async () => {
      await thumbs.first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(page).toHaveURL(/[?&]energyMin=-?\d+/u, { timeout: 4000 });
    }).toPass({ timeout: 30_000 });

    await expect(async () => {
      await thumbs.last().focus();
      await page.keyboard.press("ArrowLeft");
      await expect(page).toHaveURL(/[?&]energyMax=-?\d+/u, { timeout: 4000 });
    }).toPass({ timeout: 30_000 });
  });

  test("the Errata flag badge cycles include, exclude, then off", async ({ page }) => {
    await page.goto(CARDS_URL);
    await waitForCatalogLoaded(page);

    const drawer = await openFilterDrawer(page);
    await openMoreFilters(drawer);

    // Tri-state cycle: null → true → false → null. Each filter change
    // re-renders and collapses the fold, so re-open it before each step.
    await toggleDrawerFilter(page, drawer, /^Errata/u, /[?&]errata=true/u);
    await openMoreFilters(drawer);
    await toggleDrawerFilter(page, drawer, /^Errata/u, /[?&]errata=false/u);
    await openMoreFilters(drawer);

    await expect(async () => {
      await openMoreFilters(drawer);
      if (/[?&]errata=/u.test(page.url())) {
        await drawerBadge(drawer, /^Errata/u)
          .dispatchEvent("click")
          .catch(() => {});
      }
      await expect(page).not.toHaveURL(/[?&]errata=/u, { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
  });
});
