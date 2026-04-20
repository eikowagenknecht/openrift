import { expect, test } from "@playwright/test";

/** A seeded card with two printings (normal + foil), exercises the sibling fan. */
const MULTI_PRINTING_CARD = "Annie, Fiery";

test.describe("card detail pane", () => {
  test("clicking a card opens the detail pane with the card's name and image", async ({ page }) => {
    await page.goto("/cards");
    await expect(page.getByText(MULTI_PRINTING_CARD).first()).toBeVisible({ timeout: 15_000 });

    await page.getByAltText(MULTI_PRINTING_CARD).first().click();

    const pane = page.getByRole("complementary");
    await expect(pane).toBeVisible();
    await expect(
      pane.getByRole("heading", { level: 2, name: new RegExp(MULTI_PRINTING_CARD) }),
    ).toBeVisible({ timeout: 5000 });
    await expect(pane.getByAltText(MULTI_PRINTING_CARD)).toBeVisible();
  });

  test("opening the pane marks the card as selected in the grid", async ({ page }) => {
    await page.goto("/cards");
    await expect(page.getByText(MULTI_PRINTING_CARD).first()).toBeVisible({ timeout: 15_000 });

    const cardImage = page.getByAltText(MULTI_PRINTING_CARD).first();
    const wrapper = page.locator(".group", { has: page.getByAltText(MULTI_PRINTING_CARD) }).first();

    // Before selection: wrapper has no domain tint (transparent background).
    // Single-domain cards get `backgroundColor` and multi-domain cards get a
    // linear-gradient `background-image`, so check background-color — it
    // transitions from transparent to a visible domain color on selection.
    await expect(wrapper).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await cardImage.click();
    await expect(page.getByRole("complementary")).toBeVisible();

    // After selection: the card renders a visible domain-tinted background.
    // This is the same cue a user sees to know which card is active.
    await expect(wrapper).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("closing the detail pane returns to the grid-only layout", async ({ page }) => {
    await page.goto("/cards");
    await expect(page.getByText(MULTI_PRINTING_CARD).first()).toBeVisible({ timeout: 15_000 });

    await page.getByAltText(MULTI_PRINTING_CARD).first().click();

    const pane = page.getByRole("complementary");
    await expect(pane).toBeVisible();

    await pane.getByRole("button", { name: /close card details/i }).click();

    await expect(pane).toBeHidden();
    // Grid is still interactive after close.
    await expect(page.getByText(MULTI_PRINTING_CARD).first()).toBeVisible();
  });

  test("hovering a multi-printing card reveals the sibling fan and clicking a sibling updates the detail pane", async ({
    page,
  }) => {
    await page.goto("/cards");
    await expect(page.getByText(MULTI_PRINTING_CARD).first()).toBeVisible({ timeout: 15_000 });

    // The fan only makes sense in "One per card" view — in the default
    // "Every printing" view each printing renders as its own tile, so there
    // are no siblings to fan out. Switch to cards view via the ViewMode
    // ButtonGroup (first button = Cards).
    const viewGroup = page.getByRole("group", { name: "View mode" });
    await viewGroup.getByRole("button").nth(0).click();

    // Open the detail pane so we can observe printing changes.
    await page.getByAltText(MULTI_PRINTING_CARD).first().click();
    const pane = page.getByRole("complementary");
    await expect(pane).toBeVisible();

    const wrapper = page.locator(".group", { has: page.getByAltText(MULTI_PRINTING_CARD) }).first();

    // Hover reveals the fan: the wrapper's `--fan` custom property animates to 1,
    // which rotates the sibling printings outward. Reading the computed property
    // is how a user's CSS engine actually positions the fan.
    await wrapper.hover();
    await expect
      .poll(() => wrapper.evaluate((el) => getComputedStyle(el).getPropertyValue("--fan").trim()), {
        timeout: 2000,
      })
      .toBe("1");

    // The detail pane's PrintingPicker lists every sibling printing. Clicking a
    // different one than the currently-active row updates the detail view —
    // this is the same handler (onSelectPrinting) the grid fan calls.
    await expect(pane.getByRole("heading", { name: /printings/i })).toBeVisible();

    // PrintingPicker rows are the only aria-pressed buttons in the pane.
    const allPrintings = pane.locator("button[aria-pressed]");
    await expect(allPrintings).toHaveCount(2);

    // Pin the inactive row by index, not by its state attribute — a locator
    // keyed on `aria-pressed="false"` re-resolves after the click to whichever
    // button is *currently* false (the previously-active one), so the
    // follow-up `toHaveAttribute("true")` assertion would never pass.
    const firstPressed = await allPrintings.nth(0).getAttribute("aria-pressed");
    const inactiveIndex = firstPressed === "false" ? 0 : 1;
    const inactive = allPrintings.nth(inactiveIndex);
    await expect(inactive).toBeVisible();
    await inactive.click();

    // Clicking the previously-inactive button makes it active. This confirms
    // the selection store routed the click through to the detail pane.
    await expect(inactive).toHaveAttribute("aria-pressed", "true");
  });

  test("detail pane renders marketplace price rows when prices exist", async ({ page }) => {
    await page.goto("/cards");
    await expect(page.getByText(MULTI_PRINTING_CARD).first()).toBeVisible({ timeout: 15_000 });

    await page.getByAltText(MULTI_PRINTING_CARD).first().click();
    const pane = page.getByRole("complementary");
    await expect(pane).toBeVisible();

    // Marketplace chips expose their name via image alt text. The seeded
    // Annie, Fiery card has TCGplayer snapshots — if any supported marketplace
    // renders a chip, the price section is working.
    const anyMarketplaceChip = pane.getByAltText(/TCGplayer|Cardmarket|CardTrader/);
    await expect(anyMarketplaceChip.first()).toBeVisible({ timeout: 10_000 });
  });

  test("clicking 'View card details' navigates to /cards/:slug", async ({ page }) => {
    await page.goto("/cards");
    await expect(page.getByText(MULTI_PRINTING_CARD).first()).toBeVisible({ timeout: 15_000 });

    await page.getByAltText(MULTI_PRINTING_CARD).first().click();
    const pane = page.getByRole("complementary");
    await expect(pane).toBeVisible();
    await expect(
      pane.getByRole("heading", { level: 2, name: new RegExp(MULTI_PRINTING_CARD) }),
    ).toBeVisible({ timeout: 5000 });

    await pane.getByRole("link", { name: /view card details/i }).click();

    await expect(page).toHaveURL(/\/cards\/annie-fiery$/);
    await expect(
      page.getByRole("heading", { level: 1, name: new RegExp(MULTI_PRINTING_CARD) }),
    ).toBeVisible({ timeout: 5000 });
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("clicking a card opens the mobile overlay and closing returns to the grid", async ({
      page,
    }) => {
      await page.goto("/cards");
      await expect(page.getByText(MULTI_PRINTING_CARD).first()).toBeVisible({ timeout: 15_000 });

      await page.getByAltText(MULTI_PRINTING_CARD).first().click();

      // The desktop Pane (role=complementary) stays hidden on mobile; the mobile
      // overlay is a fullscreen sibling that renders the same CardDetail heading.
      await expect(page.getByRole("complementary")).toBeHidden();
      const mobileHeading = page.getByRole("heading", {
        level: 2,
        name: new RegExp(MULTI_PRINTING_CARD),
      });
      await expect(mobileHeading).toBeVisible({ timeout: 5000 });

      await page.getByRole("button", { name: /close card details/i }).click();

      await expect(mobileHeading).toBeHidden();
      await expect(page.getByText(MULTI_PRINTING_CARD).first()).toBeVisible();
    });
  });
});
