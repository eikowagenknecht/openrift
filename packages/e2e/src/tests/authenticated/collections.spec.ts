import { test, expect } from "../../fixtures/test.js";

test.describe("collections", () => {
  test("shows the collections page for authenticated users", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/collections");

    // The collections page should load without redirecting to login
    await expect(page).toHaveURL("/collections");

    // Should show the "All Cards" heading (the default collection grid title)
    await expect(page.getByText("All Cards")).toBeVisible({ timeout: 15_000 });
  });
});
