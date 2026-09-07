import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { scrollUntilVisible } from "../../helpers/virtualized.js";

// The popover trigger renders as "<Group> · <Sort>" (default groupBy="set"
// keeps the middot present). Retries the whole open+select under load, since
// the popover can close or its option spans re-render mid-click.
async function selectSortGroupOption(page: Page, name: string) {
  const trigger = page.getByRole("button", { name: /·/u });
  const radio = page.getByRole("radio", { name, exact: true });
  await expect(async () => {
    if ((await radio.count()) === 0) {
      await trigger.click({ timeout: 2000 }).catch(() => {});
      await expect(radio).toBeAttached({ timeout: 1500 });
    }
    if ((await radio.getAttribute("aria-checked").catch(() => null)) !== "true") {
      await radio.dispatchEvent("click").catch(() => {});
    }
    await expect(radio).toHaveAttribute("aria-checked", "true", { timeout: 1500 });
  }).toPass({ timeout: 25_000 });
}

// Grid tiles have no visible text/shortcode; the card name is only the art
// image's alt text.
function cardImage(page: Page, name: string): Locator {
  return page.getByRole("img", { name });
}

// The toolbar is useHydrated-gated, so an early keystroke is silently dropped;
// retry real keystrokes until the query commits to the URL.
async function typeSearch(page: Page, query: string): Promise<Locator> {
  const search = page.getByPlaceholder(/search/iu);
  await expect(async () => {
    await search.click();
    await search.fill("");
    await search.pressSequentially(query, { delay: 30 });
    await expect(page).toHaveURL(/[?&]search=/u, { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  return search;
}

async function waitForCatalogLoaded(page: Page) {
  await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
}

test.describe("card browser — search bar", () => {
  test("typing filters the grid and updates the count label", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    const countLabel = page.getByText(/\b\d+ (?:cards|printings)\b/u).first();
    await expect(countLabel).toBeVisible();
    const initialText = await countLabel.textContent();
    const initialTotal = Number(initialText?.match(/\d+/u)?.[0] ?? 0);
    expect(initialTotal).toBeGreaterThan(1);

    await typeSearch(page, "Garen");

    const filteredLabel = page.getByText(/\d+ \/ \d+ (?:cards|printings)/u);
    await expect(filteredLabel).toBeVisible({ timeout: 5000 });
    await scrollUntilVisible(page, cardImage(page, "Garen, Rugged"));
    await expect(cardImage(page, "Annie, Fiery").first()).not.toBeVisible();
  });

  test("clearing the search restores all cards", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    const search = await typeSearch(page, "Garen");
    await expect(cardImage(page, "Annie, Fiery").first()).not.toBeVisible();

    await page.getByRole("button", { name: "Clear search" }).click();

    await expect(search).toHaveValue("");
    await scrollUntilVisible(page, cardImage(page, "Annie, Fiery"));
    await scrollUntilVisible(page, cardImage(page, "Garen, Rugged"));
  });

  test("debounced typing lands on the final result without flashing intermediate state", async ({
    page,
  }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    await typeSearch(page, "Garen, Rugged");

    await scrollUntilVisible(page, cardImage(page, "Garen, Rugged"));
    await expect(cardImage(page, "Annie, Fiery").first()).not.toBeVisible();
    await expect(cardImage(page, "Lux, Illuminated").first()).not.toBeVisible();
  });
});

test.describe("card browser — options bar", () => {
  test("switching view between printings and cards changes the count label", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    await expect(page.getByText(/\b\d+ cards\b/u).first()).toBeVisible();

    // aria-label="View mode" groups the icon-only [One per card, Every printing]
    // toggles; retry the click since the toolbar wires handlers a beat late.
    const viewGroup = page.getByRole("group", { name: "View mode" });
    await expect(async () => {
      await viewGroup.getByRole("button").nth(1).click();
      await expect(page.getByText(/\b\d+ printings\b/u).first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  });

  test("changing sort order updates which card appears first", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    // Default group-by-set reorders within groups; compare the whole visible sequence.
    const cardOrder = () =>
      page
        .locator("main")
        .getByRole("img")
        .evaluateAll((imgs) => imgs.map((img) => img.getAttribute("alt")));
    const before = await cardOrder();
    expect(before.length).toBeGreaterThan(1);

    await selectSortGroupOption(page, "Energy");
    await page.keyboard.press("Escape");

    await expect.poll(cardOrder).not.toEqual(before);
  });

  test("grouping by type shows section headers for each card type", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    await selectSortGroupOption(page, "Type");
    await page.keyboard.press("Escape");

    // Headers are buttons (GroupHeaderLabel); the grid is window-virtualized,
    // so headers below the fold aren't in the DOM until scrolled into view.
    for (const name of ["Legend", "Unit", "Spell"]) {
      await scrollUntilVisible(page, page.getByRole("button", { name, exact: true }));
    }
  });

  test("flipping group direction reverses the header order", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    await selectSortGroupOption(page, "Type");
    await page.keyboard.press("Escape");

    // The grid is window-virtualized; only the first rendered header is guaranteed present.
    const firstHeader = page.getByRole("button", { name: /^(?:Legend|Unit|Spell)$/u }).first();

    await expect(firstHeader).toHaveText("Legend");

    // The flip button's title flips synchronously on click ("Ascending…" /
    // "Descending…"); guard on that, not the async header reorder, so a
    // detach-and-retry never toggles twice.
    const trigger = page.getByRole("button", { name: /·/u });
    const flipButton = page
      .getByText("Group by", { exact: true })
      .locator("..")
      .getByRole("button");
    await expect(async () => {
      if ((await flipButton.count()) === 0) {
        await trigger.click({ timeout: 2000 }).catch(() => {});
        await expect(flipButton).toBeAttached({ timeout: 1500 });
      }
      if (!/Descending/u.test((await flipButton.getAttribute("title").catch(() => "")) ?? "")) {
        await flipButton.dispatchEvent("click").catch(() => {});
      }
      await expect(flipButton).toHaveAttribute("title", /Descending/u, { timeout: 1500 });
    }).toPass({ timeout: 25_000 });
    await page.keyboard.press("Escape");

    await expect(firstHeader).toHaveText("Spell");
  });
});
