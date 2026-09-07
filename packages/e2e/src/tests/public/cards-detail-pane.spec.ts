import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { waitForCatalogLoaded } from "../../helpers/catalog.js";
import { dockDetailPane } from "../../helpers/detail-pane.js";

// Opened via deep link, not a grid click: the tile click that opens the pane
// in production doesn't reproduce in the dev-server harness.
const ANNIE = "Annie, Fiery";
const ANNIE_PRINTING_ID = "019cfc3b-03d6-74cf-adec-1dce41f631eb";

/**
 * Opens the desktop detail pane by deep-linking to a printing, scoped by the
 * close control so it never collides with the left filter pane (also an `<aside>`).
 */
async function openPaneViaDeepLink(page: Page): Promise<Locator> {
  // The pane is opt-in (`paneDocked`), so without this the deep link opens the
  // detail modal and there is no <aside> to find.
  await dockDetailPane(page);
  await page.goto(`/cards?printingId=${ANNIE_PRINTING_ID}`);
  const pane = page.locator("aside", {
    has: page.getByRole("button", { name: /close card details/iu }),
  });
  await expect(pane).toBeVisible({ timeout: 15_000 });
  return pane;
}

test.describe("card detail pane", () => {
  test("deep-linking a printing opens the pane with the card's name and image", async ({
    page,
  }) => {
    const pane = await openPaneViaDeepLink(page);

    await expect(
      pane.getByRole("heading", { level: 2, name: new RegExp(ANNIE, "u") }),
    ).toBeVisible();
    await expect(pane.getByRole("img", { name: new RegExp(ANNIE, "u") }).first()).toBeVisible();
    await expect(pane.getByRole("heading", { level: 2 })).toContainText(/OGS-\d+/u);
  });

  test("closing the detail pane returns to the grid-only layout", async ({ page }) => {
    const pane = await openPaneViaDeepLink(page);

    await pane.getByRole("button", { name: /close card details/iu }).click();

    await expect(pane).toBeHidden();
    await waitForCatalogLoaded(page);
  });

  test("the printing picker lists siblings and clicking one updates the pane", async ({ page }) => {
    const pane = await openPaneViaDeepLink(page);

    // Rows are role=button (a div, to allow the nested owned-collections
    // popover trigger) carrying aria-pressed for the active row.
    await expect(pane.getByRole("heading", { name: /printings/iu })).toBeVisible();
    const rows = pane.locator("[aria-pressed]");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);

    // Pin the inactive row by index; a state-keyed locator would re-resolve to
    // the newly-inactive row after the click.
    let inactiveIndex = -1;
    for (let index = 0; index < rowCount; index++) {
      if ((await rows.nth(index).getAttribute("aria-pressed")) === "false") {
        inactiveIndex = index;
        break;
      }
    }
    expect(inactiveIndex).toBeGreaterThanOrEqual(0);
    const inactive = rows.nth(inactiveIndex);
    await inactive.click();
    await expect(inactive).toHaveAttribute("aria-pressed", "true");
  });

  test("detail pane renders marketplace price chips when prices exist", async ({ page }) => {
    const pane = await openPaneViaDeepLink(page);

    await expect(pane.getByAltText(/TCGplayer|Cardmarket|CardTrader/u).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking 'Open card page' navigates to /cards/:slug", async ({ page }) => {
    const pane = await openPaneViaDeepLink(page);

    await pane.getByRole("link", { name: /open card page/iu }).click();

    await expect(page).toHaveURL(/\/cards\/annie-fiery$/u);
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(ANNIE, "u") })).toBeVisible(
      { timeout: 5000 },
    );
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("deep-linking a printing opens the mobile overlay and closing returns to the grid", async ({
      page,
    }) => {
      await page.goto(`/cards?printingId=${ANNIE_PRINTING_ID}`);

      const heading = page.getByRole("heading", { level: 2, name: new RegExp(ANNIE, "u") });
      await expect(heading).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /close card details/iu }).click();

      await expect(heading).toBeHidden();
      await waitForCatalogLoaded(page);
    });
  });
});
