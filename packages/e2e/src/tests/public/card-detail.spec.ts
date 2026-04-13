import { expect, test } from "@playwright/test";

test.describe("card detail", () => {
  test("opens card detail panel when clicking a card", async ({ page }) => {
    await page.goto("/cards");

    // Wait for a known card name from seed data to appear
    await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: 15_000 });

    // Click the card's image placeholder area (not the label, which has
    // a nested button with stopPropagation)
    const cardImageArea = page.locator(".aspect-card").first();
    await cardImageArea.click();

    // Clicking a card opens a detail pane on the right
    await expect(page.getByTestId("card-detail-pane")).toBeVisible({ timeout: 5000 });
  });
});
