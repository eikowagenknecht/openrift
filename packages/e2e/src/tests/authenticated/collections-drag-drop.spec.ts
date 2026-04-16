import { readFileSync } from "node:fs";

import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { E2eState } from "../../helpers/constants.js";
import { API_BASE_URL, STATE_FILE, WEB_BASE_URL } from "../../helpers/constants.js";
import { connectToDb } from "../../helpers/db.js";
import { dndDrag } from "../../helpers/dnd.js";

type Sql = ReturnType<typeof connectToDb>;

function loadDb(): Sql {
  const state: E2eState = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  return connectToDb(state.tempDbUrl);
}

async function signUp(request: APIRequestContext, email: string, password: string) {
  const response = await request.post(`${API_BASE_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_BASE_URL },
    data: { email, password, name: "Drag Drop E2E" },
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
  const email = `dnd-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const password = "DragDropE2ePassword1!";
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

async function apiCreateCollection(page: Page, name: string): Promise<string> {
  const response = await page.request.post(`${API_BASE_URL}/api/v1/collections`, {
    headers: { Origin: WEB_BASE_URL },
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function getInboxId(email: string): Promise<string> {
  const sql = loadDb();
  try {
    const rows = (await sql`
      SELECT c.id FROM collections c
      JOIN users u ON u.id = c.user_id
      WHERE u.email = ${email} AND c.is_inbox = true
      LIMIT 1
    `) as { id: string }[];
    expect(rows.length).toBe(1);
    return rows[0].id;
  } finally {
    await sql.end();
  }
}

interface SeedResult {
  cardName: string;
  printingId: string;
}

/**
 * Seeds `count` copies of a single predictable printing into a collection.
 * Picks the first card whose name is plain ASCII letters so the name works
 * as a stable Playwright locator (img[alt=...], text=...).
 * @returns Card name + printing id of the seeded card.
 */
async function seedSameCardCopies(
  email: string,
  collectionId: string,
  count: number,
): Promise<SeedResult> {
  const sql = loadDb();
  try {
    const picked = (await sql`
      SELECT p.id AS printing_id, c.name AS card_name
      FROM printings p
      JOIN cards c ON c.id = p.card_id
      WHERE c.name ~ '^[A-Za-z][A-Za-z ]*$'
      ORDER BY c.name, p.id
      LIMIT 1
    `) as { printing_id: string; card_name: string }[];
    if (picked.length === 0) {
      throw new Error("no suitable card found for dnd seeding");
    }
    const { printing_id: printingId, card_name: cardName } = picked[0];

    await sql`
      INSERT INTO copies (user_id, collection_id, printing_id)
      SELECT u.id, ${collectionId}::uuid, ${printingId}::uuid
      FROM users u
      CROSS JOIN generate_series(1, ${count}) g
      WHERE u.email = ${email}
    `;
    return { cardName, printingId };
  } finally {
    await sql.end();
  }
}

async function countCopiesInCollection(collectionId: string): Promise<number> {
  const sql = loadDb();
  try {
    const rows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM copies
      WHERE collection_id = ${collectionId}
    `) as { count: number }[];
    return rows[0].count;
  } finally {
    await sql.end();
  }
}

// TanStack Start encodes the server fn id as base64url(JSON) referencing the
// source file + export name; matching on the decoded payload lets us target a
// single server fn out of the bundle that fires during a route transition.
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

function watchMoveRequests(page: Page): { fired: () => boolean } {
  let moveFired = false;
  page.on("request", (req) => {
    if (req.method() === "POST" && isServerFn(req.url(), "moveCopiesFn")) {
      moveFired = true;
    }
  });
  return { fired: () => moveFired };
}

test.describe("collections drag-drop", () => {
  test.describe.serial("happy path", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("drag a card from Inbox onto another collection moves it", async ({ page }) => {
      const email = await createAndLogin(page, "happy");
      userEmail = email;

      const targetId = await apiCreateCollection(page, "Target");
      const inboxId = await getInboxId(email);
      const { cardName } = await seedSameCardCopies(email, inboxId, 1);

      await page.goto(`/collections/${inboxId}`);
      await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("link", { name: "Target" })).toBeVisible();

      const cardTile = page.getByRole("img", { name: cardName }).first();
      await expect(cardTile).toBeVisible();
      const targetLink = page.getByRole("link", { name: "Target" });

      const moveRequest = page.waitForRequest(
        (req) => req.method() === "POST" && isServerFn(req.url(), "moveCopiesFn"),
      );
      await dndDrag(page, cardTile, targetLink);
      await moveRequest;

      await expect(page.getByText("Moved 1 card", { exact: true })).toBeVisible();
      await expect(page.getByRole("img", { name: cardName })).toHaveCount(0);

      await page.goto(`/collections/${targetId}`);
      await expect(page.getByRole("img", { name: cardName })).toBeVisible({ timeout: 15_000 });

      expect(await countCopiesInCollection(targetId)).toBe(1);
      expect(await countCopiesInCollection(inboxId)).toBe(0);
    });
  });

  test.describe.serial("multi-copy stack", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("dragging a 3-copy stack moves all 3 copies", async ({ page }) => {
      const email = await createAndLogin(page, "multi");
      userEmail = email;

      const targetId = await apiCreateCollection(page, "Target");
      const inboxId = await getInboxId(email);
      const { cardName } = await seedSameCardCopies(email, inboxId, 3);

      // Default view is "cards" — all 3 copies render as a single stacked tile.
      await page.goto(`/collections/${inboxId}`);
      await expect(page.getByRole("link", { name: "Target" })).toBeVisible({ timeout: 15_000 });

      const cardTile = page.getByRole("img", { name: cardName }).first();
      await expect(cardTile).toBeVisible();
      const targetLink = page.getByRole("link", { name: "Target" });

      const moveRequest = page.waitForRequest(
        (req) => req.method() === "POST" && isServerFn(req.url(), "moveCopiesFn"),
      );
      await dndDrag(page, cardTile, targetLink);
      await moveRequest;

      await expect(page.getByText("Moved 3 cards", { exact: true })).toBeVisible();
      expect(await countCopiesInCollection(targetId)).toBe(3);
      expect(await countCopiesInCollection(inboxId)).toBe(0);
    });
  });

  test.describe.serial("drag overlay", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("shows fanned preview + count badge during drag; release outside fires no request", async ({
      page,
    }) => {
      const email = await createAndLogin(page, "overlay");
      userEmail = email;

      await apiCreateCollection(page, "Target");
      const inboxId = await getInboxId(email);
      const { cardName } = await seedSameCardCopies(email, inboxId, 2);

      await page.goto(`/collections/${inboxId}`);
      await expect(page.getByRole("link", { name: "Target" })).toBeVisible({ timeout: 15_000 });

      const cardTile = page.getByRole("img", { name: cardName }).first();
      await expect(cardTile).toBeVisible();
      const sourceBox = await cardTile.boundingBox();
      if (!sourceBox) {
        throw new Error("source tile not visible");
      }

      const startX = sourceBox.x + sourceBox.width / 2;
      const startY = sourceBox.y + sourceBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 20, startY, { steps: 5 });
      // Move further into empty grid space so the overlay is clear of the tile.
      await page.mouse.move(startX + 200, startY + 50, { steps: 10 });

      // DragPreview renders the "N copies" label + a "N" count badge for N > 1.
      await expect(page.getByText("2 copies").first()).toBeVisible();

      // Source tile picks up inline opacity: 0.4 via DraggableCard's isDragging
      // state; walk up from the img to find the ancestor carrying that style.
      const hasReducedOpacity = await cardTile.evaluate((el) => {
        let node: HTMLElement | null = el as HTMLElement;
        while (node) {
          if (node.style && node.style.opacity === "0.4") {
            return true;
          }
          node = node.parentElement;
        }
        return false;
      });
      expect(hasReducedOpacity).toBe(true);

      const moves = watchMoveRequests(page);
      await page.mouse.up();
      await page.waitForTimeout(500);
      expect(moves.fired()).toBe(false);
      await expect(page.getByText(/Moved \d+ card/)).toHaveCount(0);
    });
  });

  test.describe.serial("no-op: drop on source collection", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("dropping on the source (Inbox) does not highlight, does not move", async ({ page }) => {
      const email = await createAndLogin(page, "src");
      userEmail = email;

      await apiCreateCollection(page, "Target");
      const inboxId = await getInboxId(email);
      const { cardName } = await seedSameCardCopies(email, inboxId, 1);

      await page.goto(`/collections/${inboxId}`);
      await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible({ timeout: 15_000 });

      const cardTile = page.getByRole("img", { name: cardName }).first();
      const inboxLink = page.getByRole("link", { name: "Inbox" });
      // DroppableCollection wraps SidebarMenuItem (a <li>) in a <div>; the first
      // div ancestor of the link is that wrapper — where the ring class lands.
      const inboxRow = inboxLink.locator("xpath=ancestor::div[1]");

      const moves = watchMoveRequests(page);

      const sourceBox = await cardTile.boundingBox();
      const inboxBox = await inboxLink.boundingBox();
      if (!sourceBox || !inboxBox) {
        throw new Error("source or Inbox row not visible");
      }
      const startX = sourceBox.x + sourceBox.width / 2;
      const startY = sourceBox.y + sourceBox.height / 2;
      const endX = inboxBox.x + inboxBox.width / 2;
      const endY = inboxBox.y + inboxBox.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 20, startY, { steps: 5 });
      await page.mouse.move(endX, endY, { steps: 20 });
      // Droppable is disabled on the source, so isOver never flips on for Inbox.
      await expect(inboxRow).not.toHaveClass(/ring-primary/);
      await page.mouse.up();

      await page.waitForTimeout(500);
      expect(moves.fired()).toBe(false);
      await expect(page.getByText(/Moved /)).toHaveCount(0);
      expect(await countCopiesInCollection(inboxId)).toBe(1);
    });
  });

  test.describe.serial("no-op: drop in empty space", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("releasing outside any collection row fires no request", async ({ page }) => {
      const email = await createAndLogin(page, "empty");
      userEmail = email;

      await apiCreateCollection(page, "Target");
      const inboxId = await getInboxId(email);
      const { cardName } = await seedSameCardCopies(email, inboxId, 1);

      await page.goto(`/collections/${inboxId}`);
      await expect(page.getByRole("link", { name: "Target" })).toBeVisible({ timeout: 15_000 });

      const cardTile = page.getByRole("img", { name: cardName }).first();
      await expect(cardTile).toBeVisible();

      const moves = watchMoveRequests(page);

      const sourceBox = await cardTile.boundingBox();
      if (!sourceBox) {
        throw new Error("source tile not visible");
      }
      const startX = sourceBox.x + sourceBox.width / 2;
      const startY = sourceBox.y + sourceBox.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 20, startY, { steps: 5 });
      // Release in grid whitespace, clear of sidebar and any card tile.
      await page.mouse.move(startX + 400, startY + 200, { steps: 20 });
      await page.mouse.up();

      await page.waitForTimeout(500);
      expect(moves.fired()).toBe(false);
      await expect(page.getByText(/Moved /)).toHaveCount(0);
      expect(await countCopiesInCollection(inboxId)).toBe(1);
      await expect(cardTile).toBeVisible();
    });
  });

  test.describe.serial("hover highlight on target", () => {
    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("mid-drag, the Target row gets the ring highlight", async ({ page }) => {
      const email = await createAndLogin(page, "hover");
      userEmail = email;

      await apiCreateCollection(page, "Target");
      const inboxId = await getInboxId(email);
      const { cardName } = await seedSameCardCopies(email, inboxId, 1);

      await page.goto(`/collections/${inboxId}`);
      await expect(page.getByRole("link", { name: "Target" })).toBeVisible({ timeout: 15_000 });

      const cardTile = page.getByRole("img", { name: cardName }).first();
      const targetLink = page.getByRole("link", { name: "Target" });
      const targetRow = targetLink.locator("xpath=ancestor::div[1]");

      const sourceBox = await cardTile.boundingBox();
      const targetBox = await targetLink.boundingBox();
      if (!sourceBox || !targetBox) {
        throw new Error("source or Target row not visible");
      }
      const startX = sourceBox.x + sourceBox.width / 2;
      const startY = sourceBox.y + sourceBox.height / 2;
      const endX = targetBox.x + targetBox.width / 2;
      const endY = targetBox.y + targetBox.height / 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 20, startY, { steps: 5 });
      await page.mouse.move(endX, endY, { steps: 20 });

      // The ring class is the actual visible drop affordance; there is no
      // role/aria alternative for a drag-hover state.
      await expect(targetRow).toHaveClass(/ring-primary/);

      await page.mouse.up();
    });
  });

  test.describe.serial("mobile: drag disabled", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    let userEmail: string | undefined;

    test.afterEach(async () => {
      if (userEmail) {
        await deleteUser(userEmail);
        userEmail = undefined;
      }
    });

    test("mouse-style drag does not fire a move request on mobile viewports", async ({ page }) => {
      const email = await createAndLogin(page, "mobile");
      userEmail = email;

      await apiCreateCollection(page, "Target");
      const inboxId = await getInboxId(email);
      const { cardName } = await seedSameCardCopies(email, inboxId, 1);

      await page.goto(`/collections/${inboxId}`);
      const cardTile = page.getByRole("img", { name: cardName }).first();
      await expect(cardTile).toBeVisible({ timeout: 15_000 });

      const moves = watchMoveRequests(page);

      const sourceBox = await cardTile.boundingBox();
      if (!sourceBox) {
        throw new Error("source tile not visible");
      }
      const startX = sourceBox.x + sourceBox.width / 2;
      const startY = sourceBox.y + sourceBox.height / 2;

      // On mobile, DraggableCard returns children without any dnd-kit listeners,
      // so pointer events never activate a drag regardless of where we move.
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 20, startY, { steps: 5 });
      await page.mouse.move(startX + 200, startY + 100, { steps: 20 });
      await page.mouse.up();

      await page.waitForTimeout(500);
      expect(moves.fired()).toBe(false);
      await expect(page.getByText(/Moved /)).toHaveCount(0);
      expect(await countCopiesInCollection(inboxId)).toBe(1);
    });
  });
});
