import { expect, test } from "@playwright/test";

import { scrollUntilVisible } from "../../helpers/virtualized.js";

test.describe("card browser", () => {
  test("loads the card catalog and displays cards", async ({ page }) => {
    await page.goto("/cards");

    // Card tiles render the name as the art image's alt text, and the grid is
    // window-virtualized, so scroll the target into view before asserting.
    await scrollUntilVisible(page, page.getByRole("img", { name: "Annie, Fiery" }));

    // The search input should be visible
    await expect(page.getByPlaceholder(/search/iu)).toBeVisible();
  });

  test("has a working search/filter UI", async ({ page }) => {
    await page.goto("/cards");

    // Wait for cards to load
    await scrollUntilVisible(page, page.getByRole("img", { name: "Annie, Fiery" }));

    // Search for a known card from seed data
    const searchInput = page.getByPlaceholder(/search/iu);
    await searchInput.fill("Garen");

    // Give time for debounced search to filter
    await page.waitForTimeout(500);

    // A Garen card from seed data should be visible (check any Garen variant)
    await scrollUntilVisible(page, page.getByRole("img", { name: "Garen, Rugged" }));
  });
});
