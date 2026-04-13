import { expect, test } from "@playwright/test";

test.describe("card detail", () => {
  test("opens card detail panel when clicking a card", async ({ page }) => {
    await page.goto("/cards");

    // Wait for card images to load from seed data
    const firstCard = page.locator("img[alt]").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // Clicking a card opens a detail panel (adds printingId to URL search params)
    await firstCard.click();

    // The URL should now contain a printingId search parameter
    await expect(page).toHaveURL(/printingId=/, { timeout: 5000 });
  });
});
