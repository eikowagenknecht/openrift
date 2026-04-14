import { expect, test } from "@playwright/test";

// Deep-link tests for /cards search-param parsing. Each test hits /cards with
// one URL param group and asserts the grid reflects it — either by a known
// seed card appearing/disappearing, the count label changing, or the empty
// state being shown. Seed data comes from apps/api/src/test/fixtures/seed.sql
// (set OGS "Proving Grounds").

const LOAD_TIMEOUT = 15_000;

test.describe("card browser URL params", () => {
  test("?search= pre-fills the search input and filters the grid", async ({ page }) => {
    await page.goto("/cards?search=Garen");

    await expect(page.getByPlaceholder(/search/i)).toHaveValue("Garen");
    await expect(page.getByText("Garen, Rugged")).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(page.getByText("Annie, Fiery")).not.toBeVisible();
  });

  test("?sets=<known slug> keeps matching cards visible", async ({ page }) => {
    await page.goto("/cards?sets=OGS");
    await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: LOAD_TIMEOUT });
  });

  test("?sets=<unknown slug> shows the empty state", async ({ page }) => {
    await page.goto("/cards?sets=__nonexistent__");
    await expect(page.getByText(/No cards found/i)).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(page.getByText("Annie, Fiery")).not.toBeVisible();
  });

  test("?rarities=Epic narrows the grid to Epic printings", async ({ page }) => {
    await page.goto("/cards?rarities=Epic");

    // Annie, Fiery has an Epic printing in the seed
    await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: LOAD_TIMEOUT });
    // Flash is a Common Spell, filtered out
    await expect(page.getByText("Flash")).not.toBeVisible();
  });

  test("?domains=Fury narrows the grid to Fury cards", async ({ page }) => {
    await page.goto("/cards?domains=Fury");

    await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: LOAD_TIMEOUT });
    // Lux, Illuminated is a Mind card, filtered out
    await expect(page.getByText("Lux, Illuminated")).not.toBeVisible();
  });

  test("?types=Legend narrows the grid to Legend cards", async ({ page }) => {
    await page.goto("/cards?types=Legend");

    await expect(page.getByText("Dark Child, Starter")).toBeVisible({ timeout: LOAD_TIMEOUT });
    // Unit/Spell cards are filtered out
    await expect(page.getByText("Annie, Fiery")).not.toBeVisible();
  });

  test("?energyMin=2&energyMax=2 shows only 2-cost cards", async ({ page }) => {
    await page.goto("/cards?energyMin=2&energyMax=2");

    // Flash and Incinerate are 2-cost Spells
    await expect(page.getByText("Flash")).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(page.getByText("Incinerate")).toBeVisible();
    // Annie, Fiery is 5-cost, filtered out
    await expect(page.getByText("Annie, Fiery")).not.toBeVisible();
  });

  test("?priceMin=&priceMax= narrows the grid", async ({ page }) => {
    // The seed has no marketplace price data, so every printing has a null
    // price and a numeric range filters them all out — which is exactly the
    // "filter is applied" assertion we want.
    await page.goto("/cards?priceMin=1&priceMax=100");

    await expect(page.getByText(/No cards found/i)).toBeVisible({ timeout: LOAD_TIMEOUT });
  });

  test("?promo=true shows only promo printings", async ({ page }) => {
    await page.goto("/cards?promo=true");

    // Annie, Fiery is the only card with a promo printing in the seed
    await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(page.getByText("Garen, Rugged")).not.toBeVisible();
  });

  test("?banned=true shows only banned cards", async ({ page }) => {
    await page.goto("/cards?banned=true");

    // Blast of Power is the only banned card in the seed
    await expect(page.getByText("Blast of Power")).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(page.getByText("Annie, Fiery")).not.toBeVisible();
  });

  test("?errata=true shows only cards with errata", async ({ page }) => {
    await page.goto("/cards?errata=true");

    // Annie, Fiery has errata in the seed
    await expect(page.getByText("Annie, Fiery")).toBeVisible({ timeout: LOAD_TIMEOUT });
    // Garen, Rugged has none
    await expect(page.getByText("Garen, Rugged")).not.toBeVisible();
  });

  test("?sort=name&sortDir=desc reverses the grid order", async ({ page }) => {
    await page.goto("/cards?sort=name&sortDir=desc");

    const zephyr = page.getByText("Zephyr Sage").first();
    const annie = page.getByText("Annie, Fiery").first();
    await expect(zephyr).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(annie).toBeVisible();

    const zephyrBox = await zephyr.boundingBox();
    const annieBox = await annie.boundingBox();
    if (!zephyrBox || !annieBox) {
      throw new Error("Expected both cards to have bounding boxes");
    }
    // Descending name order: Zephyr Sage renders above Annie, Fiery
    expect(zephyrBox.y).toBeLessThan(annieBox.y);
  });

  test("?groupBy=type shows type group headers", async ({ page }) => {
    await page.goto("/cards?groupBy=type");

    // Group headers render as buttons whose accessible name is the group label.
    // Filter panel type options use Badge (non-button), so these locators
    // unambiguously target the headers at the default viewport.
    await expect(page.getByRole("button", { name: "Unit", exact: true })).toBeVisible({
      timeout: LOAD_TIMEOUT,
    });
    await expect(page.getByRole("button", { name: "Spell", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Legend", exact: true })).toBeVisible();
  });

  test("?view=printings changes the count label unit", async ({ page }) => {
    await page.goto("/cards?view=printings");

    // The SearchBar count label switches to "printings" when view=printings
    await expect(page.getByText(/\d+ printings\b/)).toBeVisible({ timeout: LOAD_TIMEOUT });
  });

  test("?printingId=<id> opens the detail pane and strips the param", async ({ page }) => {
    // Annie, Fiery OGS-001 EN normal printing from the seed
    const printingId = "019cfc3b-03d6-74cf-adec-1dce41f631eb";
    await page.goto(`/cards?printingId=${printingId}`);

    await expect(page.getByRole("heading", { level: 2, name: /Annie, Fiery/ })).toBeVisible({
      timeout: LOAD_TIMEOUT,
    });
    // The deep-link handler replaces history, stripping printingId from the URL
    await expect.poll(() => page.url()).not.toContain("printingId=");
  });
});
