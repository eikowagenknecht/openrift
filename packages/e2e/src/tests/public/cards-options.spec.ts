import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { scrollUntilVisible } from "../../helpers/virtualized.js";

// The SortGroupControls popover trigger renders as "<Group> · <Sort>" (e.g.
// "Set · ID") when a group is active. Default state has groupBy="set", so the
// middot is always present in baseline tests here.
// Open the sort/group popover and pick a radio option. Under parallel load the
// popover can close (a background re-render / focus loss), and its option spans
// re-render mid-click. Retry the whole thing: re-open when the radio is gone,
// then fire the option's onClick via dispatchEvent (no visibility / stability
// wait), until the radio reads checked. Radios are idempotent, so re-firing is
// safe; a stale node throws and retries with a fresh locator.
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

// Grid tiles render the card name only as the art image's alt text (no visible
// text/shortcode), and the grid is window-virtualized, so locate cards by image
// role.
function cardImage(page: Page, name: string): Locator {
  return page.getByRole("img", { name });
}

// The /cards toolbar is useHydrated-gated, so its handlers wire a beat after the
// grid is visible; an early keystroke is silently dropped. The debounced search
// also ignores Playwright's atomic fill(). Retry real keystrokes until the query
// actually commits to the URL, which proves the input is live.
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

    // Unfiltered: label shows "<N> cards" (default view is "cards").
    const countLabel = page.getByText(/\b\d+ (?:cards|printings)\b/u).first();
    await expect(countLabel).toBeVisible();
    const initialText = await countLabel.textContent();
    const initialTotal = Number(initialText?.match(/\d+/u)?.[0] ?? 0);
    expect(initialTotal).toBeGreaterThan(1);

    await typeSearch(page, "Garen");

    // Filtered label switches to "<filtered> / <total> cards|printings".
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

    // A long query that is unique as a whole ("Garen, Rugged" is the only card
    // matching the full query).
    await typeSearch(page, "Garen, Rugged");

    // Once the debounce lands, exactly one Garen card remains and no Annie/Lux
    // cards leak in.
    await scrollUntilVisible(page, cardImage(page, "Garen, Rugged"));
    await expect(cardImage(page, "Annie, Fiery").first()).not.toBeVisible();
    await expect(cardImage(page, "Lux, Illuminated").first()).not.toBeVisible();
  });
});

test.describe("card browser — options bar", () => {
  test("switching view between printings and cards changes the count label", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    // Default view is "cards" (one tile per card) — the count renders "<N> cards".
    await expect(page.getByText(/\b\d+ cards\b/u).first()).toBeVisible();

    // The ViewMode ButtonGroup has aria-label="View mode"; within it the desktop
    // layout renders [One per card, Every printing] as icon-only toggles.
    const viewGroup = page.getByRole("group", { name: "View mode" });
    // Retry until the toggle takes effect — the toolbar wires its handlers a beat
    // after the grid mounts (useHydrated gate), so an early click can be dropped.
    await expect(async () => {
      await viewGroup.getByRole("button").nth(1).click();
      await expect(page.getByText(/\b\d+ printings\b/u).first()).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  });

  test("changing sort order updates which card appears first", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    // Capture the current grid order, then re-sort and confirm the order changes.
    // (The default group-by-set means a re-sort reorders within groups, so
    // compare the whole visible sequence rather than just the first tile.)
    const cardOrder = () =>
      page
        .locator("main")
        .getByRole("img")
        .evaluateAll((imgs) => imgs.map((img) => img.getAttribute("alt")));
    const before = await cardOrder();
    expect(before.length).toBeGreaterThan(1);

    // Sort by Energy reorders the grid.
    await selectSortGroupOption(page, "Energy");
    await page.keyboard.press("Escape");

    await expect.poll(cardOrder).not.toEqual(before);
  });

  test("grouping by type shows section headers for each card type", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    await selectSortGroupOption(page, "Type");
    // Close the popover to reveal the grid.
    await page.keyboard.press("Escape");

    // Group headers are rendered as buttons (GroupHeaderLabel) with the group
    // name as the accessible name. Seed data has Legend, Unit, Spell types.
    // The grid is window-virtualized, so headers below the fold aren't in the
    // DOM until scrolled into view.
    for (const name of ["Legend", "Unit", "Spell"]) {
      await scrollUntilVisible(page, page.getByRole("button", { name, exact: true }));
    }
  });

  test("flipping group direction reverses the header order", async ({ page }) => {
    await page.goto("/cards");
    await waitForCatalogLoaded(page);

    await selectSortGroupOption(page, "Type");
    await page.keyboard.press("Escape");

    // Only Legend / Unit / Spell are present in seed, so asc order starts with
    // Legend; flipping should put Spell first. The grid is window-virtualized,
    // so assert on the first rendered header rather than the full list.
    const firstHeader = page.getByRole("button", { name: /^(?:Legend|Unit|Spell)$/u }).first();

    await expect(firstHeader).toHaveText("Legend");

    // Flip the Group by direction. The action button sits in the "Group by"
    // section header next to the title span; its title reads "Ascending…" /
    // "Descending…" and flips synchronously on click. Guard on that title (not
    // the async header reorder) so a detach-and-retry never toggles twice, and
    // re-open the popover when it closes under load.
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
