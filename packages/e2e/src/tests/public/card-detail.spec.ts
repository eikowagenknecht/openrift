import { expect, test } from "@playwright/test";

test.describe("card detail", () => {
  test("opens card detail panel when clicking a card", async ({ page }) => {
    await page.goto("/cards");

    // Wait for a known card name from seed data to appear
    await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });

    // Click the card's image area (the aspect-card placeholder), not the
    // label text which is inside a nested button that stops propagation.
    const cardImageArea = page.locator(".aspect-card").first();
    await cardImageArea.click();

    // Clicking a card opens a detail panel (adds printingId to URL search params)
    await expect(page).toHaveURL(/printingId=/, { timeout: 5000 });
  });
});
