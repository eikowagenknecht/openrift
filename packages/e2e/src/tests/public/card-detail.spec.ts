import { expect, test } from "@playwright/test";

test.describe("card detail", () => {
  test("opens card detail panel when clicking a card", async ({ page }) => {
    await page.goto("/cards");

    // Wait for card names to appear (images may not exist in seed data,
    // but card name labels are always rendered)
    const cardName = page.locator("[data-index] button").first();
    await expect(cardName).toBeVisible({ timeout: 15_000 });

    // Click the first card's clickable area
    await cardName.click();

    // Clicking a card opens a detail panel (adds printingId to URL search params)
    await expect(page).toHaveURL(/printingId=/, { timeout: 5000 });
  });
});
