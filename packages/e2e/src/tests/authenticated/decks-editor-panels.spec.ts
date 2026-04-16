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
  return page.getByRole("button", { name: /^Stats\b/ });
}

function ownershipHeader(page: Page) {
  return page.getByRole("button", { name: /^Ownership\b/ });
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

      await page.goto(`/decks/${deckId}`);
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

      await page.goto(`/decks/${deckId}`);
      const header = statsHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await expect(header).toContainText("3 cards");

      // The single Fury segment is the only tooltip trigger inside the header
      // — hover it and assert the tooltip content.
      const segment = header.locator('[data-slot="tooltip-trigger"]').first();
      await expect(segment).toBeVisible();
      await segment.hover();
      await expect(page.getByRole("tooltip", { name: "Fury: 3" })).toBeVisible();

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
  });

  test.describe("ownership panel visibility", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("empty deck renders 0% with 0 / 0", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-empty");
      const deckId = await apiCreateDeck(page, "Empty Ownership");

      await page.goto(`/decks/${deckId}`);
      const header = ownershipHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await expect(header).toContainText("0%");

      await header.click();
      await expect(page.getByText("Owned").first()).toBeVisible();
      await expect(page.getByText(/^0 \/ 0$/)).toBeVisible();
      // Missing row is suppressed when missingCount is 0.
      await expect(page.getByText("Missing", { exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "View missing cards" })).toBeHidden();
    });

    test("zero owned shows 0% and a missing row", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-zero");
      const deckId = await apiCreateDeck(page, "Zero Owned");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);

      await page.goto(`/decks/${deckId}`);
      const header = ownershipHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await expect(header).toContainText("0%");

      await header.click();
      await expect(page.getByText(/^0 \/ 3$/)).toBeVisible();
      await expect(page.getByText(/^3 cards$/)).toBeVisible();
      await expect(page.getByRole("button", { name: "View missing cards" })).toBeVisible();
    });

    test("partial ownership shows rounded pct and per-zone Missing count", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-partial");
      const deckId = await apiCreateDeck(page, "Partial Owned");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);
      await apiAddCopiesToInbox(page, ANNIE_PRINTING_ID, 2);

      await page.goto(`/decks/${deckId}`);
      const header = ownershipHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      // 2 / 3 → round(66.66…%) = 67%.
      await expect(header).toContainText("67%");

      await header.click();
      await expect(page.getByText(/^2 \/ 3$/)).toBeVisible();
      await expect(page.getByText(/^1 card$/)).toBeVisible();
    });

    test("full ownership shows 100% with no Missing row", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-full");
      const deckId = await apiCreateDeck(page, "Full Owned");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);
      await apiAddCopiesToInbox(page, ANNIE_PRINTING_ID, 3);

      await page.goto(`/decks/${deckId}`);
      const header = ownershipHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await expect(header).toContainText("100%");

      await header.click();
      await expect(page.getByText(/^3 \/ 3$/)).toBeVisible();
      await expect(page.getByText("Missing", { exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "View missing cards" })).toBeHidden();
    });
  });

  test.describe("ownership panel values", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("renders TCGplayer-formatted Deck/Owned/Missing values", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-values");
      const deckId = await apiCreateDeck(page, "Priced Deck");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);
      await apiAddCopiesToInbox(page, ANNIE_PRINTING_ID, 1);

      await page.goto(`/decks/${deckId}`);
      const header = ownershipHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await header.click();

      // tcgplayer is the default favorite marketplace; formatPrice → "$X.XX".
      await expect(page.getByText("TCGplayer prices")).toBeVisible();

      const usdPrice = /^\$\d+\.\d{2}$/;
      const deckRow = page.getByText("Deck value").locator("..");
      const ownedRow = page.getByText("Owned value").locator("..");
      const missingRow = page.getByText("Missing value").locator("..");
      await expect(deckRow.getByText(usdPrice)).toBeVisible();
      await expect(ownedRow.getByText(usdPrice)).toBeVisible();
      // Missing row is visible because shortfall > 0 and Annie has prices.
      await expect(missingRow.getByText(usdPrice)).toBeVisible();
    });

    test("hides Missing value row when there's no shortfall", async ({ page }) => {
      userEmail = await createAndLogin(page, "own-values-full");
      const deckId = await apiCreateDeck(page, "Priced Full");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 2 }]);
      await apiAddCopiesToInbox(page, ANNIE_PRINTING_ID, 2);

      await page.goto(`/decks/${deckId}`);
      const header = ownershipHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await header.click();

      await expect(page.getByText("Deck value")).toBeVisible();
      await expect(page.getByText("Owned value")).toBeVisible();
      await expect(page.getByText("Missing value")).toBeHidden();
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
      const header = ownershipHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await header.click();

      await page.getByRole("button", { name: "View missing cards" }).click();

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
      await expect(annieLink).toHaveAttribute(
        "href",
        /tcgplayer\.com\/search\/riftbound\/product\?q=Annie/,
      );

      // Both cards are in zone "main" → ZONE_LABELS["main"] = "Main".
      await expect(dialog.getByRole("cell", { name: "Main" })).toHaveCount(2);

      const copyButton = dialog.getByRole("button", { name: "Copy to clipboard" });
      await copyButton.click();
      await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();

      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      const lines = clipboardText.split(/\r\n/);
      // Sorted by zone label then card name → Annie before Tibbers.
      expect(lines[0]).toMatch(/^2x Annie, Fiery\b/);
      expect(lines[1]).toMatch(/^2x Tibbers\b/);

      // Reverts after the 2s timeout.
      await expect(dialog.getByRole("button", { name: "Copy to clipboard" })).toBeVisible({
        timeout: 5000,
      });
    });

    test("closes on Escape", async ({ page }) => {
      userEmail = await createAndLogin(page, "missing-escape");
      const deckId = await apiCreateDeck(page, "Missing Escape");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);

      await page.goto(`/decks/${deckId}`);
      const header = ownershipHeader(page);
      await expect(header).toBeVisible({ timeout: 15_000 });
      await header.click();
      await page.getByRole("button", { name: "View missing cards" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  });

  // Skipped: a fresh user always has an Inbox auto-created on the first
  // copies POST, and `useOwnedCount` returns an empty record (not undefined)
  // when the user is signed in. That makes the "no ownership data" branch
  // unreachable from e2e — covered by the unit test on `useDeckOwnership`.
  test.describe.skip("no ownership data", () => {
    test("panel is not rendered when ownershipData is undefined", () => {});
  });

  test.describe("mobile", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("both panels start collapsed and expand on tap", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });

      userEmail = await createAndLogin(page, "mobile");
      const deckId = await apiCreateDeck(page, "Mobile Panels");
      await apiSetDeckCards(page, deckId, [{ cardId: ANNIE_CARD_ID, zone: "main", quantity: 3 }]);

      await page.goto(`/decks/${deckId}`);

      // The mobile zones drawer is closed by default — tap the activeZone
      // title to open the sidebar where the panels live.
      const mobileTitle = page
        .getByRole("button")
        .filter({ hasText: /\(\d+\)/ })
        .first();
      await mobileTitle.click();

      const stats = statsHeader(page);
      const ownership = ownershipHeader(page);
      await expect(stats).toBeVisible();
      await expect(ownership).toBeVisible();

      // Mobile defaults: stats collapsed (matchMedia >=768px is false),
      // ownership always starts closed.
      await expect(page.getByRole("heading", { level: 4, name: "Energy" })).toBeHidden();
      await expect(page.getByText("Owned").first()).toBeHidden();

      await stats.click();
      await expect(page.getByRole("heading", { level: 4, name: "Energy" })).toBeVisible();

      await ownership.click();
      await expect(page.getByText("Owned").first()).toBeVisible();
    });
  });
});
