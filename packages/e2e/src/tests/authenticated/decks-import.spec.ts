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
    const match = url.match(/\/_serverFn\/(?<encoded>[^/?#]+)/u);
    const encoded = match?.groups?.encoded;
    if (encoded === undefined) {
      return false;
    }
    try {
      return Buffer.from(encoded, "base64url").toString("utf-8").includes(fnName);
    } catch {
      return false;
    }
  };
}

// Seroval (used by TanStack Start server functions) encodes POST bodies as an
// AST rather than plain JSON. `toJSONAsync` emits nodes like
//   { t: <typeId>, p: { k: [...keys], v: [...encodedChildren] }, ... }
// with scalars as { t: 1, s: "str" } / { t: 2, s: 0|2 } (bool) / { t: 0, s: n }.
// Tests don't pull in seroval, so decode just enough to reach ordinary
// objects / arrays / primitives back out of the AST.
interface SerovalEnvelope {
  t: SerovalNode;
}

interface SerovalNode {
  t: number;
  s?: unknown;
  p?: { k: string[]; v: SerovalNode[] };
  l?: number;
  a?: SerovalNode[];
}

function decodeSerovalNode(node: SerovalNode): unknown {
  // scalars: t=0 number, t=1 string, t=2 bool (s=2 true, s=3 false), t=3 null,
  // t=4 undefined. For the payloads used in these tests only strings, numbers,
  // and booleans inside plain objects / arrays appear.
  switch (node.t) {
    case 0: {
      return node.s;
    }
    case 1: {
      return node.s;
    }
    case 2: {
      return node.s === 2;
    }
    case 3: {
      return null;
    }
    case 4: {
      return undefined;
    }
    case 9: {
      // plain array
      return (node.a ?? []).map((entry) => decodeSerovalNode(entry));
    }
    case 10: {
      // plain object
      const out: Record<string, unknown> = {};
      const p = node.p;
      if (p) {
        for (const [index, key] of p.k.entries()) {
          const child = p.v[index];
          if (child !== undefined) {
            out[key] = decodeSerovalNode(child);
          }
        }
      }
      return out;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Decode a seroval-encoded POST body (the shape TanStack Start uses for
 * server functions) back into ordinary JS values. Returns the value under
 * the top-level `data` key, since that's what every call site wants.
 * @returns The decoded `data` payload as a plain JS value.
 */
function decodeServerFnData<T = unknown>(rawBody: unknown): T {
  const envelope = rawBody as SerovalEnvelope | { data: unknown } | undefined;
  if (envelope && typeof envelope === "object" && "t" in envelope && envelope.t) {
    const decoded = decodeSerovalNode(envelope.t) as { data?: T } | undefined;
    return (decoded?.data ?? {}) as T;
  }
  // Fall back to the plain-JSON shape older versions used.
  if (envelope && typeof envelope === "object" && "data" in envelope) {
    return (envelope as { data: T }).data ?? ({} as T);
  }
  return {} as T;
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

// The format is a Select now ("Detect automatically" by default, plus one
// entry per format) rather than a tab strip. Detection would handle most of
// these pastes on its own, but the tests pin the format so a detection change
// can't silently move what they exercise.
// The trigger takes no accessible name from its <Label for>, so address it by
// the id that label points at.
function formatSelect(page: Page): Locator {
  return page.locator("#import-mode");
}

async function selectImportFormat(page: Page, label: "Text" | "Deck Code" | "TTS") {
  await formatSelect(page).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function selectDeckCodeFormat(page: Page) {
  await selectImportFormat(page, "Deck Code");
  await expect(page.getByPlaceholder(/Piltover Archive deck code/iu)).toBeVisible();
}

async function advanceToPreviewWithPiltover(page: Page) {
  await goToImport(page);
  await selectDeckCodeFormat(page);
  const code = buildPiltoverSample();
  await page.getByPlaceholder(/Piltover Archive deck code/iu).fill(code);
  await page.getByRole("button", { name: /^Parse$/u }).click();
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

    test("defaults to automatic detection and offers one option per format", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      // The default mode detects the format from whatever is pasted, so the
      // textarea invites any of them.
      await expect(formatSelect(page)).toContainText("Detect automatically");
      await expect(
        page.getByPlaceholder(/Paste a deck list, deck code, TTS string/iu),
      ).toBeVisible();

      await formatSelect(page).click();
      for (const label of ["Detect automatically", "Text", "Deck Code", "TTS"]) {
        await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible();
      }
      await page.keyboard.press("Escape");
    });

    test("switching format updates the textarea placeholder", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      await selectImportFormat(page, "Text");
      await expect(page.getByPlaceholder(/Legend:/u)).toBeVisible();

      await selectImportFormat(page, "TTS");
      await expect(page.getByPlaceholder(/OGN-001-1/u)).toBeVisible();
    });

    test("Parse button is disabled until the textarea has content", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      await selectDeckCodeFormat(page);
      const parseButton = page.getByRole("button", { name: /^Parse$/u });
      await expect(parseButton).toBeDisabled();

      await page.getByPlaceholder(/Piltover Archive deck code/iu).fill("ABCDEF");
      await expect(parseButton).toBeEnabled();
    });

    test("external source links open in new tabs with rel=noreferrer", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      // The links live in each format's description, and the default
      // auto-detect blurb carries none of them.
      await selectDeckCodeFormat(page);
      const piltoverLink = page.getByRole("link", { name: "Piltover Archive" }).first();
      await expect(piltoverLink).toHaveAttribute("target", "_blank");
      await expect(piltoverLink).toHaveAttribute("rel", "noreferrer");
      await expect(piltoverLink).toHaveAttribute("href", /piltoverarchive\.com/u);

      // Text tab — includes Piltover Archive and TCG Arena links.
      await selectImportFormat(page, "Text");
      const tcgArena = page.getByRole("link", { name: "TCG Arena" });
      await expect(tcgArena).toHaveAttribute("href", /tcg-arena\.fr/u);
      await expect(tcgArena).toHaveAttribute("rel", "noreferrer");

      // TTS tab — Tabletop Simulator mod link.
      await selectImportFormat(page, "TTS");
      const ttsLink = page.getByRole("link", { name: "Tabletop Simulator mod" });
      await expect(ttsLink).toHaveAttribute("href", /steamcommunity\.com/u);
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

      await selectDeckCodeFormat(page);
      await page.getByPlaceholder(/Piltover Archive deck code/iu).fill("NOT-A-REAL-CODE!!!");
      await page.getByRole("button", { name: /^Parse$/u }).click();

      await expect(page.getByText(/Invalid Piltover Archive deck code/u)).toBeVisible();
      // Still on step 1: heading is "Import Deck", not "Import Preview".
      await expect(page.getByRole("heading", { name: "Import Deck" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Import Preview" })).toHaveCount(0);
    });

    test("unparseable Text-format lines still advance to preview but note warnings", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await goToImport(page);

      await selectImportFormat(page, "Text");
      // One valid line (advances to preview) + one unknown zone header + one malformed line.
      await page
        .getByPlaceholder(/Legend:/u)
        .fill(["BogusZone:", "not-a-card-line", "3 Incinerate"].join("\n"));
      await page.getByRole("button", { name: /^Parse$/u }).click();

      // With at least one valid entry, the flow advances; warnings collapse into
      // a details block on the preview.
      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/warning/u)).toBeVisible();
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
      await selectDeckCodeFormat(page);
      await page.getByPlaceholder(/Piltover Archive deck code/iu).fill(code);
      await page.getByRole("button", { name: /^Parse$/u }).click();

      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText(/\d+ cards? parsed/u)).toBeVisible();

      // Summary: everything in our sample resolves exactly, so there's a
      // "ready" badge and no needs-attention row.
      await expect(page.getByText(/\d+ ready/u)).toBeVisible();

      // Defaults: deck name empty with the fallback as its placeholder (so it
      // never has to be cleared), format = Constructed.
      const deckNameField = page.getByLabel("Deck name");
      await expect(deckNameField).toHaveValue("");
      await expect(deckNameField).toHaveAttribute("placeholder", "Imported Deck");
      await expect(page.locator("#preview-deck-format")).toContainText("Constructed");

      // Back returns to step 1 with the textarea preserved.
      await page.getByRole("button", { name: /^Back$/u }).click();
      await expect(page.getByRole("heading", { name: "Import Deck" })).toBeVisible();
      await expect(page.getByPlaceholder(/Piltover Archive deck code/iu)).toHaveValue(code);
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

      const importButton = page.getByRole("button", { name: /^Import \d+ cards?$/u });
      await expect(importButton).toBeEnabled();
      await importButton.click();

      const createRequest = await createPromise;
      await savePromise;

      // createDeckFn payload falls back to the placeholder name (the field was
      // left empty) and the constructed format.
      // TanStack Start 1.167 serialises server-fn bodies through seroval as
      // an encoded AST; decodeServerFnData walks it back to a plain object.
      const body = decodeServerFnData<{ name?: string; format?: string }>(
        createRequest.postDataJSON(),
      );
      expect(body.name).toBe("Imported Deck");
      expect(body.format).toBe("constructed");

      await expect(page).toHaveURL(/\/decks\/[0-9a-f-]{36}$/u, { timeout: 15_000 });
      await expect(
        page.getByText(/^Imported deck "Imported Deck" with \d+ cards\.$/u),
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

    test("an empty deck name keeps Import enabled and a typed name wins", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await advanceToPreviewWithPiltover(page);

      // The name is optional: an empty field imports under the placeholder.
      const importButton = page.getByRole("button", { name: /^Import \d+ cards?$/u });
      await expect(page.getByLabel("Deck name")).toHaveValue("");
      await expect(importButton).toBeEnabled();

      await page.getByLabel("Deck name").fill("Named By Hand");

      const createPromise = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn("createDeckFn")(request.url()),
      );
      await importButton.click();
      const createRequest = await createPromise;

      const body = decodeServerFnData<{ name?: string }>(createRequest.postDataJSON());
      expect(body.name).toBe("Named By Hand");
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

      await page.getByRole("button", { name: /^Import \d+ cards?$/u }).click();
      const createRequest = await createPromise;

      const body = decodeServerFnData<{ format?: string }>(createRequest.postDataJSON());
      expect(body.format).toBe("freeform");
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
      await selectImportFormat(page, "Text");
      await page.getByPlaceholder(/Legend:/u).fill(mixedTextSample());
      await page.getByRole("button", { name: /^Parse$/u }).click();
      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
    }

    test("the needs-attention badge jumps to the first row that needs attention", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await advanceFromMixedText(page);

      // The badge is a control, not a label: it scrolls the list back to the
      // first unresolved row, which is ordered among the matched ones.
      const jump = page.getByRole("button", { name: /Jump to the first of 1 row/u });
      await expect(jump).toHaveText("1 need attention");
      await jump.click();
      // The name shows both in the row and in its unresolved-entry search
      // field's placeholder area, so scope to the first occurrence.
      await expect(page.getByText("Totally Fake Card Name").first()).toBeInViewport();
    });

    test("skipping an unresolved entry adds a skipped badge without losing ready count", async ({
      page,
    }) => {
      userEmail = await createAndLogin(page);
      await advanceFromMixedText(page);

      await expect(page.getByText("1 ready")).toBeVisible();
      await expect(page.getByText("1 need attention")).toBeVisible();

      // Rows are sorted exact → needs-review → unresolved, so the last Skip
      // button corresponds to the unresolved "Totally Fake" row.
      const skipButtons = page.getByRole("button", { name: /^Skip$/u });
      await expect(skipButtons).toHaveCount(2);
      await skipButtons.last().click();

      await expect(page.getByText("1 ready")).toBeVisible();
      await expect(page.getByText("1 skipped")).toBeVisible();
      await expect(page.getByText(/\d+ need attention/u)).toHaveCount(0);
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
      const garenOption = page.getByRole("option", { name: /Garen/u }).first();
      await expect(garenOption).toBeVisible({ timeout: 5000 });
      await garenOption.click();

      // After resolution, the needs-attention row becomes ready.
      await expect(page.getByText("2 ready")).toBeVisible();
      await expect(page.getByText(/\d+ need attention/u)).toHaveCount(0);
    });

    test("changing an entry's zone via the zone picker updates it", async ({ page }) => {
      userEmail = await createAndLogin(page);
      await advanceFromMixedText(page);

      // The zone-picker Select triggers render as role=combobox. The import
      // page uses the DB-sourced zone labels ("Main", "Sideboard", ...), not
      // the editor's friendlier "Main Deck". A simple hasText filter would
      // also match the format picker's "Constructed" combobox once a zone
      // value collides; scoping by `has: getByText(...)` keeps us on the
      // zone picker. Target the first row's picker and move it to Sideboard.
      const mainDeckZonePicker = page
        .getByRole("combobox")
        .filter({ has: page.getByText("Main", { exact: true }) })
        .first();
      await expect(mainDeckZonePicker).toBeVisible({ timeout: 15_000 });

      // Each row names its zone once, in the picker only. The sample's two
      // entries both land in Main, so a second copy printed beside the card
      // name would double this count.
      await expect(page.getByText("Main", { exact: true })).toHaveCount(2);
      await mainDeckZonePicker.click();
      await page.getByRole("option", { name: "Sideboard" }).click();
      await expect(
        page
          .getByRole("combobox")
          .filter({ has: page.getByText("Sideboard", { exact: true }) })
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

      await selectImportFormat(page, "Text");
      await page.getByPlaceholder(/Legend:/u).fill(buildTextSample());
      await page.getByRole("button", { name: /^Parse$/u }).click();

      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel("Deck name").fill("Text Import E2E");

      const savePromise = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn("saveDeckCardsFn")(request.url()),
      );
      await page.getByRole("button", { name: /^Import \d+ cards?$/u }).click();
      const saveRequest = await savePromise;

      const savePayload = decodeServerFnData<{
        cards: { cardId: string; zone: string; quantity: number }[];
      }>(saveRequest.postDataJSON());
      const zones = new Set((savePayload.cards ?? []).map((card) => card.zone));
      expect(zones.has("legend")).toBe(true);
      expect(zones.has("main")).toBe(true);

      await expect(page).toHaveURL(/\/decks\/[0-9a-f-]{36}$/u, { timeout: 15_000 });
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

      await selectImportFormat(page, "TTS");
      await page.getByPlaceholder(/OGN-001-1/u).fill(buildTtsSample());
      await page.getByRole("button", { name: /^Parse$/u }).click();

      await expect(page.getByRole("heading", { name: "Import Preview" })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel("Deck name").fill("TTS Import E2E");

      const savePromise = page.waitForRequest(
        (request) => request.method() === "POST" && isServerFn("saveDeckCardsFn")(request.url()),
      );
      await page.getByRole("button", { name: /^Import \d+ cards?$/u }).click();
      const saveRequest = await savePromise;

      const savePayload = decodeServerFnData<{
        cards: { cardId: string; zone: string; quantity: number }[];
      }>(saveRequest.postDataJSON());
      // TTS positional slot 1 becomes the chosen champion → champion zone.
      const zones = new Set((savePayload.cards ?? []).map((card) => card.zone));
      expect(zones.has("champion")).toBe(true);

      await expect(page).toHaveURL(/\/decks\/[0-9a-f-]{36}$/u, { timeout: 15_000 });
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
      await page.getByRole("button", { name: /^Import \d+ cards?$/u }).click();

      // The import page no longer writes its own message: the QueryClient's
      // default mutation onError owns the toast and prints the server's error
      // text, which a mocked 500 doesn't pin down. Assert an error toast shows
      // at all, and that the flow stopped before saving cards.
      await expect(page.locator("[data-sonner-toast][data-type='error']")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/decks\/import$/u);
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
      await page.getByRole("button", { name: /^Import \d+ cards?$/u }).click();

      // Same as above: the global mutation error handler owns this toast.
      await expect(page.locator("[data-sonner-toast][data-type='error']")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page).toHaveURL(/\/decks\/import$/u);
    });
  });

  test.describe("access + SEO", () => {
    test("sets the page title on /decks/import", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      await page.goto("/decks/import");
      await expect(page).toHaveTitle(/Import Deck/u, { timeout: 15_000 });
    });

    // Note: anonymous → /login redirect for /decks/import is already covered in
    // the deck-list auth-gate suite; intentionally not duplicated here.
  });
});
