import { test, expect } from "../../fixtures/test.js";

test.describe("collections", () => {
  test("shows the collections page for authenticated users", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/collections");

    // The collections page should load without redirecting to login
    await expect(page).toHaveURL("/collections");

    // Should show the "All Cards" sidebar link (the default collection)
    await expect(page.getByRole("link", { name: "All Cards", exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
