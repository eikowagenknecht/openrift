import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import { API_BASE_URL, WEB_BASE_URL } from "../../helpers/constants.js";

async function createDeckViaApi(
  request: APIRequestContext,
  { name, format }: { name: string; format: "constructed" | "freeform" },
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/v1/decks`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name, format },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

// TanStack Start encodes each server fn id as base64url(JSON) with the source
// file + export name; decoding the segment lets us wait on a specific mutation
// without colliding with other server fns that fire during the same transition.
function isServerFn(url: string, fnName: string): boolean {
  const match = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!match) {
    return false;
  }
  try {
    return Buffer.from(match[1], "base64url").toString("utf-8").includes(fnName);
  } catch {
    return false;
  }
}

// Valid UUID shape, guaranteed not to match any real deck.
const BOGUS_DECK_ID = "00000000-0000-0000-0000-0000000dead1";

// The kebab trigger in the editor top bar is an unlabeled icon button; BaseUI's
// DropdownMenu marks its trigger with aria-haspopup="menu", and it's the only
// such trigger rendered inside the top-bar portal.
function kebabTrigger(page: Page) {
  return page.locator('button[aria-haspopup="menu"]').first();
}

test.describe("deck editor shell", () => {
  test.describe("auth gate", () => {
    test("redirects anonymous users from /decks/<id> to /login", async ({ page }) => {
      await page.goto(`/decks/${BOGUS_DECK_ID}`);
      await expect(page).toHaveURL(/\/login\b/);
      const url = new URL(page.url());
      expect(url.searchParams.get("redirect") ?? "").toContain(`/decks/${BOGUS_DECK_ID}`);
    });
  });

  test.describe("invalid deck id", () => {
    test("renders the route error fallback on a non-existent deck", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await page.goto(`/decks/${BOGUS_DECK_ID}`);
      // RouteErrorFallback always renders a "Reshuffle" reload button; the
      // heading/subtext copy is randomized per error seed.
      await expect(page.getByRole("button", { name: "Reshuffle" })).toBeVisible({
        timeout: 15_000,
      });
      expect(new URL(page.url()).pathname).toBe(`/decks/${BOGUS_DECK_ID}`);
    });
  });

  test.describe("top bar", () => {
    test("renders back link, title, badge, save status, desktop actions, and kebab menu", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "Shell Test Deck",
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);

      // Title shows the deck name on desktop.
      await expect(page.getByText("Shell Test Deck").first()).toBeVisible({ timeout: 15_000 });

      // Back arrow links to /decks.
      const backLink = page.locator('a[href="/decks"]').first();
      await expect(backLink).toBeVisible();

      // Format badge: a fresh constructed deck may render either the valid
      // "Constructed ✓" branch or the amber "N issue(s)" violation branch;
      // both render text starting with "Constructed".
      await expect(page.getByText(/Constructed/).first()).toBeVisible();

      // Save status: fresh deck, not dirty, not saving → "Saved" tooltip.
      // The indicator is a non-interactive tooltip trigger; hover it and
      // assert the tooltip content.
      const savedTrigger = page.locator('[data-slot="tooltip-trigger"]').first();
      await savedTrigger.hover();
      await expect(page.getByRole("tooltip", { name: "Saved" })).toBeVisible();

      // Desktop-only action buttons.
      await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Proxies" })).toBeVisible();

      // Kebab menu opens a dropdown with a Rename item.
      await kebabTrigger(page).click();
      await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();

      // Close the menu before navigating.
      await page.keyboard.press("Escape");

      // Back arrow returns to /decks and the list renders.
      await backLink.click();
      await expect(page).toHaveURL(/\/decks$/, { timeout: 15_000 });
      await expect(page.getByRole("link", { name: /Shell Test Deck/ })).toBeVisible();
    });
  });

  test.describe("rename", () => {
    test("renames the deck and the new name propagates to the list", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "Rename Me",
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByText("Rename Me").first()).toBeVisible({ timeout: 15_000 });

      await kebabTrigger(page).click();
      await page.getByRole("menuitem", { name: "Rename" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Rename deck" })).toBeVisible();
      const input = dialog.getByRole("textbox");
      await expect(input).toHaveValue("Rename Me");

      await input.fill("Renamed");

      const updateRequest = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn(request.url(), "updateDeckFn"),
      );
      await dialog.getByRole("button", { name: "Save" }).click();
      await updateRequest;

      await expect(dialog).toBeHidden();
      await expect(page.getByText("Renamed").first()).toBeVisible({ timeout: 15_000 });

      await page.goto("/decks");
      await expect(page.getByRole("heading", { level: 3, name: "Renamed" })).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test.describe("format badge", () => {
    test("freeform deck renders the valid green badge", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "Freeform Badge",
        format: "freeform",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByText("Freeform Badge").first()).toBeVisible({ timeout: 15_000 });

      // Freeform never produces violations — the valid "Freeform" badge
      // renders as a plain span with a check icon and no "issues" suffix.
      await expect(page.getByText(/^Freeform$/)).toBeVisible();
      await expect(page.getByText(/issues?/)).toHaveCount(0);
    });

    test("empty constructed deck shows the violation badge with a popover", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "Invalid Constructed",
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByText("Invalid Constructed").first()).toBeVisible({ timeout: 15_000 });

      // Empty constructed decks fail multiple rules (no legend, missing
      // cards, etc.) so the amber "N issue(s)" badge always renders.
      const violationBadge = page.getByText(/\d+ issues?/).first();
      await expect(violationBadge).toBeVisible();

      await violationBadge.click();
      const popover = page.locator('[data-slot="popover-content"]').first();
      await expect(popover).toBeVisible();
      const firstViolation = popover.locator("li").first();
      await expect(firstViolation).toBeVisible();
      await expect(firstViolation).not.toBeEmpty();
    });
  });

  test.describe("save status", () => {
    // Flipping `isDirty` requires card-zone edits in the deck-builder store —
    // those flows live in chunks 3/4. This chunk asserts only the steady
    // "Saved" state of a freshly-loaded deck.
    test("fresh deck shows the Saved tooltip", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "Saved Status",
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByText("Saved Status").first()).toBeVisible({ timeout: 15_000 });

      const savedTrigger = page.locator('[data-slot="tooltip-trigger"]').first();
      await savedTrigger.hover();
      await expect(page.getByRole("tooltip", { name: "Saved" })).toBeVisible();
    });

    test.skip("unsaved + saving states require card edits (chunks 3/4)", () => {
      // Dirty state only flips when cards are added/removed/reordered via the
      // deck-builder store. Rename mutations go through a different code path
      // that does not touch `isDirty`. Covered in chunks 3 and 4.
    });
  });

  test.describe("zones sidebar", () => {
    test("desktop renders the expected zone sections for a constructed deck", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "Zones Desktop",
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByText("Zones Desktop").first()).toBeVisible({ timeout: 15_000 });

      // Zone order comes from the init query, so we assert that each expected
      // zone label appears at least once rather than a strict ordering.
      for (const label of [
        "Legend",
        "Chosen Champion",
        "Runes",
        "Battlefields",
        "Main Deck",
        "Sideboard",
        "Overflow",
      ]) {
        await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
      }
    });

    test("mobile: sidebar is closed by default; title shows the active zone + count", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      await page.setViewportSize({ width: 390, height: 844 });

      const deckId = await createDeckViaApi(page.request, {
        name: "Zones Mobile",
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);

      // Sidebar closed → the "Deck Zones" heading is not visible.
      await expect(page.getByRole("heading", { name: "Deck Zones" })).toBeHidden({
        timeout: 15_000,
      });

      // Mobile title is a button whose text is a zone name (or "Deck" when
      // activeZone is null) followed by a parenthesized count.
      const mobileTitle = page
        .getByRole("button")
        .filter({ hasText: /\(\d+\)/ })
        .first();
      await expect(mobileTitle).toBeVisible();

      // Tapping the title toggles the sidebar open.
      await mobileTitle.click();
      await expect(page.getByRole("heading", { name: "Deck Zones" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
    });
  });

  test.describe("hovered card preview", () => {
    // The preview is a floating portal rendered by HoveredCardPreview with
    // empty alt text and no role — by our conventions we don't add a
    // data-testid just to locate it. A real card must also be seeded into the
    // deck to trigger the preview, which belongs to chunks 3/4.
    test.skip("hovering a card row shows the preview (chunks 3/4)", () => {
      // Covered once the card browser / zone drag-drop flows land.
    });
  });

  test.describe("SEO", () => {
    test("sets title and noindex robots meta on /decks/<id>", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "SEO Deck",
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page).toHaveTitle(/Deck Editor/, { timeout: 15_000 });
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute("content", /noindex/);
    });
  });
});
