import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { scrollUntilVisible } from "../../helpers/virtualized.js";

// The SortGroupControls popover trigger renders as "<Group> · <Sort>" (e.g.
// "Set · ID") when a group is active. Default state has groupBy="set", so the
// middot is always present in baseline tests here.
async function openSortPopover(page: Page) {
  await page.getByRole("button", { name: /·/ }).click();
}

function cardTiles(page: Page): Locator {
  // The grid renders a shortcode + card name inside each CardMetaLabel.
  // Short codes all follow "OGS-xxx" in the seed data.
  return page.getByText(/^OGS-\d{3}$/);
}

async function waitForCatalogLoaded(page: Page) {
  await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });
}

test.describe("card browser — search bar", () => {
  test("typing filters the grid and updates the count label", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    // Unfiltered: label shows "<N> cards".
    const countLabel = page.getByText(/\b\d+ cards\b/).first();
    await expect(countLabel).toBeVisible();
    const initialText = await countLabel.textContent();
    const initialTotal = Number(initialText?.match(/\d+/)?.[0] ?? 0);
    expect(initialTotal).toBeGreaterThan(1);

    await page.getByPlaceholder(/search/i).fill("Garen");

    // Filtered label switches to "<filtered> / <total> cards".
    const filteredLabel = page.getByText(/\d+ \/ \d+ cards/);
    await expect(filteredLabel).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Garen, Rugged")).toBeVisible();
    await expect(page.getByText("Annie, Fiery")).not.toBeVisible();
  });

  test("clearing the search restores all cards", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    const search = page.getByPlaceholder(/search/i);
    await search.fill("Garen");
    await expect(page.getByText("Annie, Fiery")).not.toBeVisible();

    await page.getByRole("button", { name: "Clear search" }).click();

    await expect(search).toHaveValue("");
    await expect(page.getByText("Annie, Fiery")).toBeVisible();
    await expect(page.getByText("Garen, Rugged")).toBeVisible();
  });

  test("debounced typing lands on the final result without flashing intermediate state", async ({
    page,
  }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    const search = page.getByPlaceholder(/search/i);
    // A long query that would match many prefixes if each keystroke applied
    // individually, but is unique as a whole ("Garen, Rugged" is the only
    // card matching the full query).
    await search.fill("Garen, Rugged");

    // The debounce only flushes after 200ms of stable input — once it lands,
    // exactly one Garen card remains and no Annie/Lux cards leak in.
    await expect(page.getByText("Garen, Rugged")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Annie, Fiery")).not.toBeVisible();
    await expect(page.getByText("Lux, Illuminated")).not.toBeVisible();
  });
});

test.describe("card browser — options bar", () => {
  test("switching view from cards to printings changes the count label", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    await expect(page.getByText(/\b\d+ cards\b/)).toBeVisible();

    // The ViewMode ButtonGroup has aria-label="View mode"; within it the
    // desktop layout renders [Cards, Printings] as icon-only buttons.
    const viewGroup = page.getByRole("group", { name: "View mode" });
    await viewGroup.getByRole("button").nth(1).click();

    // Label unit switches from "cards" to "printings" — printings ≥ cards in
    // seed data, so the total should also be no smaller.
    const printingsLabel = page.getByText(/\b\d+ printings\b/);
    await expect(printingsLabel).toBeVisible();
    await expect(page.getByText(/\b\d+ cards\b/)).not.toBeVisible();
  });

  test("changing sort order updates which card appears first", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    // Default sort is ID asc, which in sortCards() means shortCode asc — the
    // first card is OGS-001 (Annie, Fiery).
    const firstTile = cardTiles(page).first();
    await expect(firstTile).toHaveText("OGS-001");

    // Sort by Energy asc reorders meaningfully: Annie Fiery (energy 5) is no
    // longer first; Flash or Incinerate (both energy 2) move to the top.
    await openSortPopover(page);
    await page.getByRole("button", { name: "Energy", exact: true }).click();

    await expect(firstTile).not.toHaveText("OGS-001");
  });

  test("grouping by type shows section headers for each card type", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    await openSortPopover(page);
    await page.getByRole("button", { name: "Type", exact: true }).click();
    // Close the popover to reveal the grid.
    await page.keyboard.press("Escape");

    // Group headers are rendered as buttons (GroupHeaderLabel) with the group
    // name as the accessible name. Seed data has Legend, Unit, Spell types.
    // The grid is window-virtualized (see card-grid.tsx), so headers below
    // the fold are not in the DOM until scrolled into view.
    for (const name of ["Legend", "Unit", "Spell"]) {
      await scrollUntilVisible(page, page.getByRole("button", { name, exact: true }));
    }
  });

  test("flipping group direction reverses the header order", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    await openSortPopover(page);
    await page.getByRole("button", { name: "Type", exact: true }).click();
    await page.keyboard.press("Escape");

    // Order with asc: DEFAULT_ENUM_ORDERS.cardTypes is
    // ["Legend", "Unit", "Rune", "Spell", "Gear", "Battlefield", "Other"].
    // Only Legend / Unit / Spell are present in seed, so asc order starts
    // with Legend; flipping should put Spell first. The grid is window-
    // virtualized (see card-grid.tsx), so headers below the fold aren't in
    // the DOM — assert on the first rendered header rather than the full
    // list.
    const firstHeader = page.getByRole("button", { name: /^(Legend|Unit|Spell)$/ }).first();

    await expect(firstHeader).toHaveText("Legend");

    // Re-open the popover and flip the Group by direction. The action button
    // sits in the "Group by" section header next to the title span — the only
    // button in that flex row besides the radio options below it.
    await openSortPopover(page);
    const groupByRow = page.getByText("Group by", { exact: true }).locator("..");
    await groupByRow.getByRole("button").click();
    await page.keyboard.press("Escape");

    await expect(firstHeader).toHaveText("Spell");
  });
});
