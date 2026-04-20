import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// Seed data (see apps/api/src/test/fixtures/seed.sql) contains a single set
// ("Proving Grounds", slug OGS), Unit/Spell/Legend types, and domains including
// Fury, Order, Body, Mind, Calm, Chaos. Lux, Illuminated is a Mind-only Unit;
// Incinerate is a Fury Spell. We rely on these to assert narrowing behavior.

const CARDS_URL = "/cards";

async function waitForCardsLoaded(page: Page) {
  await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 15_000 });
}

async function openDesktopFilterPanel(page: Page) {
  const toggle = page.getByRole("button", { name: "Show filters" });
  await toggle.click();
  await expect(page.getByRole("button", { name: "Hide filters" })).toBeVisible();
}

test.describe("card filter panel (desktop)", () => {
  test("opens the filter panel and reveals set, domain, rarity, and type groups", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCardsLoaded(page);

    await openDesktopFilterPanel(page);

    const panel = page.locator('[data-slot="collapsible-content"]');

    // Every section renders its label to the left of its badges.
    for (const label of ["Set", "Domain", "Rarity", "Type"]) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    }

    // Known badge contents inside the panel.
    await expect(panel.getByText("Proving Grounds", { exact: true })).toBeVisible();
    await expect(panel.getByText("Fury", { exact: true })).toBeVisible();
    await expect(panel.getByText("Unit", { exact: true })).toBeVisible();
    await expect(panel.getByText("Epic", { exact: true })).toBeVisible();
  });

  test("clicking a set filter narrows the grid, adds an active-filter chip, and updates the URL", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCardsLoaded(page);
    await openDesktopFilterPanel(page);

    const panel = page.locator('[data-slot="collapsible-content"]');
    await panel.getByText("Proving Grounds", { exact: true }).click();

    await expect(page).toHaveURL(/sets=[^&]*OGS/);
    // Active-filter region shows the "Set:" label and a "Proving Grounds" chip.
    const activeFiltersBar = page.locator(String.raw`div.bg-muted\/50`);
    await expect(activeFiltersBar.getByText("Set:", { exact: true })).toBeVisible();
    await expect(activeFiltersBar.getByText("Proving Grounds", { exact: true })).toBeVisible();
    // Panel badge is still present for the selected set.
    await expect(panel.getByText("Proving Grounds", { exact: true })).toBeVisible();

    // Cards still load (only one set exists in seed, so grid remains populated).
    await expect(page.getByText("Annie, Fiery").first()).toBeVisible();
  });

  test("clicking a domain filter narrows the grid and adds a chip; combining filters is AND", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCardsLoaded(page);
    await openDesktopFilterPanel(page);

    // Click the "Fury" domain badge (inside the filter panel).
    await page.getByText("Fury", { exact: true }).first().click();
    await expect(page).toHaveURL(/domains=[^&]*Fury/);
    await expect(page.getByText("Domain:", { exact: true })).toBeVisible();

    // Lux, Illuminated is Mind-only — it should be hidden by the Fury filter.
    await expect(page.getByText("Annie, Fiery").first()).toBeVisible();
    await expect(page.getByText("Lux, Illuminated").first()).toBeHidden();

    // Now add a Type=Spell filter — AND should hide Fury-Unit cards like Annie.
    await page.getByText("Spell", { exact: true }).first().click();
    await expect(page).toHaveURL(/types=[^&]*Spell/);
    await expect(page).toHaveURL(/domains=[^&]*Fury/);
    await expect(page.getByText("Type:", { exact: true })).toBeVisible();

    await expect(page.getByText("Firestorm").first()).toBeVisible();
    await expect(page.getByText("Annie, Fiery").first()).toBeHidden();
  });

  test("removing an active-filter chip restores the hidden cards and drops the query param", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCardsLoaded(page);
    await openDesktopFilterPanel(page);
    await page.getByText("Fury", { exact: true }).first().click();

    await expect(page.getByText("Domain:", { exact: true })).toBeVisible();
    await expect(page.getByText("Lux, Illuminated").first()).toBeHidden();

    // The chip for "Fury" is a Badge containing the label and a close button.
    // Remove it by clicking the X button inside that chip.
    const furyChip = page.locator("span", { hasText: /^Fury$/ }).filter({
      has: page.locator("button"),
    });
    await furyChip.getByRole("button").click();

    await expect(page).not.toHaveURL(/[?&]domains=/);
    await expect(page.getByText("Domain:", { exact: true })).toBeHidden();
    await expect(page.getByText("Lux, Illuminated").first()).toBeVisible();
  });

  test("the clear-all action resets the grid and clears every active-filter chip", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCardsLoaded(page);
    await openDesktopFilterPanel(page);
    await page.getByText("Fury", { exact: true }).first().click();
    await page.getByText("Spell", { exact: true }).first().click();

    await expect(page.getByText("Domain:", { exact: true })).toBeVisible();
    await expect(page.getByText("Type:", { exact: true })).toBeVisible();

    // The clear-all button is the last button in the active-filters bar and
    // exposes its label via the native title attribute ("Clear all filters").
    const activeFiltersBar = page.locator(String.raw`div.bg-muted\/50`).filter({
      hasText: "Domain:",
    });
    const clearAllButton = activeFiltersBar.getByRole("button").last();
    await expect(clearAllButton).toHaveAttribute("title", "Clear all filters");
    await clearAllButton.click();

    await expect(page).not.toHaveURL(/[?&]domains=/);
    await expect(page).not.toHaveURL(/[?&]types=/);
    await expect(page.getByText("Domain:", { exact: true })).toBeHidden();
    await expect(page.getByText("Type:", { exact: true })).toBeHidden();

    // Full grid is back: both Fury-Spell and non-Fury cards are visible.
    await expect(page.getByText("Annie, Fiery").first()).toBeVisible();
    await expect(page.getByText("Lux, Illuminated").first()).toBeVisible();
  });

  test("the energy range slider updates the grid and adds energyMin/energyMax query params", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCardsLoaded(page);
    await openDesktopFilterPanel(page);

    // The Slider component forwards its aria-label to both thumbs, so there
    // are two sliders named "Energy range" — the min thumb (first) and the
    // max thumb (last).
    const thumbs = page.getByRole("slider", { name: "Energy range" });
    await expect(thumbs).toHaveCount(2);

    // Move the min thumb up: first focuses it, then ArrowRight steps up.
    await thumbs.first().focus();
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press("ArrowRight");
    }
    // Move the max thumb down to force a narrow band.
    await thumbs.last().focus();
    for (let index = 0; index < 3; index++) {
      await page.keyboard.press("ArrowLeft");
    }

    // energyMin may be -1 (the NONE sentinel) when the min thumb sits at the
    // left edge and only the max thumb was moved — that's still a URL update.
    await expect(page).toHaveURL(/[?&]energyMin=-?\d+/);
    await expect(page).toHaveURL(/[?&]energyMax=-?\d+/);

    // The active-filter chip for Energy renders with the "Energy:" label.
    await expect(page.getByText("Energy:", { exact: true })).toBeVisible();
  });

  test("boolean flag chips toggle on and off and update the URL", async ({ page }) => {
    await page.goto(CARDS_URL);
    await waitForCardsLoaded(page);
    await openDesktopFilterPanel(page);

    // Seed data has errata and a ban, so the Special section renders with
    // "Banned" and "Errata" badges. Toggle "Errata" on.
    await page.getByText("Errata", { exact: true }).first().click();
    await expect(page).toHaveURL(/errata=true/);
    await expect(page.getByText("Flag:", { exact: true })).toBeVisible();

    // Click the same badge again to cycle to "No Errata" (errata=false).
    await page.getByText("Errata", { exact: true }).first().click();
    await expect(page).toHaveURL(/errata=false/);
    await expect(page.getByText("No Errata", { exact: true }).first()).toBeVisible();

    // A third click clears the filter entirely.
    await page.getByText("No Errata", { exact: true }).first().click();
    await expect(page).not.toHaveURL(/[?&]errata=/);
  });
});

