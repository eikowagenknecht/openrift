import { expect, test } from "@playwright/test";

test.describe("card detail page", () => {
  test("navigates to a card detail page from the browse view", async ({ page }) => {
    // Navigate and wait for full page load including client-side hydration
    await page.goto("/cards", { waitUntil: "networkidle" });

    // Wait for card images to load from seed data.
    // If "Couldn't load cards" appears, click Retry.
    const retryButton = page.getByRole("link", { name: "Retry" });
    if (await retryButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await retryButton.click();
    }

    const firstCard = page.locator("img[alt]").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // Click the first card image (or its clickable container)
    await firstCard.click();

    // Should navigate to a card detail URL (slug-based, e.g. /cards/some-card-name)
    await expect(page).toHaveURL(/\/cards\//, { timeout: 10_000 });
  });
});
