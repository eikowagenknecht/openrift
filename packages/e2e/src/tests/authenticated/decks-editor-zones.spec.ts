import { readFileSync } from "node:fs";

import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { expect, test } from "../../fixtures/test.js";
import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";
import { dndDrag, dndDragToPoint } from "../../helpers/dnd.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

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

async function seedDeckCards(
  request: APIRequestContext,
  deckId: string,
  cards: { cardId: string; zone: string; quantity: number }[],
): Promise<void> {
  const response = await request.put(`${API_BASE_URL}/api/v1/decks/${deckId}/cards`, {
    headers: { Origin: WEB_BASE_URL },
    data: { cards },
  });
  expect(response.ok()).toBeTruthy();
}

interface TestCard {
  id: string;
  name: string;
}

// Pick a deterministic card for a given type. Plain-ASCII names keep the card
// name usable as a Playwright text locator without escaping.
async function pickCardByType(type: string): Promise<TestCard> {
  const sql = loadDb();
  try {
    const rows = (await sql`
      SELECT id, name FROM cards
      WHERE type = ${type}
        AND name ~ '^[A-Za-z][A-Za-z ]*$'
      ORDER BY name, id
      LIMIT 1
    `) as { id: string; name: string }[];
    if (rows.length === 0) {
      throw new Error(`no suitable card of type '${type}' found`);
    }
    return rows[0];
  } finally {
    await sql.end();
  }
}

async function readDeckCards(
  deckId: string,
): Promise<{ cardId: string; zone: string; quantity: number }[]> {
  const sql = loadDb();
  try {
    const rows = (await sql`
      SELECT card_id AS "cardId", zone, quantity
      FROM deck_cards
      WHERE deck_id = ${deckId}
    `) as { cardId: string; zone: string; quantity: number }[];
    return rows;
  } finally {
    await sql.end();
  }
}

// Locate the zone-section wrapper (the droppable <div>) by its header label.
// The header lives inside the wrapper as the first child; ancestor::div[1] lands
// on the outer rounded-lg container that owns the drop ref + ring highlight.
function zoneSection(page: Page, label: string): Locator {
  return page
    .getByRole("button", { name: new RegExp(`^${label}(\\s|$)`) })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
}

// Card row inside a zone. The draggable outer <div> wraps an inner role=button
// element; targeting the inner button's text works for both click activation
// and pointer drag (events bubble to the outer draggable node).
function deckCardRow(section: Locator, cardName: string): Locator {
  return section.getByRole("button").filter({ hasText: cardName }).first();
}

function browserCardTile(page: Page, cardName: string): Locator {
  return page.getByRole("img", { name: cardName }).first();
}

// Ensure the store's activeZone is set to `label` before the browser can be
// used (the browser renders a placeholder until a zone is active).
async function activateZone(page: Page, label: string) {
  await zoneSection(page, label)
    .getByRole("button", { name: new RegExp(`^${label}(\\s|$)`) })
    .first()
    .click();
}

async function searchBrowserFor(page: Page, cardName: string) {
  const searchInput = page.getByPlaceholder(/Search/).first();
  await searchInput.fill(cardName);
  // Debounced search pushes to URL after 200ms; wait a touch longer.
  await expect(browserCardTile(page, cardName)).toBeVisible({ timeout: 10_000 });
}

// Drag with Shift held across the drop. dnd-kit only mounts the keydown
// listener once a drag activates, so we press Shift after the activation move
// and release it after mouseup.
async function dndDragWithShift(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("dnd source/target not visible");
  }
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 20, startY, { steps: 5 });
  // Let the DndContext's useEffect attach its keydown listener before pressing Shift.
  await page.waitForTimeout(100);
  await page.keyboard.down("Shift");
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
}

