import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

// Seed printings (apps/api/src/test/fixtures/seed.sql).
// Set prefix: OGS. All cards below have an English "normal" and "foil" printing unless noted.
const ANNIE_FIERY_NORMAL = "019cfc3b-03d6-74cf-adec-1dce41f631eb"; // OGS-001 EN normal
const ANNIE_STUBBORN_NORMAL = "019cfc3b-03d6-755e-8d42-32464c0bf236"; // OGS-010 EN normal
const GAREN_RUGGED_NORMAL = "019cfc3b-03d6-752a-adc5-19033009d65d"; // OGS-007 EN normal

interface CollectionSummary {
  id: string;
  name: string;
  isInbox: boolean;
}

interface CopyEntry {
  id: string;
  printingId: string;
  collectionId: string;
}

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Import E2E" },
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

async function createAndLogin(page: Page): Promise<string> {
  const sql = loadDb();
  const email = `coll-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "CollImportE2e1!";
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

async function fetchCollections(request: APIRequestContext): Promise<CollectionSummary[]> {
  const response = await request.get(`${API_BASE_URL}/api/v1/collections`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { items: CollectionSummary[] };
  return body.items;
}

async function findInbox(request: APIRequestContext): Promise<CollectionSummary> {
  const items = await fetchCollections(request);
  const inbox = items.find((item) => item.isInbox);
  if (!inbox) {
    throw new Error("Inbox not found");
  }
  return inbox;
}

async function createCollectionViaApi(
  request: APIRequestContext,
  name: string,
): Promise<CollectionSummary> {
  const response = await request.post(`${API_BASE_URL}/api/v1/collections`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as CollectionSummary;
}

async function seedCopies(
  request: APIRequestContext,
  printingId: string,
  collectionId: string,
  count: number,
) {
  const copies = Array.from({ length: count }, () => ({ printingId, collectionId }));
  const response = await request.post(`${API_BASE_URL}/api/v1/copies`, {
    headers: { Origin: WEB_BASE_URL },
    data: { copies },
  });
  expect(response.ok()).toBeTruthy();
}

async function fetchCopies(request: APIRequestContext, collectionId: string): Promise<CopyEntry[]> {
  // GET /api/v1/copies returns all copies for the user (no server-side
  // collection filter); filter client-side.
  const response = await request.get(`${API_BASE_URL}/api/v1/copies`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { items: CopyEntry[] };
  return body.items.filter((item) => item.collectionId === collectionId);
}

// TanStack Start encodes the server fn id as base64url(JSON). Decoding lets us
// target a specific server fn without matching unrelated ones.
function isServerFn(constName: string) {
  return (url: string) => {
    const match = url.match(/\/_serverFn\/([^/?#]+)/);
    if (!match) {
      return false;
    }
    try {
      return Buffer.from(match[1], "base64url").toString("utf-8").includes(constName);
    } catch {
      return false;
    }
  };
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

const EXPORT_HEADER =
  "Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Promo,Language,Quantity";

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function buildOpenRiftCsv(
  rows: {
    cardId: string;
    cardName: string;
    rarity?: string;
    type?: string;
    domain?: string;
    finish?: string;
    artVariant?: string;
    promo?: string;
    language?: string;
    quantity: number;
  }[],
): string {
  const lines: string[] = [EXPORT_HEADER];
  for (const row of rows) {
    const cells = [
      row.cardId,
      row.cardName,
      row.rarity ?? "Common",
      row.type ?? "Unit",
      row.domain ?? "Fury",
      row.finish ?? "normal",
      row.artVariant ?? "normal",
      row.promo ?? "",
      row.language ?? "EN",
      String(row.quantity),
    ].map((value) => escapeCsvField(value));
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

async function readDownload(page: Page, trigger: () => Promise<void>) {
  const downloadPromise = page.waitForEvent("download");
  await trigger();
  const download = await downloadPromise;
  const path = await download.path();
  const csv = await readFile(path, "utf-8");
  return { filename: download.suggestedFilename(), csv };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("collections import/export", () => {
  test.describe("top bar / shell", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("renders the top bar title and both export + import sections on the same step", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections/import");

      await expect(page.getByRole("heading", { name: "Import / Export" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("heading", { name: "Export Collection" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible();
    });
  });

  test.describe("export", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("button is disabled with 0 copies and enabled after seeding", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const inbox = await findInbox(page.request);

      await page.goto("/collections/import");
      const exportButton = page.getByRole("button", { name: /^Export \d+ cop(y|ies)$/ });
      await expect(exportButton).toBeVisible({ timeout: 15_000 });
      await expect(exportButton).toHaveText(/Export 0 copies/);
      await expect(exportButton).toBeDisabled();

      await seedCopies(page.request, ANNIE_FIERY_NORMAL, inbox.id, 5);

      await page.reload();
      await expect(page.getByRole("button", { name: /^Export 5 copies$/ })).toBeEnabled({
        timeout: 15_000,
      });
    });

    test("narrowing scope to Inbox updates the count and filename", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const inbox = await findInbox(page.request);
      const other = await createCollectionViaApi(page.request, "Shelf");
      await seedCopies(page.request, ANNIE_FIERY_NORMAL, inbox.id, 2);
      await seedCopies(page.request, GAREN_RUGGED_NORMAL, other.id, 3);

      await page.goto("/collections/import");
      // Default: All Cards → 5 copies.
      await expect(page.getByRole("button", { name: /^Export 5 copies$/ })).toBeEnabled({
        timeout: 15_000,
      });

      // Switch scope to Inbox.
      const scopeTrigger = page.locator("#export-collection");
      await scopeTrigger.click();
      await page.getByRole("option", { name: "Inbox" }).click();
      await expect(page.getByRole("button", { name: /^Export 2 copies$/ })).toBeEnabled();

      const { filename, csv } = await readDownload(page, async () => {
        await page.getByRole("button", { name: /^Export 2 copies$/ }).click();
      });

      expect(filename).toMatch(/^openrift-inbox-\d{4}-\d{2}-\d{2}\.csv$/);
      const lines = csv.split("\n");
      expect(lines[0]).toBe(EXPORT_HEADER);
      // Single printing with 2 copies → 1 data row.
      expect(lines).toHaveLength(2);
      expect(lines[1]).toMatch(/,2$/);

      await expect(page.getByText("Collection exported.")).toBeVisible();
    });

    test("exporting All Cards uses the all-cards filename and matches the seed count", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      const inbox = await findInbox(page.request);
      await seedCopies(page.request, ANNIE_FIERY_NORMAL, inbox.id, 3);
      await seedCopies(page.request, GAREN_RUGGED_NORMAL, inbox.id, 1);

      await page.goto("/collections/import");
      const exportButton = page.getByRole("button", { name: /^Export 4 copies$/ });
      await expect(exportButton).toBeEnabled({ timeout: 15_000 });

      const { filename, csv } = await readDownload(page, async () => {
        await exportButton.click();
      });

      expect(filename).toMatch(/^openrift-all-cards-\d{4}-\d{2}-\d{2}\.csv$/);
      const lines = csv.split("\n");
      expect(lines[0]).toBe(EXPORT_HEADER);
      // Two unique printings → 2 data rows, quantities 3 and 1.
      expect(lines).toHaveLength(3);
      const quantities = lines.slice(1).map((line) => line.split(",").at(-1));
      expect(quantities.sort()).toEqual(["1", "3"]);
    });
  });

  test.describe("import step 1: input", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("Parse is disabled until text is entered, and enabled once it is", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections/import");

      const parseButton = page.getByRole("button", { name: /^Parse$/ });
      await expect(parseButton).toBeVisible({ timeout: 15_000 });
      await expect(parseButton).toBeDisabled();

      await page.getByPlaceholder("Paste your CSV data here...").fill("hello");
      await expect(parseButton).toBeEnabled();
    });

    test("uploading a CSV file advances to the preview step", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections/import");
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible({
        timeout: 15_000,
      });

      const csv = buildOpenRiftCsv([
        { cardId: "OGS-007", cardName: "Garen, Rugged", rarity: "Rare", quantity: 2 },
      ]);

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: "test.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });

      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
    });

    test("unparseable input produces a parse-errors message and stays on step 1", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections/import");
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible({
        timeout: 15_000,
      });

      await page
        .getByPlaceholder("Paste your CSV data here...")
        .fill("not a csv at all\njust text");
      await page.getByRole("button", { name: /^Parse$/ }).click();

      await expect(page.getByText(/Couldn't recognize this format/)).toBeVisible();
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Import Preview" })).toHaveCount(0);
    });

    test("external links open in new tabs with rel=noreferrer", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections/import");

      const expected: [string, RegExp][] = [
        ["Piltover Archive", /piltoverarchive\.com/],
        ["RiftCore", /riftcore\.app/],
        ["RiftMana", /riftmana\.com/],
        ["Discord", /discord\.gg/],
        ["GitHub", /github\.com\/openriftapp\/openrift/],
      ];

      for (const [name, hrefPattern] of expected) {
        const link = page.getByRole("link", { name }).first();
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noreferrer");
        await expect(link).toHaveAttribute("href", hrefPattern);
      }
    });

    test("fallback language dropdown defaults to Auto-detect and can be changed", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await page.goto("/collections/import");
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible({
        timeout: 15_000,
      });

      const languageTrigger = page.locator("#fallback-language");
      await expect(languageTrigger).toContainText("Auto-detect");

      await languageTrigger.click();
      await page.getByRole("option", { name: "English" }).click();
      await expect(languageTrigger).toContainText("English");
    });
  });

  test.describe("round-trip: export then re-import", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("exports a mix of copies and re-imports them into a new collection", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const inbox = await findInbox(page.request);
      const roundTrip = await createCollectionViaApi(page.request, "Round-trip");
      await seedCopies(page.request, ANNIE_FIERY_NORMAL, inbox.id, 3);
      await seedCopies(page.request, ANNIE_STUBBORN_NORMAL, inbox.id, 2);

      // Export via the Export button.
      await page.goto("/collections/import");
      const exportButton = page.getByRole("button", { name: /^Export 5 copies$/ });
      await expect(exportButton).toBeEnabled({ timeout: 15_000 });
      const { csv } = await readDownload(page, async () => {
        await exportButton.click();
      });
      expect(csv.split("\n")[0]).toBe(EXPORT_HEADER);

      // Paste the same CSV and parse.
      await page.getByPlaceholder("Paste your CSV data here...").fill(csv);
      await page.getByRole("button", { name: /^Parse$/ }).click();

      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("2 rows parsed, 2 unique printings")).toBeVisible();
      await expect(page.getByText("2 ready")).toBeVisible();

      const importButton = page.getByRole("button", { name: /^Import 5 copies$/ });
      await expect(importButton).toBeVisible();

      // Pick Round-trip as target and import.
      const targetTrigger = page.getByRole("combobox").last();
      await targetTrigger.click();
      await page.getByRole("option", { name: "Round-trip" }).click();

      const addCopiesPromise = page.waitForRequest(
        (request) => request.method() === "POST" && request.url().endsWith("/api/v1/copies"),
      );
      await importButton.click();
      await addCopiesPromise;

      await expect(page).toHaveURL(new RegExp(`/collections/${roundTrip.id}$`), {
        timeout: 15_000,
      });
      await expect(page.getByText(/Imported 5 copies\./)).toBeVisible();

      // Inbox still has the original 5, Round-trip has 5 copies.
      const [inboxCopies, roundTripCopies] = await Promise.all([
        fetchCopies(page.request, inbox.id),
        fetchCopies(page.request, roundTrip.id),
      ]);
      expect(inboxCopies).toHaveLength(5);
      expect(roundTripCopies).toHaveLength(5);
      const roundTripPrintings = new Set(roundTripCopies.map((copy) => copy.printingId));
      expect(roundTripPrintings.has(ANNIE_FIERY_NORMAL)).toBe(true);
      expect(roundTripPrintings.has(ANNIE_STUBBORN_NORMAL)).toBe(true);
    });
  });

  test.describe("preview: row states and actions", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    async function gotoPreview(page: Page) {
      const csv = buildOpenRiftCsv([
        // Exact: catalog has OGS-007 EN normal.
        { cardId: "OGS-007", cardName: "Garen, Rugged", rarity: "Rare", quantity: 2 },
        // Needs review: valid-format code that doesn't exist, but name fuzzy-matches.
        // artVariant=altart has no match among Annie Fiery's EN printings, so the
        // matcher returns needs-review with candidates.
        {
          cardId: "XXX-001",
          cardName: "Annie, Fiery",
          rarity: "Epic",
          artVariant: "altart",
          quantity: 1,
        },
        // Unresolved: neither the code nor the name exist in the catalog.
        {
          cardId: "XXX-999",
          cardName: "Totally Fake Nonexistent Card",
          rarity: "Common",
          quantity: 1,
        },
      ]);

      await page.goto("/collections/import");
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByPlaceholder("Paste your CSV data here...").fill(csv);
      await page.getByRole("button", { name: /^Parse$/ }).click();
      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
    }

    test("summary badges reflect exact/needs-review/unresolved entries", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoPreview(page);

      // 1 exact match is ready; needs-review+unresolved both count as "need attention".
      await expect(page.getByText("1 ready")).toBeVisible();
      await expect(page.getByText("2 need attention")).toBeVisible();
      // No skipped badge yet.
      await expect(page.getByText(/^\d+ skipped$/)).toHaveCount(0);
    });

    test("skipping and unskipping a row updates the badges", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoPreview(page);

      // Rows are sorted exact → needs-review → unresolved, so the 3rd Skip
      // button corresponds to the unresolved "Totally Fake" row.
      const skipButtons = page.getByRole("button", { name: /^Skip$/ });
      await expect(skipButtons).toHaveCount(3);
      await skipButtons.nth(2).click();

      await expect(page.getByText("1 ready")).toBeVisible();
      await expect(page.getByText("1 need attention")).toBeVisible();
      await expect(page.getByText("1 skipped")).toBeVisible();

      // Unskip restores the previous state.
      await page.getByRole("button", { name: /^Unskip$/ }).click();
      await expect(page.getByText("2 need attention")).toBeVisible();
      await expect(page.getByText(/^\d+ skipped$/)).toHaveCount(0);
    });

    test("picking a variant on a needs-review row increments readyCount", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await gotoPreview(page);

      await expect(page.getByRole("button", { name: /^Import 2 copies$/ })).toBeVisible();

      // The needs-review row (Annie, Fiery with altart) exposes a VariantPicker
      // combobox whose trigger shows "Pick printing..." as placeholder text.
      const variantTrigger = page
        .getByRole("combobox")
        .filter({ hasText: /Pick printing/ })
        .first();
      await variantTrigger.click();
      await page.getByRole("option").first().click();

      await expect(page.getByText("2 ready")).toBeVisible();
      await expect(page.getByText("1 need attention")).toBeVisible();
      // Quantity of the Annie row was 1 → total copies becomes 3.
      await expect(page.getByRole("button", { name: /^Import 3 copies$/ })).toBeVisible();
    });

    test("Back returns to step 1 with the pasted text preserved", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const csv = buildOpenRiftCsv([
        { cardId: "OGS-007", cardName: "Garen, Rugged", rarity: "Rare", quantity: 1 },
      ]);

      await page.goto("/collections/import");
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible({
        timeout: 15_000,
      });
      const textarea = page.getByPlaceholder("Paste your CSV data here...");
      await textarea.fill(csv);
      await page.getByRole("button", { name: /^Parse$/ }).click();
      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: /^Back$/ }).click();
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible();
      await expect(page.getByPlaceholder("Paste your CSV data here...")).toHaveValue(csv);
    });
  });

  test.describe("import target: new collection", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    async function advanceToPreview(page: Page) {
      const csv = buildOpenRiftCsv([
        { cardId: "OGS-007", cardName: "Garen, Rugged", rarity: "Rare", quantity: 2 },
      ]);
      await page.goto("/collections/import");
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByPlaceholder("Paste your CSV data here...").fill(csv);
      await page.getByRole("button", { name: /^Parse$/ }).click();
      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
    }

    test("Import button is disabled until a new-collection name is entered", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await advanceToPreview(page);

      const targetTrigger = page.getByRole("combobox").last();
      await targetTrigger.click();
      await page.getByRole("option", { name: "+ Create new collection" }).click();

      await expect(page.getByLabel("Collection name")).toBeVisible();

      const importButton = page.getByRole("button", { name: /^Import 2 copies$/ });
      await expect(importButton).toBeDisabled();

      await page.getByLabel("Collection name").fill("Anything");
      await expect(importButton).toBeEnabled();
    });

    test("with a name, a new collection is created and receives the copies", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await advanceToPreview(page);

      const targetTrigger = page.getByRole("combobox").last();
      await targetTrigger.click();
      await page.getByRole("option", { name: "+ Create new collection" }).click();

      const nameInput = page.getByLabel("Collection name");
      await nameInput.fill("Imported Stash");

      const createPromise = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn("createCollectionFn")(request.url()),
      );
      const addCopiesPromise = page.waitForRequest(
        (request) => request.method() === "POST" && request.url().endsWith("/api/v1/copies"),
      );

      await page.getByRole("button", { name: /^Import 2 copies$/ }).click();
      await createPromise;
      await addCopiesPromise;

      await expect(page).toHaveURL(/\/collections\/[0-9a-f-]{36}$/, { timeout: 15_000 });
      await expect(page.getByText(/Imported 2 copies\./)).toBeVisible();

      const collections = await fetchCollections(page.request);
      const created = collections.find((col) => col.name === "Imported Stash");
      expect(created).toBeDefined();
    });
  });

  test.describe("import failure", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("shows an error toast when the copies add endpoint rejects", async ({ page }) => {
      userEmail = await createAndLogin(page);
      const target = await createCollectionViaApi(page.request, "Target");

      // Fail the POST /api/v1/copies call with a 500.
      await page.route("**/api/v1/copies", async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "simulated failure" }),
          });
          return;
        }
        await route.continue();
      });

      const csv = buildOpenRiftCsv([
        { cardId: "OGS-007", cardName: "Garen, Rugged", rarity: "Rare", quantity: 2 },
      ]);
      await page.goto("/collections/import");
      await expect(page.getByRole("heading", { name: "Import Collection" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByPlaceholder("Paste your CSV data here...").fill(csv);
      await page.getByRole("button", { name: /^Parse$/ }).click();
      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });

      const targetTrigger = page.getByRole("combobox").last();
      await targetTrigger.click();
      await page.getByRole("option", { name: "Target" }).click();

      await page.getByRole("button", { name: /^Import 2 copies$/ }).click();

      await expect(page.getByText("Import failed. Some cards may have been added.")).toBeVisible({
        timeout: 15_000,
      });
      // Stays on the import page; preview still visible.
      await expect(page).toHaveURL(/\/collections\/import$/);
      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible();

      // Target still empty.
      const targetCopies = await fetchCopies(page.request, target.id);
      expect(targetCopies).toHaveLength(0);
    });
  });

  test.describe("batching", () => {
    // Skipped: constructing a >500-copy CSV and exercising the batching loop in
    // useImportFlow.handleImport (apps/web/src/hooks/use-import-flow.ts, lines
    // 178-184, where `batchSize = 500`) is expensive to run end-to-end and the
    // batching logic is already covered by unit tests. Leaving a marker here so
    // a future pass can plug this in if we decide the coverage is worth the
    // runtime cost.
    test.skip("submits copies in 500-count batches", async () => {
      // Intentionally empty — see comment above.
    });
  });
});
