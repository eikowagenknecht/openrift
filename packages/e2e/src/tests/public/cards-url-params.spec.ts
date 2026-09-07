import { expect, test } from "@playwright/test";

import { cardImage } from "../../helpers/catalog.js";
import { scrollUntilVisible } from "../../helpers/virtualized.js";

// Seed data comes from apps/api/src/test/fixtures/seed.sql (set OGS
// "Proving Grounds"). Grid tiles are image-only (card name in alt).

const LOAD_TIMEOUT = 15_000;

test.describe("card browser URL params", () => {
  test("?search= pre-fills the search input and filters the grid", async ({ page }) => {
    await page.goto("/cards?search=Garen");

    await expect(page.getByPlaceholder(/search/iu)).toHaveValue("Garen", { timeout: LOAD_TIMEOUT });
    await scrollUntilVisible(page, cardImage(page, "Garen, Rugged"));
    await expect(cardImage(page, "Annie, Fiery").first()).not.toBeVisible();
  });

  test("?sets=<known slug> keeps matching cards visible", async ({ page }) => {
    await page.goto(`/cards?sets=${encodeURIComponent(JSON.stringify(["OGS"]))}`);
    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
  });

  test("?sets=<unknown slug> shows the empty state", async ({ page }) => {
    await page.goto(`/cards?sets=${encodeURIComponent(JSON.stringify(["__nonexistent__"]))}`);
    await expect(page.getByText(/No cards found/iu)).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(cardImage(page, "Annie, Fiery").first()).not.toBeVisible();
  });

  test("?rarities=Epic narrows the grid to Epic printings", async ({ page }) => {
    await page.goto(`/cards?rarities=${encodeURIComponent(JSON.stringify(["epic"]))}`);

    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
    await expect(cardImage(page, "Flash").first()).not.toBeVisible();
  });

  test("?domains=Fury narrows the grid to Fury cards", async ({ page }) => {
    await page.goto(`/cards?domains=${encodeURIComponent(JSON.stringify(["fury"]))}`);

    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
    await expect(cardImage(page, "Lux, Illuminated").first()).not.toBeVisible();
  });

  test("?types=Legend narrows the grid to Legend cards", async ({ page }) => {
    await page.goto(`/cards?types=${encodeURIComponent(JSON.stringify(["legend"]))}`);

    await scrollUntilVisible(page, cardImage(page, "Dark Child, Starter"));
    await expect(cardImage(page, "Annie, Fiery").first()).not.toBeVisible();
  });

  test("?energyMin=2&energyMax=2 shows only 2-cost cards", async ({ page }) => {
    await page.goto("/cards?energyMin=2&energyMax=2");

    await scrollUntilVisible(page, cardImage(page, "Flash"));
    await scrollUntilVisible(page, cardImage(page, "Incinerate"));
    await expect(cardImage(page, "Annie, Fiery").first()).not.toBeVisible();
  });

  test("?priceMin=&priceMax= narrows the grid", async ({ page }) => {
    await page.goto("/cards?priceMin=999999&priceMax=1000000");

    await expect(page.getByText(/No cards found/iu)).toBeVisible({ timeout: LOAD_TIMEOUT });
  });

  test("?markersPresence=any shows only cards with at least one marker", async ({ page }) => {
    await page.goto("/cards?markersPresence=any");

    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
    await expect(cardImage(page, "Firestorm").first()).not.toBeVisible();
  });

  test("?groupBy=<unknown value> falls back to the default grouping", async ({ page }) => {
    await page.goto("/cards?groupBy=garbage");

    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
    await expect(page).toHaveURL(/\/cards$/u);
  });

  test("?banned=true shows only banned cards", async ({ page }) => {
    await page.goto(`/cards?banned=${encodeURIComponent(JSON.stringify(true))}`);

    await scrollUntilVisible(page, cardImage(page, "Blast of Power"));
    await expect(cardImage(page, "Annie, Fiery").first()).not.toBeVisible();
  });

  test("?errata=true shows only cards with errata", async ({ page }) => {
    await page.goto(`/cards?errata=${encodeURIComponent(JSON.stringify(true))}`);

    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
    await expect(cardImage(page, "Garen, Rugged").first()).not.toBeVisible();
  });

  test("?sort=name&sortDir=desc reverses the grid order", async ({ page }) => {
    // Tall viewport so the window virtualizer keeps both ends mounted.
    await page.setViewportSize({ width: 1280, height: 4000 });
    await page.goto("/cards?sort=name&sortDir=desc");

    const zephyr = cardImage(page, "Zephyr Sage").first();
    const annie = cardImage(page, "Annie, Fiery").first();
    await expect(zephyr).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(annie).toBeVisible();

    const zephyrBox = await zephyr.boundingBox();
    const annieBox = await annie.boundingBox();
    if (!zephyrBox || !annieBox) {
      throw new Error("Expected both cards to have bounding boxes");
    }
    expect(zephyrBox.y).toBeLessThan(annieBox.y);
  });

  test("?groupBy=type shows type group headers", async ({ page }) => {
    await page.goto("/cards?groupBy=type");

    // The grid is window-virtualized, so headers below the fold need scrolling into view.
    for (const name of ["Unit", "Spell", "Legend"]) {
      await scrollUntilVisible(page, page.getByRole("button", { name, exact: true }), {
        timeout: LOAD_TIMEOUT,
      });
    }
  });

  test("?view=printings changes the count label unit", async ({ page }) => {
    await page.goto("/cards?view=printings");

    await expect(page.getByText(/\d+ printings\b/u).first()).toBeVisible({ timeout: LOAD_TIMEOUT });
  });

  test("unknown and malformed params are silently stripped from the URL", async ({ page }) => {
    await page.goto("/cards?bogus=x&promo=nonsense&priceMin=abc");

    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
    await expect.poll(() => page.url()).not.toContain("bogus=");
    await expect.poll(() => page.url()).not.toContain("promo=");
    await expect.poll(() => page.url()).not.toContain("priceMin=");
  });

  test("?printingId=<id> opens the card detail and strips the param", async ({ page }) => {
    const printingId = "019cfc3b-03d6-74cf-adec-1dce41f631eb";
    await page.goto(`/cards?printingId=${printingId}`);

    await expect(page.getByRole("heading", { level: 2, name: /Annie, Fiery/u })).toBeVisible({
      timeout: LOAD_TIMEOUT,
    });
    await expect.poll(() => page.url()).not.toContain("printingId=");
  });
});