test.describe("deck editor zones + drag-drop", () => {
  test.describe("zone section structure", () => {
    test("renders each zone header and collapses Main Deck when its chevron is clicked", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");
      const deckId = await createDeckViaApi(page.request, {
        name: `Zones Struct ${Date.now()}`,
        format: "constructed",
      });
      await seedDeckCards(page.request, deckId, [{ cardId: unit.id, zone: "main", quantity: 1 }]);

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByText(/Constructed/).first()).toBeVisible({ timeout: 15_000 });

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

      const mainSection = zoneSection(page, "Main Deck");
      // Seeded card is visible → Main Deck is expanded by default.
      await expect(mainSection.getByText(unit.name, { exact: false })).toBeVisible();

      // Chevron is the first icon-only button inside the section header.
      const chevron = mainSection.getByRole("button").first();
      await chevron.click();
      await expect(mainSection.getByText(unit.name, { exact: false })).toBeHidden();
      await chevron.click();
      await expect(mainSection.getByText(unit.name, { exact: false })).toBeVisible();
    });

    test("clicking the section body sets the active zone so browser adds land there", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");
      const deckId = await createDeckViaApi(page.request, {
        name: `Zones Activate ${Date.now()}`,
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByText(/Constructed/).first()).toBeVisible({ timeout: 15_000 });

      // Activate Sideboard (not the default), search for the card, quick-add it.
      await activateZone(page, "Sideboard");
      await searchBrowserFor(page, unit.name);

      // Climb to the card wrapper (the outer "group" div in CardThumbnail)
      // and pick its "Add to deck" button. The immediate div ancestor of the
      // <img> is only the inner tilt/image container, which doesn't include
      // the DeckAddStrip's Add button.
      const tile = browserCardTile(page, unit.name);
      const addButton = tile
        .locator(
          "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' group ')][1]",
        )
        .first()
        .getByRole("button", { name: "Add to deck" })
        .first();
      await addButton.click();

      // Auto-save debounce is 1s.
      await expect
        .poll(
          async () => {
            const rows = await readDeckCards(deckId);
            return rows.find((row) => row.cardId === unit.id)?.zone ?? null;
          },
          { timeout: 10_000 },
        )
        .toBe("sideboard");
    });
  });

  test.describe("drag: browser-card → zone", () => {
    test("dragging a card tile onto Main Deck adds 1 copy", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");
      const deckId = await createDeckViaApi(page.request, {
        name: `Drag Browser ${Date.now()}`,
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await expect(page.getByText(/Constructed/).first()).toBeVisible({ timeout: 15_000 });

      await activateZone(page, "Main Deck");
      await searchBrowserFor(page, unit.name);

      const tile = browserCardTile(page, unit.name);
      const mainSection = zoneSection(page, "Main Deck");
      await dndDrag(page, tile, mainSection);

      await expect
        .poll(
          async () => {
            const rows = await readDeckCards(deckId);
            return rows
              .filter((row) => row.cardId === unit.id && row.zone === "main")
              .reduce((sum, row) => sum + row.quantity, 0);
          },
          { timeout: 10_000 },
        )
        .toBe(1);

      await expect(mainSection.getByText(unit.name, { exact: false })).toBeVisible();
    });
  });

  test.describe("drag: browser-card → zone with Shift", () => {
    test("Shift-drag into Main Deck adds a 3-copy playset", async ({ authenticatedPage }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");
      const deckId = await createDeckViaApi(page.request, {
        name: `Drag Shift Main ${Date.now()}`,
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await searchBrowserFor(page, unit.name);

      const tile = browserCardTile(page, unit.name);
      const mainSection = zoneSection(page, "Main Deck");
      await dndDragWithShift(page, tile, mainSection);

      await expect
        .poll(
          async () => {
            const rows = await readDeckCards(deckId);
            return rows
              .filter((row) => row.cardId === unit.id && row.zone === "main")
              .reduce((sum, row) => sum + row.quantity, 0);
          },
          { timeout: 10_000 },
        )
        .toBe(3);
    });

    test("Shift-drag a rune into Runes fills toward the 12-card target", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const rune = await pickCardByType("rune");
      const deckId = await createDeckViaApi(page.request, {
        name: `Drag Shift Runes ${Date.now()}`,
        format: "freeform",
      });

      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Runes");
      await searchBrowserFor(page, rune.name);

      const tile = browserCardTile(page, rune.name);
      const runesSection = zoneSection(page, "Runes");
      await dndDragWithShift(page, tile, runesSection);

      // Without a Legend, rebalancing is a no-op; the Shift branch still adds
      // runes one-by-one up to 12. freeform avoids the constructed-only
      // "missing Legend" failure that blocks the test short of the target.
      await expect
        .poll(
          async () => {
            const rows = await readDeckCards(deckId);
            return rows
              .filter((row) => row.cardId === rune.id && row.zone === "runes")
              .reduce((sum, row) => sum + row.quantity, 0);
          },
          { timeout: 10_000 },
        )
        .toBe(12);
    });
  });

  test.describe("drag: deck-card → different zone", () => {
    test("without Shift moves one copy; with Shift moves all copies", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");

      // Run 1: no Shift → move one of two copies.
      const deckA = await createDeckViaApi(page.request, {
        name: `Drag Move One ${Date.now()}`,
        format: "freeform",
      });
      await seedDeckCards(page.request, deckA, [{ cardId: unit.id, zone: "main", quantity: 2 }]);

      await page.goto(`/decks/${deckA}`);
      const mainA = zoneSection(page, "Main Deck");
      const sideboardA = zoneSection(page, "Sideboard");
      await expect(deckCardRow(mainA, unit.name)).toBeVisible({ timeout: 15_000 });

      await dndDrag(page, deckCardRow(mainA, unit.name), sideboardA);

      await expect
        .poll(
          async () => {
            const rows = await readDeckCards(deckA);
            const toMap = Object.fromEntries(
              rows.filter((row) => row.cardId === unit.id).map((row) => [row.zone, row.quantity]),
            );
            return toMap;
          },
          { timeout: 10_000 },
        )
        .toEqual({ main: 1, sideboard: 1 });

      // Run 2: Shift held → move all copies to Overflow.
      const deckB = await createDeckViaApi(page.request, {
        name: `Drag Move All ${Date.now()}`,
        format: "freeform",
      });
      await seedDeckCards(page.request, deckB, [{ cardId: unit.id, zone: "main", quantity: 2 }]);

      await page.goto(`/decks/${deckB}`);
      const mainB = zoneSection(page, "Main Deck");
      const overflowB = zoneSection(page, "Overflow");
      await expect(deckCardRow(mainB, unit.name)).toBeVisible({ timeout: 15_000 });

      await dndDragWithShift(page, deckCardRow(mainB, unit.name), overflowB);

      await expect
        .poll(
          async () => {
            const rows = await readDeckCards(deckB);
            const toMap = Object.fromEntries(
              rows.filter((row) => row.cardId === unit.id).map((row) => [row.zone, row.quantity]),
            );
            return toMap;
          },
          { timeout: 10_000 },
        )
        .toEqual({ overflow: 2 });
    });
  });

  test.describe("drag: deck-card → same zone", () => {
    test("dropping a row onto its own zone does not change quantities", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");
      const deckId = await createDeckViaApi(page.request, {
        name: `Drag Same Zone ${Date.now()}`,
        format: "freeform",
      });
      await seedDeckCards(page.request, deckId, [{ cardId: unit.id, zone: "main", quantity: 2 }]);

      await page.goto(`/decks/${deckId}`);
      const main = zoneSection(page, "Main Deck");
      await expect(deckCardRow(main, unit.name)).toBeVisible({ timeout: 15_000 });

      await dndDrag(page, deckCardRow(main, unit.name), main);

      // Give auto-save a chance to run if a mutation had fired (it shouldn't).
      await page.waitForTimeout(1500);
      const rows = await readDeckCards(deckId);
      expect(rows.filter((row) => row.cardId === unit.id)).toEqual([
        expect.objectContaining({ cardId: unit.id, zone: "main", quantity: 2 }),
      ]);
    });
  });

  test.describe("drag: deck-card → non-DRAG_ZONES", () => {
    test("dropping a Main Deck row onto Battlefields / Runes / Champion is a no-op", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");
      const deckId = await createDeckViaApi(page.request, {
        name: `Drag Bad Zone ${Date.now()}`,
        format: "freeform",
      });
      await seedDeckCards(page.request, deckId, [{ cardId: unit.id, zone: "main", quantity: 2 }]);

      await page.goto(`/decks/${deckId}`);
      const main = zoneSection(page, "Main Deck");
      await expect(deckCardRow(main, unit.name)).toBeVisible({ timeout: 15_000 });

      for (const label of ["Runes", "Battlefields", "Chosen Champion"]) {
        const target = zoneSection(page, label);
        await dndDrag(page, deckCardRow(main, unit.name), target);
      }

      await page.waitForTimeout(1500);
      const rows = await readDeckCards(deckId);
      expect(rows.filter((row) => row.cardId === unit.id)).toEqual([
        expect.objectContaining({ cardId: unit.id, zone: "main", quantity: 2 }),
      ]);
    });
  });

  test.describe("drag: deck-card → outside any zone", () => {
    test("releasing outside the sidebar decrements the row; with Shift removes the row", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");

      // Run 1: decrement by 1.
      const deckA = await createDeckViaApi(page.request, {
        name: `Drag Out Dec ${Date.now()}`,
        format: "freeform",
      });
      await seedDeckCards(page.request, deckA, [{ cardId: unit.id, zone: "main", quantity: 2 }]);

      await page.goto(`/decks/${deckA}`);
      const mainA = zoneSection(page, "Main Deck");
      await expect(deckCardRow(mainA, unit.name)).toBeVisible({ timeout: 15_000 });

      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error("viewport size unavailable");
      }
      // Release well clear of the left-hand sidebar (the zones panel).
      const dropX = Math.min(viewport.width - 80, viewport.width / 2 + 200);
      const dropY = viewport.height / 2;

      await dndDragToPoint(page, deckCardRow(mainA, unit.name), dropX, dropY);

      await expect
        .poll(
          async () => {
            const rows = await readDeckCards(deckA);
            return rows
              .filter((row) => row.cardId === unit.id && row.zone === "main")
              .reduce((sum, row) => sum + row.quantity, 0);
          },
          { timeout: 10_000 },
        )
        .toBe(1);

      // Run 2: Shift held → set quantity to 0 (row removed).
      const deckB = await createDeckViaApi(page.request, {
        name: `Drag Out Zero ${Date.now()}`,
        format: "freeform",
      });
      await seedDeckCards(page.request, deckB, [{ cardId: unit.id, zone: "main", quantity: 2 }]);

      await page.goto(`/decks/${deckB}`);
      const mainB = zoneSection(page, "Main Deck");
      const rowB = deckCardRow(mainB, unit.name);
      await expect(rowB).toBeVisible({ timeout: 15_000 });

      const sourceBox = await rowB.boundingBox();
      if (!sourceBox) {
        throw new Error("row not visible");
      }
      const startX = sourceBox.x + sourceBox.width / 2;
      const startY = sourceBox.y + sourceBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 20, startY, { steps: 5 });
      await page.waitForTimeout(100);
      await page.keyboard.down("Shift");
      await page.mouse.move(dropX, dropY, { steps: 20 });
      await page.mouse.up();
      await page.keyboard.up("Shift");

      await expect
        .poll(
          async () => {
            const rows = await readDeckCards(deckB);
            return rows.filter((row) => row.cardId === unit.id).length;
          },
          { timeout: 10_000 },
        )
        .toBe(0);
    });
  });

  test.describe("drop highlight during drag", () => {
    test("mid-drag, the Main Deck section gets the ring highlight", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");
      const deckId = await createDeckViaApi(page.request, {
        name: `Drop Highlight ${Date.now()}`,
        format: "constructed",
      });

      await page.goto(`/decks/${deckId}`);
      await activateZone(page, "Main Deck");
      await searchBrowserFor(page, unit.name);

      const tile = browserCardTile(page, unit.name);
      const mainSection = zoneSection(page, "Main Deck");

      const sourceBox = await tile.boundingBox();
      const targetBox = await mainSection.boundingBox();
      if (!sourceBox || !targetBox) {
        throw new Error("source/target not visible");
      }
      const startX = sourceBox.x + sourceBox.width / 2;
      const startY = sourceBox.y + sourceBox.height / 2;
      const endX = targetBox.x + targetBox.width / 2;
      const endY = targetBox.y + targetBox.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 20, startY, { steps: 5 });
      await page.mouse.move(endX, endY, { steps: 20 });

      // ring-primary is the visible drop affordance; no role/aria alternative.
      await expect(mainSection).toHaveClass(/ring-primary/);

      await page.mouse.up();
    });
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("desktop-style drag of a deck row does not fire a mutation on mobile", async ({
      authenticatedPage,
    }) => {
      const page = authenticatedPage;
      const unit = await pickCardByType("unit");
      const deckId = await createDeckViaApi(page.request, {
        name: `Mobile Drag ${Date.now()}`,
        format: "freeform",
      });
      await seedDeckCards(page.request, deckId, [{ cardId: unit.id, zone: "main", quantity: 2 }]);

      await page.goto(`/decks/${deckId}`);

      // Open the mobile sidebar so zones render. Without an active zone the
      // mobile <h1> renders the literal label "Zones"; tapping it opens the
      // zones drawer.
      const mobileTitle = page.getByRole("button", { name: /^Zones/ }).first();
      await expect(mobileTitle).toBeVisible({ timeout: 15_000 });
      await mobileTitle.click();
      await expect(page.getByRole("heading", { name: "Deck Zones" })).toBeVisible();

      const main = zoneSection(page, "Main Deck");
      const sideboard = zoneSection(page, "Sideboard");
      const row = deckCardRow(main, unit.name);
      await expect(row).toBeVisible();

      // DeckCardRow disables dnd-kit listeners on mobile — pointer events never
      // activate a drag. Mirrors chunk 4 of collections-drag-drop.spec.ts.
      await dndDrag(page, row, sideboard);
      await page.waitForTimeout(1500);

      const deckRows = await readDeckCards(deckId);
      expect(deckRows.filter((deckRow) => deckRow.cardId === unit.id)).toEqual([
        expect.objectContaining({ cardId: unit.id, zone: "main", quantity: 2 }),
      ]);
    });
  });
});
