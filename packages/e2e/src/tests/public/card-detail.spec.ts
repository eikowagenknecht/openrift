import { expect, test } from "@playwright/test";

test.describe("card detail", () => {
  test("opens card detail panel when clicking a card", async ({ page }) => {
    await page.goto("/cards");

    // Wait for a known card name from seed data to appear
    const cardLabel = page.getByText("Annie, Fiery");
    await expect(cardLabel).toBeVisible({ timeout: 15_000 });

    // Click the card name to open its detail panel
    await cardLabel.click();

    // Clicking a card opens a detail panel (adds printingId to URL search params)
    await expect(page).toHaveURL(/printingId=/, { timeout: 5000 });
  });
});
