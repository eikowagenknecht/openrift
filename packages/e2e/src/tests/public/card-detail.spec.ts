import { expect, test } from "@playwright/test";

test.describe("card detail page", () => {
  test("navigates to a card detail page from the browse view", async ({ page }) => {
    await page.goto("/cards");

    // Wait for card grid to load
    const firstCard = page.locator("img[alt]").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // Click the first card (it should be wrapped in a link)
    const cardLink = firstCard.locator("xpath=ancestor::a").first();
    if (await cardLink.isVisible()) {
      const cardName = await firstCard.getAttribute("alt");
      await cardLink.click();

      // Should navigate to a card detail URL
      await expect(page).toHaveURL(/\/cards\//);

      // The card name should appear on the detail page
      if (cardName) {
        await expect(page.getByText(cardName)).toBeVisible();
      }
    }
  });
});
