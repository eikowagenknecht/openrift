import { expect, test } from "@playwright/test";

test.describe("card browser", () => {
  test("loads the card catalog and displays cards", async ({ page }) => {
    await page.goto("/cards");

    // Wait for a known card name from seed data to appear in the grid
    await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 15_000 });

    // The search input should be visible
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test("has a working search/filter UI", async ({ page }) => {
    await page.goto("/cards");

    // Wait for cards to load
    await expect(page.getByText("Annie, Fiery").first()).toBeVisible({ timeout: 15_000 });

    // Search for a known card from seed data
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill("Garen");

    // Give time for debounced search to filter
    await page.waitForTimeout(500);

    // A Garen card from seed data should be visible (check any Garen variant)
    await expect(page.getByText("Garen, Rugged").first()).toBeVisible({ timeout: 5000 });
  });
});
