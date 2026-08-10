import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

// ── Seed-data anchors ──────────────────────────────────────────────────────
// Annie, Fiery — Unit, Champion super-type, single-domain Fury, energy 5,
// power 1. Has tcgplayer prices via OGS-001 EN normal printing.
const ANNIE_CARD_ID = "019cfc3b-038a-7c0c-a76c-e0a5e2f46b18";
const ANNIE_NAME = "Annie, Fiery";
const ANNIE_PRINTING_ID = "019cfc3b-03d6-74cf-adec-1dce41f631eb"; // OGS-001 EN normal

// Tibbers — Unit, Signature super-type, multi-domain (Fury + Chaos), energy 8,
// power 2. Has tcgplayer prices via OGS-018 EN normal printing.
const TIBBERS_CARD_ID = "019cfc3b-038a-7aef-b46a-dc08a7a17008";
const TIBBERS_NAME = "Tibbers";

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Editor Panels E2E" },
  });
  expect(response.ok()).toBeTruthy();
}

async function signIn(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-in/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
}

async function createAndLogin(page: Page, label: string): Promise<string> {
  const sql = loadDb();
  const email = `panels-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "EditorPanelsE2ePassword1!";
  try {
    await signUp(page.request, email, password);
    await sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
  } finally {
    await sql.end();
  }
  await signIn(page.request, email, password);
  return email;
}

async function deleteUser(email: string) {
  const sql = loadDb();
  try {
    await sql`DELETE FROM users WHERE email = ${email}`;
  } finally {
    await sql.end();
  }
}

async function apiCreateDeck(page: Page, name: string): Promise<string> {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/decks`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name, format: "constructed" },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

interface DeckCardSeed {
  cardId: string;
  zone: "main" | "champion" | "legend" | "runes" | "battlefield" | "sideboard" | "overflow";
  quantity: number;
}

async function apiSetDeckCards(page: Page, deckId: string, cards: DeckCardSeed[]) {
  const response = await page.request.put(`${API_BASE_URL}/api/v1/decks/${deckId}/cards`, {
    headers: { Origin: WEB_BASE_URL },
    data: { cards },
  });
  expect(response.ok()).toBeTruthy();
}

async function apiAddCopiesToInbox(page: Page, printingId: string, count: number) {
  const copies = Array.from({ length: count }, () => ({ printingId }));
  const response = await page.request.post(`${API_BASE_URL}/api/v1/copies`, {
    headers: { Origin: WEB_BASE_URL },
    data: { copies },
  });
  expect(response.ok()).toBeTruthy();
}

function statsHeader(page: Page) {
  // The sidebar's Stats collapsible is frameless — its trigger is the only
  // button whose accessible name starts with "Stats" and ends in a card count.
  return page.getByRole("button", { name: /^Stats\b.*\bcards$/u }).first();
}

/**
 * The sidebar Stats panel only shows while a zone is active (the overview
 * draws its own, larger stats band). The deck editor starts on Overview, so
 * tests that inspect the sidebar panel must click a zone first.
 */
async function activateSidebarPanels(page: Page): Promise<void> {
  // Pick Main Deck (exists for every format we test). The zone label is a
  // Pressable named "Edit <zone>"; clicking it switches away from Overview and
  // reveals the Stats panel below the zones. Retry in case the sidebar hasn't
  // finished hydrating yet.
  await expect(async () => {
    await page.getByRole("button", { name: "Edit Main Deck", exact: true }).first().click();
    await expect(statsHeader(page)).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 15_000 });
}

/**
 * Navigate to the deck editor and switch the sidebar out of Overview mode so
 * the Stats panel is visible for assertions.
 */
async function gotoDeckWithPanels(page: Page, deckId: string): Promise<void> {
  await page.goto(`/decks/${deckId}`);
  await activateSidebarPanels(page);
}

/**
 * The hero's ownership chip — the deck's single missing-cards entry point.
 * @returns The chip locator.
 */
function missingChip(page: Page) {
  return page.getByRole("button", { name: /\bmissing$/u }).first();
}

