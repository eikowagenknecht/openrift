import { expect, test } from "@playwright/test";

test.describe("card detail page", () => {
  test("navigates to a card detail page from the browse view", async ({ page }) => {
    await page.goto("/cards");

    // Wait for card images to load from seed data
    const firstCard = page.locator("img[alt]").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // Click the first card image (or its clickable container)
    await firstCard.click();

    // Should navigate to a card detail URL (slug-based, e.g. /cards/some-card-name)
    await expect(page).toHaveURL(/\/cards\//, { timeout: 10_000 });
  });
});
