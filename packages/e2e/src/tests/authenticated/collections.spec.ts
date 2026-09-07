import { test, expect } from "../../fixtures/test.js";

test.describe("collections", () => {
  test("shows the collections page for authenticated users", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/collections");

    await expect(page).toHaveURL("/collections");

    await expect(page.getByRole("link", { name: "All Cards", exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
