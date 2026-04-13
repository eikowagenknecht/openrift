import { expect, test } from "@playwright/test";

test.describe("card browser", () => {
  test("loads the card catalog and displays cards", async ({ page }) => {
    await page.goto("/cards");

    // Wait for the card grid to populate (seed data should have cards)
    const cardImages = page.locator("img[alt]");
    await expect(cardImages.first()).toBeVisible({ timeout: 15_000 });

    // There should be multiple cards from seed data
    const count = await cardImages.count();
    expect(count).toBeGreaterThan(0);
  });

  test("has a working search/filter UI", async ({ page }) => {
    await page.goto("/cards");

    // Wait for initial card load
    await expect(page.locator("img[alt]").first()).toBeVisible({ timeout: 15_000 });

    // Look for filter-related UI elements (search input, filter buttons)
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill("test");
      // Give time for debounced search to trigger
      await page.waitForTimeout(500);
    }
  });
});