test.describe("deck editor panels", () => {
  test.describe("stats panel", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("empty deck shows zero count and no domain bar", async ({ page }) => {
      userEmail = await createAndLogin(page, "stats-empty");
      const deckId = await apiCreateDeck(page, "Empty Stats");

      await gotoDeckWithPanels(page, deckId);
      const header = statsHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await expect(header).toContainText("0 cards");

      // DomainBar returns null when totalCards is 0, so no tooltip triggers
      // appear inside the Stats button.
      await expect(header.locator('[data-slot="tooltip-trigger"]')).toHaveCount(0);

      // Charts return null when there is no data; the body is open by default
      // on desktop but contains nothing renderable.
      await expect(page.getByRole("heading", { level: 4, name: "Energy" })).toBeHidden();
      await expect(page.getByRole("heading", { level: 4, name: "Power" })).toBeHidden();
    });

    test("seeded single-domain deck shows count, domain bar tooltip, and chart body", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page, "stats-fury");
      const deckId = await apiCreateDeck(page, "Fury Stats");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);

      await gotoDeckWithPanels(page, deckId);
      const header = statsHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await expect(header).toContainText("3 cards");

      // The single Fury segment is the only tooltip trigger inside the header
      // — hover it and assert the tooltip content.
      const segment = header.locator('[data-slot="tooltip-trigger"]').first();
      await expect(segment).toBeVisible();
      await segment.hover();
      // BaseUI's TooltipContent renders the content without role="tooltip"
      // — match by text instead.
      await expect(page.getByText("Fury: 3", { exact: true })).toBeVisible();

      // Body is open by default on desktop. Energy + Power headings render
      // because Annie has both energy and power data; type breakdown shows
      // a Unit row.
      await expect(page.getByRole("heading", { level: 4, name: "Energy" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 4, name: "Power" })).toBeVisible();

      // Click the header to collapse → chart body hidden.
      await header.click();
      await expect(page.getByRole("heading", { level: 4, name: "Energy" })).toBeHidden();
      await expect(page.getByRole("heading", { level: 4, name: "Power" })).toBeHidden();
    });

    test("sidebar carries no ownership breakdown", async ({ page }) => {
      userEmail = await createAndLogin(page, "stats-no-ownership");
      const deckId = await apiCreateDeck(page, "No Sidebar Ownership");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);
      await apiAddCopiesToInbox(page, ANNIE_PRINTING_ID, 1);

      await gotoDeckWithPanels(page, deckId);
      await expect(statsHeader(page)).toBeVisible({ timeout: 15_000 });

      // The counts and the price block live on the overview's hero and its
      // Collection lens now — the sidebar shows charts only.
      await expect(page.getByText("Deck value")).toBeHidden();
      await expect(page.getByText("Owned value")).toBeHidden();
      await expect(page.getByRole("button", { name: "View missing cards" })).toBeHidden();
    });
  });

  test.describe("hero ownership chip", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("zero owned shows the full shortfall", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-zero");
      const deckId = await apiCreateDeck(page, "Zero Owned");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);

      await page.goto(`/decks/${deckId}`);
      const chip = missingChip(page);
      await expect(chip).toBeVisible({ timeout: 15_000 });
      await expect(chip).toContainText("0/3 owned");
      await expect(chip).toContainText("3 missing");
    });

    test("partial ownership counts only the shortfall", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-partial");
      const deckId = await apiCreateDeck(page, "Partial Owned");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);
      await apiAddCopiesToInbox(page, ANNIE_PRINTING_ID, 2);

      await page.goto(`/decks/${deckId}`);
      const chip = missingChip(page);
      await expect(chip).toBeVisible({ timeout: 15_000 });
      await expect(chip).toContainText("2/3 owned");
      await expect(chip).toContainText("1 missing");
    });

    test("full ownership swaps the chip for Fully owned", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-full");
      const deckId = await apiCreateDeck(page, "Full Owned");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);
      await apiAddCopiesToInbox(page, ANNIE_PRINTING_ID, 3);

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByText("Fully owned")).toBeVisible({ timeout: 15_000 });
      await expect(missingChip(page)).toBeHidden();
    });

    test("value chip opens the breakdown popover", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-values");
      const deckId = await apiCreateDeck(page, "Priced Deck");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);
      await apiAddCopiesToInbox(page, ANNIE_PRINTING_ID, 1);

      await page.goto(`/decks/${deckId}`);
      const valueChip = page.getByRole("button", { name: "Show value breakdown" });
      await expect(valueChip).toBeVisible({ timeout: 15_000 });

      // Match either "$X.XX" (TCGplayer/USD) or "X,XX €" (CardTrader/EUR) —
      // the default favorite marketplace varies by seed order.
      const priceRegex = /(?:\$\d+\.\d{2})|(?:\d+[.,]\d{2}\s?€)/u;
      await expect(valueChip.getByText(priceRegex)).toBeVisible();

      await valueChip.click();
      // Annie is short two copies, so the completion figure is present.
      const completeRow = page.getByText("To complete").locator("..");
      await expect(completeRow.getByText(priceRegex)).toBeVisible();
    });
  });

  test.describe("missing cards dialog", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("lists missing cards, links to marketplace search, copies to clipboard", async ({
      page,
      context,
    }) => {
      // Clipboard read/write requires permissions in Chromium.
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);

      userEmail = await createAndLogin(page, "missing");
      const deckId = await apiCreateDeck(page, "Missing Cards");
      await apiSetDeckCards(page, deckId, [
        { cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 },
        { cardId: TIBBERS_CARD_ID, zone: "main", quantity: 2 },
      ]);
      await apiAddCopiesToInbox(page, ANNIE_PRINTING_ID, 1);

      await page.goto(`/decks/${deckId}`);
      await expect(missingChip(page)).toBeVisible({ timeout: 15_000 });
      await missingChip(page).click();

      const dialog = page.getByRole("dialog");
      // Total shortfall = 2 (Annie) + 2 (Tibbers) = 4.
      await expect(dialog.getByText("Missing cards (4)")).toBeVisible();

      // Both rows render, with the card name as a marketplace search link.
      const annieLink = dialog.getByRole("link", { name: ANNIE_NAME });
      const tibbersLink = dialog.getByRole("link", { name: TIBBERS_NAME });
      await expect(annieLink).toBeVisible();
      await expect(tibbersLink).toBeVisible();

      await expect(annieLink).toHaveAttribute("target", "_blank");
      await expect(annieLink).toHaveAttribute("rel", "noreferrer");
      // The link points to the user's preferred marketplace (varies by seed),
      // so accept any known marketplace domain.
      await expect(annieLink).toHaveAttribute(
        "href",
        /(?:tcgplayer\.com|cardtrader\.com|cardmarket\.com)/u,
      );

      // Both cards are in zone "main", so the list groups them under a single
      // "Main Deck" heading (a plain label row, not a table header).
      await expect(dialog.getByText("Main Deck", { exact: true })).toHaveCount(1);

      // Two copy buttons now: a Cardmarket-flavored one and the plain list.
      const copyButton = dialog.getByRole("button", { name: "Copy list" });
      await copyButton.click();
      await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();

      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      const lines = clipboardText.split(/\r\n/u);
      // Sorted by zone label then card name → Annie before Tibbers. The clip
      // format now includes the printing short code and price.
      expect(lines[0]).toMatch(/^2x .*Annie, Fiery/u);
      expect(lines[1]).toMatch(/^2x .*Tibbers/u);

      // Reverts after the 2s timeout.
      await expect(dialog.getByRole("button", { name: "Copy list" })).toBeVisible({
        timeout: 5000,
      });
    });

    test("closes on Escape", async ({ page }) => {
      userEmail = await createAndLogin(page, "missing-escape");
      const deckId = await apiCreateDeck(page, "Missing Escape");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);

      await page.goto(`/decks/${deckId}`);
      await expect(missingChip(page)).toBeVisible({ timeout: 15_000 });
      await missingChip(page).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  });

  test.describe("mobile", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("stats panel starts collapsed and expands on tap", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });

      userEmail = await createAndLogin(page, "mobile");
      const deckId = await apiCreateDeck(page, "Mobile Panels");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);

      await page.goto(`/decks/${deckId}`);

      // The mobile zones drawer is closed by default and the deck opens on
      // Overview, so the top-bar title reads "Zones". Click it to open the
      // sidebar, then activate Main Deck to reveal the Stats panel below the
      // zones. Clicking the zone closes the drawer, so re-open it to inspect
      // the panel.
      await page
        .getByRole("button", { name: /^Zones/u })
        .first()
        .click();
      await page.getByRole("button", { name: "Edit Main Deck", exact: true }).first().click();
      // Re-open the sidebar after the zone click closed it. The title renders
      // as "Main Deck(3)" with no space — the count span has ml-1 margin but
      // no textual whitespace — so the regex matches an optional space.
      await page
        .getByRole("button", { name: /^Main Deck\s*\(\d+\)/u })
        .first()
        .click();

      const stats = statsHeader(page);
      await expect(stats).toBeVisible();

      // Mobile default: stats collapsed (matchMedia >=768px is false).
      await expect(page.getByRole("heading", { level: 4, name: "Energy" })).toBeHidden();

      await stats.click();
      await expect(page.getByRole("heading", { level: 4, name: "Energy" })).toBeVisible();
    });
  });
});