test.describe("card filter panel (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile options drawer opens, renders filter sections, and shows a Show-N-cards button when filters are active", async ({
    page,
  }) => {
    await page.goto(CARDS_URL);
    await waitForCardsLoaded(page);

    // Before opening, the drawer footer button is not visible.
    await expect(
      page.getByRole("button", { name: /^(Done|Show \d+ (cards?|printings?))$/ }),
    ).toBeHidden();

    await page.getByRole("button", { name: "Options" }).click();

    const drawer = page.locator('[data-slot="drawer-content"]');
    await expect(drawer).toBeVisible();

    // The drawer renders filter sections (same labels as the desktop panel).
    for (const label of ["Set", "Domain", "Rarity", "Type"]) {
      await expect(drawer.locator("p", { hasText: new RegExp(`^${label}$`) })).toBeVisible();
    }

    // The footer button is either "Done" (no filters) or "Show N cards|printings"
    // (filters active; unit depends on the current view preference — defaults
    // to "printings").
    await expect(
      page.getByRole("button", { name: /^(Done|Show \d+ (cards?|printings?))$/ }),
    ).toBeVisible();

    // Apply a filter by clicking a domain badge inside the drawer.
    await drawer.getByText("Fury", { exact: true }).first().click();

    // With a filter active, the footer button shows "Show N cards" or "Show N printings".
    await expect(
      page.getByRole("button", { name: /^Show \d+ (cards?|printings?)$/ }),
    ).toBeVisible();
    await expect(page).toHaveURL(/domains=[^&]*Fury/);
  });
});
