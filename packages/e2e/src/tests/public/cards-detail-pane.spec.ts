import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { waitForCatalogLoaded } from "../../helpers/catalog.js";
import { dockDetailPane } from "../../helpers/detail-pane.js";

// The detail pane is opened via a deep link (`/cards?printingId=<id>`) rather
// than a grid click. On the virtualized, useHydrated-gated /cards grid the tile
// click that opens the pane in production is not reproducible in the dev-server
// harness (the selection-store click never commits, even with retries). The
// deep link drives the exact same selection store, so it exercises the pane's
// real rendering, printing picker, prices, close, and "view details"
// navigation. The pure grid gestures (selection tint on the clicked tile, the
// hover sibling-fan) can't be driven here and are covered by the printing
// picker below instead.
//
// Annie, Fiery (slug annie-fiery) has multiple printings, so the pane's printing
// picker renders more than one row. Its normal printing id is stable in the seed.
const ANNIE = "Annie, Fiery";
const ANNIE_PRINTING_ID = "019cfc3b-03d6-74cf-adec-1dce41f631eb";

/**
 * Open the desktop detail pane by deep-linking to a printing. Returns the pane
 * <aside>, scoped by the close control so it never collides with the left
 * filter pane (also an <aside>).
 * @returns The detail pane locator.
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
    // The heading also carries the printing's public shortcode.
    await expect(pane.getByRole("heading", { level: 2 })).toContainText(/OGS-\d+/u);
  });

  test("closing the detail pane returns to the grid-only layout", async ({ page }) => {
    const pane = await openPaneViaDeepLink(page);

    await pane.getByRole("button", { name: /close card details/iu }).click();

    // The pane unmounts (the aside no longer contains a close control).
    await expect(pane).toBeHidden();
    // Grid is still interactive after close.
    await waitForCatalogLoaded(page);
  });

  test("the printing picker lists siblings and clicking one updates the pane", async ({ page }) => {
    const pane = await openPaneViaDeepLink(page);

    // The picker renders an h3 "Printings" and one row per sibling printing.
    // Rows are role=button (a div, to allow the nested owned-collections
    // popover trigger) carrying aria-pressed for the active row.
    await expect(pane.getByRole("heading", { name: /printings/iu })).toBeVisible();
    const rows = pane.locator("[aria-pressed]");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);

    // Find a currently-inactive row, pin it by index (a state-keyed locator
    // would re-resolve to the newly-inactive row after the click), then select
    // it and confirm it becomes active.
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

    // Marketplace chips expose their name via image alt text; the seeded Annie
    // printing has price snapshots, so at least one chip renders.
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

      // On mobile the desktop pane stays hidden; a fullscreen overlay renders
      // the same CardDetail heading and close control.
      const heading = page.getByRole("heading", { level: 2, name: new RegExp(ANNIE, "u") });
      await expect(heading).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /close card details/iu }).click();

      await expect(heading).toBeHidden();
      await waitForCatalogLoaded(page);
    });
  });
});
