import { afterAll, describe, expect, it } from "bun:test";

import type { Source } from "@openrift/shared";

import { createApp } from "../app.js";
import { createDb } from "../db/connect.js";
import { migrate } from "../db/migrate.js";
import { createTempDb, dropTempDb, noopLogger, replaceDbName } from "../test/integration-setup.js";

// ---------------------------------------------------------------------------
// Integration tests: Sources routes (pure CRUD)
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
  tempDbName = await createTempDb(DATABASE_URL, "sources");
  const testUrl = replaceDbName(DATABASE_URL, tempDbName);
  ({ db } = createDb(testUrl));
  await migrate(db, noopLogger);

  app = createApp({ db, auth: mockAuth, config: mockConfig });

  await db
    .insertInto("users")
    .values({ id: USER_ID, email: "a@test.com", name: "User A", email_verified: true, image: null })
    .execute();
}

function req(method: string, path: string, body?: unknown): Request {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) {
    opts.body = JSON.stringify(body);
  }
  return new Request(`http://localhost/api${path}`, opts);
}

describe.skipIf(!DATABASE_URL)("Sources routes (integration)", () => {
  afterAll(async () => {
    if (!DATABASE_URL) {
      return;
    }
    await db.destroy();
    await dropTempDb(DATABASE_URL, tempDbName);
  });

  let sourceId: string;

  // ── POST /sources ─────────────────────────────────────────────────────────

  describe("POST /sources", () => {
    it("creates a source with full DTO shape", async () => {
      const res = await app.fetch(req("POST", "/sources", { name: "LGS Pickup" }));
      expect(res.status).toBe(201);

      const json = (await res.json()) as Source;
      expect(json.id).toBeString();
      expect(json.name).toBe("LGS Pickup");
      expect(json.description).toBeNull();
      expect(json.createdAt).toBeString();
      expect(json.updatedAt).toBeString();
      sourceId = json.id;
    });

    it("creates a source with description", async () => {
      const res = await app.fetch(
        req("POST", "/sources", { name: "Online Store", description: "TCGPlayer order" }),
      );
      expect(res.status).toBe(201);

      const json = (await res.json()) as Source;
      expect(json.description).toBe("TCGPlayer order");
    });

    it("rejects without name", async () => {
      const res = await app.fetch(req("POST", "/sources", {}));
      expect(res.status).toBe(400);
    });

    it("rejects empty name", async () => {
      const res = await app.fetch(req("POST", "/sources", { name: "" }));
      expect(res.status).toBe(400);
    });
  });

  // ── GET /sources ──────────────────────────────────────────────────────────

  describe("GET /sources", () => {
    it("returns all sources sorted by name", async () => {
      const res = await app.fetch(req("GET", "/sources"));
      expect(res.status).toBe(200);

      const json = (await res.json()) as Source[];
      expect(json.length).toBe(2);
      // Should be sorted alphabetically by name
      expect(json[0].name).toBe("LGS Pickup");
      expect(json[1].name).toBe("Online Store");
    });
  });

  // ── GET /sources/:id ──────────────────────────────────────────────────────

  describe("GET /sources/:id", () => {
    it("returns a single source", async () => {
      const res = await app.fetch(req("GET", `/sources/${sourceId}`));
      expect(res.status).toBe(200);

      const json = (await res.json()) as Source;
      expect(json.id).toBe(sourceId);
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("GET", `/sources/${fakeId}`));
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /sources/:id ────────────────────────────────────────────────────

  describe("PATCH /sources/:id", () => {
    it("updates source name", async () => {
      const res = await app.fetch(req("PATCH", `/sources/${sourceId}`, { name: "Renamed" }));
      expect(res.status).toBe(200);

      const json = (await res.json()) as Source;
      expect(json.name).toBe("Renamed");
    });

    it("updates source description", async () => {
      const res = await app.fetch(
        req("PATCH", `/sources/${sourceId}`, { description: "New desc" }),
      );
      expect(res.status).toBe(200);

      const json = (await res.json()) as Source;
      expect(json.description).toBe("New desc");
    });

    it("returns 404 for non-existent", async () => {
      const fakeId = "00000000-0000-4000-a000-000000000000";
      const res = await app.fetch(req("PATCH", `/sources/${fakeId}`, { name: "Nope" }));
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /sources/:id ───────────────────────────────────────────────────

  describe("DELETE /sources/:id", () => {
    it("deletes a source", async () => {
      const res = await app.fetch(req("DELETE", `/sources/${sourceId}`));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
    });

    it("returns 404 after deletion", async () => {
      const res = await app.fetch(req("GET", `/sources/${sourceId}`));
      expect(res.status).toBe(404);
    });
  });
});
