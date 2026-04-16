import { readFileSync } from "node:fs";

import { getCodeFromDeck } from "@piltoverarchive/riftbound-deck-codes";
import type { APIRequestContext, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";

type Sql = ReturnType<typeof connectToDb>;

// Known seed cards (apps/api/src/test/fixtures/seed.sql).
// OGS-001 "Annie, Fiery" — Champion (supertype)
// OGS-003 "Incinerate" — Spell (non-champion, safe for main deck)
// OGS-017 "Dark Child, Starter" — Legend (card type)
const OGS_ANNIE_FIERY_CODE = "OGS-001";
const OGS_INCINERATE_CODE = "OGS-003";

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Deck Import E2E" },
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
  const email = `decks-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "DecksImportE2e1!";
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

// TanStack Start encodes each server fn id as base64url(JSON); decoding the
// segment lets us target a specific server fn without colliding with others.
function isServerFn(fnName: string) {
  return (url: string) => {
    const match = url.match(/\/_serverFn\/([^/?#]+)/);
    if (!match) {
      return false;
    }
    try {
      return Buffer.from(match[1], "base64url").toString("utf-8").includes(fnName);
    } catch {
      return false;
    }
  };
}

// Build a real Piltover deck code from known-good OGS short codes so the
// happy-path round-trip exercises the library's decode path rather than a
// hand-crafted string.
function buildPiltoverSample(): string {
  return getCodeFromDeck(
    [
      { cardCode: OGS_ANNIE_FIERY_CODE, count: 3 },
      { cardCode: OGS_INCINERATE_CODE, count: 3 },
    ],
    [],
    OGS_ANNIE_FIERY_CODE,
  );
}

function buildTextSample(): string {
  return ["Legend:", "1 Dark Child, Starter", "", "MainDeck:", "3 Incinerate", "2 Firestorm"].join(
    "\n",
  );
}

// Positional TTS: index 0 = legend, 1 = chosen champion, 2+ = main deck.
function buildTtsSample(): string {
  return [
    "OGS-017-1", // Legend (index 0)
    `${OGS_ANNIE_FIERY_CODE}-1`, // Chosen champion (index 1)
    `${OGS_INCINERATE_CODE}-1`,
    `${OGS_INCINERATE_CODE}-1`,
    `${OGS_INCINERATE_CODE}-1`,
  ].join(" ");
}

async function goToImport(page: Page) {
  await page.goto("/decks/import");
  await expect(page.getByRole("heading", { name: "Import Deck" })).toBeVisible({ timeout: 15_000 });
}

async function advanceToPreviewWithPiltover(page: Page) {
  await goToImport(page);
  const code = buildPiltoverSample();
  await page.getByPlaceholder(/Piltover Archive deck code/i).fill(code);
  await page.getByRole("button", { name: /^Parse$/ }).click();
  await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("deck import", () => {
  test.describe("step 1: input", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("renders the title, all three format tabs, and default Piltover placeholder", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      await expect(page.getByRole("tab", { name: "Deck Code" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Text" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "TTS" })).toBeVisible();

      // Default tab is Piltover ("Deck Code").
      await expect(page.getByRole("tab", { name: "Deck Code" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByPlaceholder(/Piltover Archive deck code/i)).toBeVisible();
    });

    test("switching tabs updates the textarea placeholder for each format", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      await page.getByRole("tab", { name: "Text" }).click();
      await expect(page.getByPlaceholder(/Legend:/)).toBeVisible();

      await page.getByRole("tab", { name: "TTS" }).click();
      await expect(page.getByPlaceholder(/OGN-001-1/)).toBeVisible();
    });

    test("Parse button is disabled until the textarea has content", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      const parseButton = page.getByRole("button", { name: /^Parse$/ });
      await expect(parseButton).toBeDisabled();

      await page.getByPlaceholder(/Piltover Archive deck code/i).fill("ABCDEF");
      await expect(parseButton).toBeEnabled();
    });

    test("external source links open in new tabs with rel=noreferrer", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      // Piltover tab — Piltover Archive link.
      const piltoverLink = page.getByRole("link", { name: "Piltover Archive" }).first();
      await expect(piltoverLink).toHaveAttribute("target", "_blank");
      await expect(piltoverLink).toHaveAttribute("rel", "noreferrer");
      await expect(piltoverLink).toHaveAttribute("href", /piltoverarchive\.com/);

      // Text tab — includes Piltover Archive and TCG Arena links.
      await page.getByRole("tab", { name: "Text" }).click();
      const tcgArena = page.getByRole("link", { name: "TCG Arena" });
      await expect(tcgArena).toHaveAttribute("href", /tcg-arena\.fr/);
      await expect(tcgArena).toHaveAttribute("rel", "noreferrer");

      // TTS tab — Tabletop Simulator mod link.
      await page.getByRole("tab", { name: "TTS" }).click();
      const ttsLink = page.getByRole("link", { name: "Tabletop Simulator mod" });
      await expect(ttsLink).toHaveAttribute("href", /steamcommunity\.com/);
      await expect(ttsLink).toHaveAttribute("rel", "noreferrer");
    });
  });

  test.describe("step 1: parse warnings", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("invalid Piltover code surfaces a warning and stays on step 1", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      await page.getByPlaceholder(/Piltover Archive deck code/i).fill("NOT-A-REAL-CODE!!!");
      await page.getByRole("button", { name: /^Parse$/ }).click();

      await expect(page.getByText(/Invalid Piltover Archive deck code/)).toBeVisible();
      // Still on step 1: heading is "Import Deck", not "Import Preview".
      await expect(page.getByRole("heading", { name: "Import Deck" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Import Preview" })).toHaveCount(0);
    });

    test("unparseable Text-format lines still advance to preview but note warnings", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      await page.getByRole("tab", { name: "Text" }).click();
      // One valid line (advances to preview) + one unknown zone header + one malformed line.
      await page
        .getByPlaceholder(/Legend:/)
        .fill(["BogusZone:", "not-a-card-line", "3 Incinerate"].join("\n"));
      await page.getByRole("button", { name: /^Parse$/ }).click();

      // With at least one valid entry, the flow advances; warnings collapse into
      // a details block on the preview.
      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/warning/)).toBeVisible();
    });
  });

  test.describe("step 2: preview (Piltover happy path)", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("advances to preview, shows summary + defaults, and Back preserves the textarea", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      const code = buildPiltoverSample();

      await goToImport(page);
      await page.getByPlaceholder(/Piltover Archive deck code/i).fill(code);
      await page.getByRole("button", { name: /^Parse$/ }).click();

      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/\d+ cards? parsed/)).toBeVisible();

      // Summary: everything in our sample resolves exactly, so there's a
      // "ready" badge and no needs-attention row.
      await expect(page.getByText(/\d+ ready/)).toBeVisible();

      // Defaults: deck name pre-filled, format = Constructed.
      await expect(page.getByLabel("Deck name")).toHaveValue("Imported Deck");
      await expect(page.locator("#preview-deck-format")).toContainText("Constructed");

      // Back returns to step 1 with the textarea preserved.
      await page.getByRole("button", { name: /^Back$/ }).click();
      await expect(page.getByRole("heading", { name: "Import Deck" })).toBeVisible();
      await expect(page.getByPlaceholder(/Piltover Archive deck code/i)).toHaveValue(code);
    });

    test("importing creates the deck, saves cards, navigates, and shows a success toast", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await advanceToPreviewWithPiltover(page);

      const createPromise = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn("createDeckFn")(request.url()),
      );
      const savePromise = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn("saveDeckCardsFn")(request.url()),
      );

      const importButton = page.getByRole("button", { name: /^Import \d+ cards?$/ });
      await expect(importButton).toBeEnabled();
      await importButton.click();

      const createRequest = await createPromise;
      await savePromise;

      // createDeckFn payload includes the default name + constructed format.
      const createBody = createRequest.postDataJSON() as { data: { name: string; format: string } };
      expect(createBody.data.name).toBe("Imported Deck");
      expect(createBody.data.format).toBe("constructed");

      await expect(page).toHaveURL(/\/decks\/[0-9a-f-]{36}$/, { timeout: 15_000 });
      await expect(
        page.getByText(/^Imported deck "Imported Deck" with \d+ cards\.$/),
      ).toBeVisible();
    });
  });

  test.describe("step 2: deck options", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("Import button is disabled when the deck name is cleared", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await advanceToPreviewWithPiltover(page);

      const importButton = page.getByRole("button", { name: /^Import \d+ cards?$/ });
      await expect(importButton).toBeEnabled();

      await page.getByLabel("Deck name").fill("");
      await expect(importButton).toBeDisabled();

      // Restoring a name re-enables it.
      await page.getByLabel("Deck name").fill("Restored");
      await expect(importButton).toBeEnabled();
    });

    test("selecting Freeform sends format=freeform in the createDeck payload", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await advanceToPreviewWithPiltover(page);

      // Open the format select and pick Freeform.
      await page.locator("#preview-deck-format").click();
      await page.getByRole("option", { name: "Freeform" }).click();
      await expect(page.locator("#preview-deck-format")).toContainText("Freeform");

      const createPromise = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn("createDeckFn")(request.url()),
      );

      await page.getByRole("button", { name: /^Import \d+ cards?$/ }).click();
      const createRequest = await createPromise;

      const body = createRequest.postDataJSON() as { data: { format: string } };
      expect(body.data.format).toBe("freeform");
    });
  });

  test.describe("step 2: entry actions", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    // A text-format payload with one unresolved entry and one exact match —
    // gives us a predictable mix of ready + needs-attention rows to act on.
    function mixedTextSample(): string {
      return ["MainDeck:", "3 Incinerate", "1 Totally Fake Card Name"].join("\n");
    }

    async function advanceFromMixedText(page: Page) {
      await goToImport(page);
      await page.getByRole("tab", { name: "Text" }).click();
      await page.getByPlaceholder(/Legend:/).fill(mixedTextSample());
      await page.getByRole("button", { name: /^Parse$/ }).click();
      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
    }

    test("skipping an unresolved entry adds a skipped badge without losing ready count", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await advanceFromMixedText(page);

      await expect(page.getByText("1 ready")).toBeVisible();
      await expect(page.getByText("1 need attention")).toBeVisible();

      // Rows are sorted exact → needs-review → unresolved, so the last Skip
      // button corresponds to the unresolved "Totally Fake" row.
      const skipButtons = page.getByRole("button", { name: /^Skip$/ });
      await expect(skipButtons).toHaveCount(2);
      await skipButtons.last().click();

      await expect(page.getByText("1 ready")).toBeVisible();
      await expect(page.getByText("1 skipped")).toBeVisible();
      await expect(page.getByText(/\d+ need attention/)).toHaveCount(0);
    });

    test("resolving an unresolved entry via search flips it to ready", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await advanceFromMixedText(page);

      await expect(page.getByText("1 ready")).toBeVisible();

      // Rows sort exact → needs-review → unresolved, so the last "Search
      // catalog" button belongs to the unresolved "Totally Fake" row.
      await page.getByRole("button", { name: "Search catalog" }).last().click();

      await page.getByPlaceholder("Search cards...").fill("Garen");
      // Debounced search (150ms) populates the listbox with catalog results.
      const garenOption = page.getByRole("option", { name: /Garen/ }).first();
      await expect(garenOption).toBeVisible({ timeout: 5000 });
      await garenOption.click();

      // After resolution, the needs-attention row becomes ready.
      await expect(page.getByText("2 ready")).toBeVisible();
      await expect(page.getByText(/\d+ need attention/)).toHaveCount(0);
    });

    test("changing an entry's zone via the zone picker updates it", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await advanceFromMixedText(page);

      // The zone-picker select triggers render role=combobox; the format
      // select is distinguished by its "Constructed" text. Filter to the
      // first zone picker ("Main Deck" trigger) and move the card to
      // Sideboard.
      const mainDeckZonePicker = page
        .getByRole("combobox")
        .filter({ hasText: /^Main Deck$/ })
        .first();
      await mainDeckZonePicker.click();
      await page.getByRole("option", { name: "Sideboard" }).click();
      await expect(
        page
          .getByRole("combobox")
          .filter({ hasText: /^Sideboard$/ })
          .first(),
      ).toBeVisible();
    });
  });

  test.describe("step 2: text format end-to-end", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("imports a multi-zone text deck and the zones render in the editor", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      await page.getByRole("tab", { name: "Text" }).click();
      await page.getByPlaceholder(/Legend:/).fill(buildTextSample());
      await page.getByRole("button", { name: /^Parse$/ }).click();

      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel("Deck name").fill("Text Import E2E");

      const savePromise = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn("saveDeckCardsFn")(request.url()),
      );
      await page.getByRole("button", { name: /^Import \d+ cards?$/ }).click();
      const saveRequest = await savePromise;

      const savePayload = saveRequest.postDataJSON() as {
        data: { cards: { cardId: string; zone: string; quantity: number }[] };
      };
      const zones = new Set(savePayload.data.cards.map((card) => card.zone));
      expect(zones.has("legend")).toBe(true);
      expect(zones.has("main")).toBe(true);

      await expect(page).toHaveURL(/\/decks\/[0-9a-f-]{36}$/, { timeout: 15_000 });
      // Editor renders the deck name in the top bar.
      await expect(page.getByText("Text Import E2E").first()).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe("step 2: tts format end-to-end", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("imports a TTS-format deck and routes cards to main + champion zones", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      await page.getByRole("tab", { name: "TTS" }).click();
      await page.getByPlaceholder(/OGN-001-1/).fill(buildTtsSample());
      await page.getByRole("button", { name: /^Parse$/ }).click();

      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel("Deck name").fill("TTS Import E2E");

      const savePromise = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn("saveDeckCardsFn")(request.url()),
      );
      await page.getByRole("button", { name: /^Import \d+ cards?$/ }).click();
      const saveRequest = await savePromise;

      const savePayload = saveRequest.postDataJSON() as {
        data: { cards: { cardId: string; zone: string; quantity: number }[] };
      };
      // TTS positional slot 1 becomes the chosen champion → champion zone.
      const zones = new Set(savePayload.data.cards.map((card) => card.zone));
      expect(zones.has("champion")).toBe(true);

      await expect(page).toHaveURL(/\/decks\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    });
  });

  test.describe("step 2: mutation failures", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("createDeckFn failure shows an error toast and no save request fires", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);

      // NOTE: Order matters — register the route before navigating so the
      // server fn is intercepted when the user clicks Import.
      let saveRequestSeen = false;
      await page.route("**/_serverFn/**", async (route) => {
        const url = route.request().url();
        if (isServerFn("createDeckFn")(url)) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "simulated failure" }),
          });
          return;
        }
        if (isServerFn("saveDeckCardsFn")(url)) {
          saveRequestSeen = true;
        }
        await route.continue();
      });

      await advanceToPreviewWithPiltover(page);
      await page.getByRole("button", { name: /^Import \d+ cards?$/ }).click();

      await expect(page.getByText("Failed to create deck.")).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/\/decks\/import$/);
      expect(saveRequestSeen).toBe(false);
    });

    test("saveDeckCardsFn failure shows an error toast and keeps the user on import", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);

      // The deck IS created by this flow — createDeckFn succeeds, only the
      // subsequent save fails. The UX is "nothing happened" from the user's
      // perspective, but the DB has a half-imported deck row. This test
      // covers the UX-visible half.
      await page.route("**/_serverFn/**", async (route) => {
        if (isServerFn("saveDeckCardsFn")(route.request().url())) {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "simulated failure" }),
          });
          return;
        }
        await route.continue();
      });

      await advanceToPreviewWithPiltover(page);
      await page.getByRole("button", { name: /^Import \d+ cards?$/ }).click();

      await expect(page.getByText("Failed to save deck cards.")).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/\/decks\/import$/);
    });
  });

  test.describe("access + SEO", () => {
    test("sets the page title on /decks/import", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/decks/import");
      await expect(page).toHaveTitle(/Import Deck/, { timeout: 15_000 });
    });

    // Note: anonymous → /login redirect for /decks/import is already covered in
    // the deck-list auth-gate suite; intentionally not duplicated here.
  });
});
