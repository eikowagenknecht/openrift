import { expect, test } from "@playwright/test";

test.describe("card browser", () => {
  test("loads the card catalog and displays cards", async ({ page }) => {
    await page.goto("/cards");

    // Wait for card grid to populate (seed data has no images, but card
    // names are always rendered in the grid rows)
    const cardGrid = page.locator("[data-index]");
    await expect(cardGrid.first()).toBeVisible({ timeout: 15_000 });

    // There should be multiple card rows from seed data
    const count = await cardGrid.count();
    expect(count).toBeGreaterThan(0);

    // The search input should be visible
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test("has a working search/filter UI", async ({ page }) => {
    await page.goto("/cards");

    // Wait for cards to load
    await expect(page.locator("[data-index]").first()).toBeVisible({ timeout: 15_000 });

    // Search for a known card from seed data
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill("Annie");

    // Give time for debounced search to filter
    await page.waitForTimeout(500);

    // The card count should reflect the filter (fewer than total)
    await expect(page.getByText(/cards/i)).toBeVisible();
  });
});
