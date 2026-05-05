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
// DropdownMenu marks its trigger with aria-haspopup="menu". The page header
// user-avatar menu also uses that attribute now, so scope to the main element
// (which the header is NOT inside) to find the deck kebab.
function kebabTrigger(page: Page) {
  return page.locator("main").locator('button[aria-haspopup="menu"]').first();
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
      await expect(page.getByRole("heading", { name: "Shell Test Deck" }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Back arrow links to /decks.
      const backLink = page.locator('a[href="/decks"]').first();
      await expect(backLink).toBeVisible();

      // Format badge: a fresh constructed deck may render either the valid
      // "Constructed ✓" branch or the amber "N issue(s)" violation branch;
      // both render text starting with "Constructed".
      await expect(page.getByText(/Constructed/).first()).toBeVisible();

      // (The "Saved" status tooltip indicator was removed from the top bar;
      // the "Constructed · Draft" badge now communicates the unsaved state.)

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
      // There are two copies of the deck name in the page top-bar (mobile and
      // desktop variants) — assert the heading is present, and use a role
      // lookup to match either the visible h1 or the kebab-menu Rename menu.
      await expect(page.getByRole("heading", { name: "Rename Me" }).first()).toBeVisible({
        timeout: 15_000,
      });

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
      await expect(page.getByRole("heading", { name: "Renamed" }).first()).toBeVisible({
        timeout: 15_000,
      });

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
      await expect(page.getByRole("heading", { name: "Freeform Badge" }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Freeform never produces violations — the valid "Freeform" badge
      // renders as a green span. "Freeform" also appears in the main-area
      // description paragraph, so scope to the badge span.
      await expect(
        page.locator('span[class*="bg-green-500"]').filter({ hasText: /^Freeform$/ }),
      ).toBeVisible();
      await expect(page.getByText(/issues?/)).toHaveCount(0);
    });

    test("empty constructed deck shows the Draft badge", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "Invalid Constructed",
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByRole("heading", { name: "Invalid Constructed" }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Empty constructed decks render the muted "Constructed · Draft" badge
      // (the "N issue(s)" popover only appears once the deck has cards).
      await expect(page.getByText("Constructed · Draft")).toBeVisible();
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
      await expect(page.getByRole("heading", { name: "Saved Status" }).first()).toBeVisible({
        timeout: 15_000,
      });

      // The "Saved" tooltip-trigger indicator was removed from the top bar.
      // On a fresh, unsaved deck the format badge now reads "Constructed · Draft"
      // instead — that's the new signal for "no unsaved edits yet".
      await expect(page.getByText("Constructed · Draft")).toBeVisible();
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
      await expect(page.getByRole("heading", { name: "Zones Desktop" }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Zone order comes from the init query, so we assert that each expected
      // zone label appears at least once rather than a strict ordering.
      for (const label of [
        "legend",
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

      // Wait for the deck editor to mount (the lazy route loads after goto).
      // On mobile the <h1> renders "Zones" when no zone is active (the deck
      // name only renders on desktop via md:inline), so wait for the mobile
      // title heading before interacting.
      await expect(page.getByRole("heading", { name: "Zones", level: 1 }).first()).toBeVisible({
        timeout: 15_000,
      });

      // Sidebar closed → the "Deck Zones" heading is not visible.
      await expect(page.getByRole("heading", { name: "Deck Zones" })).toBeHidden({
        timeout: 15_000,
      });

      // Mobile title shows "Zones" when no zone is active (the editor now
      // opens on the Overview), and zone+count once a zone is activated.
      const mobileTitle = page.getByRole("button", { name: /^Zones/ }).first();
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
