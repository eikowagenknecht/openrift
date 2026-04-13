import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the homepage with title and navigation", async ({ page }) => {
    await page.goto("/");

    // Main heading is visible
    await expect(page.getByRole("heading", { name: "OpenRift", level: 1 })).toBeVisible();

    // "Browse cards" link/button is visible
    await expect(page.getByRole("link", { name: /browse cards/i })).toBeVisible();
  });

  test("navigates to the cards page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /browse cards/i }).click();

    await expect(page).toHaveURL("/cards");
  });
});
