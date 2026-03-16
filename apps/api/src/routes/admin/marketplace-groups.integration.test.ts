import { afterAll, describe, expect, it } from "bun:test";

import { createApp } from "../../app.js";
import { createDb } from "../../db/connect.js";
import { migrate } from "../../db/migrate.js";
import { req } from "../../test/integration-helper.js";
import {
  createTempDb,
  dropTempDb,
  noopLogger,
  replaceDbName,
} from "../../test/integration-setup.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin marketplace-groups routes (unified)
//
// Uses a temp database — only auth is mocked. Requires DATABASE_URL.
// Excluded from `bun run test` by filename convention (.integration.test.ts).
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

const USER_ID = "a0000000-0000-4000-a000-00000000aa01";

const mockAuth = {
  handler: () => new Response("ok"),
  api: {
    getSession: async () => ({
      user: { id: USER_ID, email: "a@test.com", name: "User A" },
      session: { id: "sess-a" },
    }),
  },
  $Infer: { Session: { user: null, session: null } },
} as any;

const mockConfig = {
  port: 3000,
  databaseUrl: "",
  corsOrigin: undefined,
  auth: { secret: "test", adminEmail: undefined, google: undefined, discord: undefined },
  smtp: { configured: false },
  cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
} as any;

let app: ReturnType<typeof createApp>;
let db: ReturnType<typeof createDb>["db"];
let tempDbName = "";

if (DATABASE_URL) {
  tempDbName = await createTempDb(DATABASE_URL, "marketplace_groups");
  const testUrl = replaceDbName(DATABASE_URL, tempDbName);
  ({ db } = createDb(testUrl));
  await migrate(db, noopLogger);

  app = createApp({ db, auth: mockAuth, config: mockConfig });

  // Seed test user
  await db
    .insertInto("users")
    .values({
      id: USER_ID,
      email: "a@test.com",
      name: "User A",
      email_verified: true,
      image: null,
    })
    .execute();

  // Seed admin
  await db.insertInto("admins").values({ user_id: USER_ID }).execute();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("Admin marketplace-groups routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  // ── GET /admin/marketplace-groups (empty) ─────────────────────────────────

  describe("GET /admin/marketplace-groups", () => {
    it("returns empty groups initially", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-groups"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toBeArray();
      expect(json.groups).toHaveLength(0);
    });
  });

  // ── Seed marketplace groups ───────────────────────────────────────────────

  describe("GET /admin/marketplace-groups (after seeding)", () => {
    it("returns both tcgplayer and cardmarket groups", async () => {
      await db
        .insertInto("marketplace_groups")
        .values([
          {
            marketplace: "tcgplayer",
            group_id: 1,
            name: "Alpha Set",
            abbreviation: "AS",
          },
          {
            marketplace: "cardmarket",
            group_id: 2,
            name: "Beta Set",
            abbreviation: null,
          },
        ])
        .execute();

      const res = await app.fetch(req("GET", "/admin/marketplace-groups"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.groups).toBeArray();
      expect(json.groups).toHaveLength(2);

      // Ordered by marketplace then name: cardmarket before tcgplayer
      const cardmarketGroup = json.groups.find(
        (g: { marketplace: string }) => g.marketplace === "cardmarket",
      );
      const tcgplayerGroup = json.groups.find(
        (g: { marketplace: string }) => g.marketplace === "tcgplayer",
      );

      expect(cardmarketGroup).toBeDefined();
      expect(cardmarketGroup.marketplace).toBe("cardmarket");
      expect(cardmarketGroup.groupId).toBe(2);
      expect(cardmarketGroup.name).toBe("Beta Set");
      expect(cardmarketGroup.abbreviation).toBeNull();
      expect(cardmarketGroup.stagedCount).toBe(0);
      expect(cardmarketGroup.assignedCount).toBe(0);

      expect(tcgplayerGroup).toBeDefined();
      expect(tcgplayerGroup.marketplace).toBe("tcgplayer");
      expect(tcgplayerGroup.groupId).toBe(1);
      expect(tcgplayerGroup.name).toBe("Alpha Set");
      expect(tcgplayerGroup.abbreviation).toBe("AS");
      expect(tcgplayerGroup.stagedCount).toBe(0);
      expect(tcgplayerGroup.assignedCount).toBe(0);
    });

    it("response shape includes all expected fields", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-groups"));
      const json = await res.json();

      for (const group of json.groups) {
        expect(group).toHaveProperty("marketplace");
        expect(group).toHaveProperty("groupId");
        expect(group).toHaveProperty("name");
        expect(group).toHaveProperty("abbreviation");
        expect(group).toHaveProperty("stagedCount");
        expect(group).toHaveProperty("assignedCount");
      }
    });
  });

  // ── PATCH /admin/marketplace-groups/:marketplace/:id ──────────────────────

  describe("PATCH /admin/marketplace-groups/:marketplace/:id", () => {
    it("updates a group name", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/marketplace-groups/tcgplayer/1", {
          name: "Alpha Set Revised",
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("clears a group name with null", async () => {
      const res = await app.fetch(
        req("PATCH", "/admin/marketplace-groups/cardmarket/2", {
          name: null,
        }),
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("GET reflects the updated names", async () => {
      const res = await app.fetch(req("GET", "/admin/marketplace-groups"));
      const json = await res.json();

      const tcgplayerGroup = json.groups.find(
        (g: { marketplace: string }) => g.marketplace === "tcgplayer",
      );
      expect(tcgplayerGroup.name).toBe("Alpha Set Revised");

      const cardmarketGroup = json.groups.find(
        (g: { marketplace: string }) => g.marketplace === "cardmarket",
      );
      expect(cardmarketGroup.name).toBeNull();
    });
  });
});
