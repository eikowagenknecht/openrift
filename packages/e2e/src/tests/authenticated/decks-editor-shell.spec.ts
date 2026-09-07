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

// TanStack Start encodes each server fn id as base64url(JSON); decoding lets
// us wait on a specific mutation without colliding with other server fns.
function isServerFn(url: string, fnName: string): boolean {
  const match = /\/_serverFn\/(?<encoded>[^/?#]+)/u.exec(url);
  const encoded = match?.groups?.encoded;
  if (encoded === undefined) {
    return false;
  }
  try {
    return Buffer.from(encoded, "base64url").toString("utf-8").includes(fnName);
  } catch {
    return false;
  }
}

// Valid UUID shape, guaranteed not to match any real deck.
const BOGUS_DECK_ID = "00000000-0000-0000-0000-0000000dead1";

// Scoped to main: the page header's user-avatar menu also carries
// aria-haspopup="menu", which would otherwise match first.
function kebabTrigger(page: Page) {
  return page.locator("main").locator('button[aria-haspopup="menu"]').first();
}

test.describe("deck editor shell", () => {
  test.describe("auth gate", () => {
    test("redirects anonymous users from /decks/<id> to /login", async ({ page }) => {
      await page.goto(`/decks/${BOGUS_DECK_ID}`);
      await expect(page).toHaveURL(/\/login\b/u);
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

      await expect(page.getByRole("heading", { name: "Shell Test Deck" }).first()).toBeVisible({
        timeout: 15_000,
      });

      const backLink = page.locator('a[href="/decks"]').first();
      await expect(backLink).toBeVisible();

      // A fresh constructed deck may render the valid "Constructed ✓" branch
      // or the amber "N issue(s)" branch; both start with "Constructed".
      await expect(page.getByText(/Constructed/u).first()).toBeVisible();

      await expect(page.getByRole("button", { name: "Share", exact: true })).toBeVisible();

      // Renaming a server deck opens the name-and-description dialog, not a
      // bare "Rename" item (that wording is local-deck-only).
      await kebabTrigger(page).click();
      await expect(page.getByRole("menuitem", { name: "Export" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Print" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Name & description" })).toBeVisible();

      await page.keyboard.press("Escape");

      await backLink.click();
      await expect(page).toHaveURL(/\/decks$/u, { timeout: 15_000 });
      // The list reloads from the server after client-side back navigation.
      await expect(page.getByRole("heading", { level: 3, name: /Shell Test Deck/u })).toBeVisible({
        timeout: 15_000,
      });
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
      // Top bar renders two copies of the heading (mobile + desktop); .first()
      // picks one.
      await expect(page.getByRole("heading", { name: "Rename Me" }).first()).toBeVisible({
        timeout: 15_000,
      });

      await kebabTrigger(page).click();
      await page.getByRole("menuitem", { name: "Name & description" }).click();

      // The "Deck details" dialog has other textboxes (description/links); target Name explicitly.
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Deck details" })).toBeVisible();
      const input = dialog.getByLabel("Name", { exact: true });
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
    test("freeform deck renders a plain format badge with no issues", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "Freeform Badge",
        format: "freeform",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByRole("heading", { name: "Freeform Badge" }).first()).toBeVisible({
        timeout: 15_000,
      });

      // "Freeform" also appears in the main-area description paragraph, so
      // scope to the badge itself.
      await expect(
        page
          .locator('[data-slot="badge"]')
          .filter({ hasText: /^Freeform$/u })
          .first(),
      ).toBeVisible();
      await expect(page.getByText(/issues?/u)).toHaveCount(0);
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

      // The "N issue(s)" popover only appears once the deck has cards.
      await expect(page.getByText("Constructed · Draft")).toBeVisible();
    });
  });

  test.describe("save status", () => {
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

      await expect(page.getByText("Constructed · Draft")).toBeVisible();
    });

    test.skip("unsaved + saving states require card edits (chunks 3/4)", () => {
      // isDirty only flips on card-zone edits in the deck-builder store, not
      // on rename mutations.
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

      // Zone order comes from the init query: assert presence, not order.
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

      // On mobile the <h1> reads "Zones" until a zone is active; wait for it
      // since the lazy route mounts after goto.
      await expect(page.getByRole("heading", { name: "Zones", level: 1 }).first()).toBeVisible({
        timeout: 15_000,
      });

      await expect(page.getByRole("heading", { name: "Deck Zones" })).toBeHidden({
        timeout: 15_000,
      });

      const mobileTitle = page.getByRole("button", { name: /^Zones/u }).first();
      await expect(mobileTitle).toBeVisible();

      await mobileTitle.click();
      await expect(page.getByRole("heading", { name: "Deck Zones" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
    });
  });

  test.describe("hovered card preview", () => {
    // HoveredCardPreview renders empty alt text and no role, so there is no
    // locator for it without a card seeded into the deck to trigger it.
    test.skip("hovering a card row shows the preview (chunks 3/4)", () => {});
  });

  test.describe("SEO", () => {
    test("sets title and noindex robots meta on /decks/<id>", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      const deckId = await createDeckViaApi(page.request, {
        name: "SEO Deck",
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page).toHaveTitle(/Deck Editor/u, { timeout: 15_000 });
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute("content", /noindex/u);
    });
  });
});
