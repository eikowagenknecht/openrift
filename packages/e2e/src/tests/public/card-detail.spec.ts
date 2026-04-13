import { expect, test } from "@playwright/test";

test.describe("card detail", () => {
  test("opens card detail panel when clicking a card", async ({ page }) => {
    await page.goto("/cards");

    // Wait for card art images to load (they're inside picture > source/img elements)
    const cardImage = page.locator("button > picture img, button > img[alt]").first();
    await expect(cardImage).toBeVisible({ timeout: 15_000 });

    // Click the card image directly (not the label area which has nested buttons)
    await cardImage.click();

    // Clicking a card opens a detail panel (adds printingId to URL search params)
    await expect(page).toHaveURL(/printingId=/, { timeout: 5000 });
  });
});
