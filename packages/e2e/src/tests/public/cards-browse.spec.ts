import { expect, test } from "@playwright/test";

import { scrollUntilVisible } from "../../helpers/virtualized.js";

test.describe("card browser", () => {
  test("loads the card catalog and displays cards", async ({ page }) => {
    await page.goto("/cards");

    // Card tiles render the name as the art image's alt text; the grid is
    // window-virtualized, so scroll the target into view before asserting.
    await scrollUntilVisible(page, page.getByRole("img", { name: "Annie, Fiery" }));

    await expect(page.getByPlaceholder(/search/iu)).toBeVisible();
  });

  test("has a working search/filter UI", async ({ page }) => {
    await page.goto("/cards");

    await scrollUntilVisible(page, page.getByRole("img", { name: "Annie, Fiery" }));

    const searchInput = page.getByPlaceholder(/search/iu);
    await searchInput.fill("Garen");

    await page.waitForTimeout(500);

    await scrollUntilVisible(page, page.getByRole("img", { name: "Garen, Rugged" }));
  });
});
