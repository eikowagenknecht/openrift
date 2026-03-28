import { describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// ---------------------------------------------------------------------------
// Integration tests: Admin ignored-candidates (cards + printings)
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses provider prefix "iic-" for external IDs to avoid collisions.
// ---------------------------------------------------------------------------

const ADMIN_ID = "a0000000-0048-4000-a000-000000000001";
const NON_ADMIN_ID = "a0000000-0049-4000-a000-000000000001";

const adminCtx = createTestContext(ADMIN_ID);
const nonAdminCtx = createTestContext(NON_ADMIN_ID);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!adminCtx)("Admin ignored-candidates routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app } = adminCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: nonAdminApp } = nonAdminCtx!;

  // ── Non-admin access control ──────────────────────────────────────────────

  describe("admin-only access control (non-admin)", () => {
    it("GET /admin/ignored-candidates returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(req("GET", "/admin/ignored-candidates"));
      expect(res.status).toBe(403);
    });

    it("POST /admin/ignored-candidates/cards returns 403 for non-admin", async () => {
      const res = await nonAdminApp.fetch(
        req("POST", "/admin/ignored-candidates/cards", {
          provider: "tcgplayer",
          externalId: "iic-blocked",
        }),
      );
      expect(res.status).toBe(403);
    });
  });

  // ── GET /admin/ignored-candidates (initial) ──────────────────────────────

  describe("GET /admin/ignored-candidates (initial)", () => {
    it("returns 200 with cards and printings arrays (no iic- entries)", async () => {
      const res = await app.fetch(req("GET", "/admin/ignored-candidates"));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.cards).toBeInstanceOf(Array);
      expect(json.printings).toBeInstanceOf(Array);

      const iicCards = json.cards.filter((c: { externalId: string }) =>
        c.externalId.startsWith("iic-"),
      );
      const iicPrintings = json.printings.filter((p: { externalId: string }) =>
        p.externalId.startsWith("iic-"),
      );
      expect(iicCards).toHaveLength(0);
      expect(iicPrintings).toHaveLength(0);
    });
  });

  // ── POST /admin/ignored-candidates/cards ──────────────────────────────────

  describe("POST /admin/ignored-candidates/cards", () => {
    it("ignores a card", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-candidates/cards", {
          provider: "tcgplayer",
          externalId: "iic-card-001",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("ignores a second card (different provider)", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-candidates/cards", {
          provider: "cardmarket",
          externalId: "iic-card-002",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("is idempotent (ignoring same card again succeeds)", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-candidates/cards", {
          provider: "tcgplayer",
          externalId: "iic-card-001",
        }),
      );
      // The route does an upsert, so it should still return 204
      expect(res.status).toBe(204);
    });

    it("returns 400 for missing provider", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-candidates/cards", { externalId: "iic-bad" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for missing externalId", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-candidates/cards", { provider: "tcgplayer" }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── POST /admin/ignored-candidates/printings ──────────────────────────────

  describe("POST /admin/ignored-candidates/printings", () => {
    it("ignores a printing with finish", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-candidates/printings", {
          provider: "tcgplayer",
          externalId: "iic-print-001",
          finish: "foil",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("ignores a printing with null finish", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-candidates/printings", {
          provider: "tcgplayer",
          externalId: "iic-print-002",
          finish: null,
        }),
      );
      expect(res.status).toBe(204);
    });

    it("ignores a printing with omitted finish (defaults to null)", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-candidates/printings", {
          provider: "cardmarket",
          externalId: "iic-print-003",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("returns 400 for missing provider", async () => {
      const res = await app.fetch(
        req("POST", "/admin/ignored-candidates/printings", {
          externalId: "iic-bad",
          finish: "foil",
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /admin/ignored-candidates (after ignoring) ────────────────────────

  describe("GET /admin/ignored-candidates (after ignoring)", () => {
    it("returns the ignored iic- cards and printings", async () => {
      const res = await app.fetch(req("GET", "/admin/ignored-candidates"));
      expect(res.status).toBe(200);

      const json = await res.json();

      // Check cards
      const iicCards = json.cards.filter((c: { externalId: string }) =>
        c.externalId.startsWith("iic-"),
      );
      expect(iicCards).toHaveLength(2);

      const card1 = iicCards.find((c: { externalId: string }) => c.externalId === "iic-card-001");
      expect(card1).toBeDefined();
      expect(card1.provider).toBe("tcgplayer");
      expect(card1.id).toBeTypeOf("string");
      expect(card1.createdAt).toBeTypeOf("string");

      const card2 = iicCards.find((c: { externalId: string }) => c.externalId === "iic-card-002");
      expect(card2).toBeDefined();
      expect(card2.provider).toBe("cardmarket");

      // Check printings
      const iicPrintings = json.printings.filter((p: { externalId: string }) =>
        p.externalId.startsWith("iic-"),
      );
      expect(iicPrintings).toHaveLength(3);

      const print1 = iicPrintings.find(
        (p: { externalId: string; finish: string | null }) =>
          p.externalId === "iic-print-001" && p.finish === "foil",
      );
      expect(print1).toBeDefined();
      expect(print1.provider).toBe("tcgplayer");

      const print2 = iicPrintings.find(
        (p: { externalId: string }) => p.externalId === "iic-print-002",
      );
      expect(print2).toBeDefined();
      expect(print2.finish).toBeNull();

      const print3 = iicPrintings.find(
        (p: { externalId: string }) => p.externalId === "iic-print-003",
      );
      expect(print3).toBeDefined();
      expect(print3.provider).toBe("cardmarket");
      expect(print3.finish).toBeNull();
    });
  });

  // ── DELETE /admin/ignored-candidates/cards ────────────────────────────────

  describe("DELETE /admin/ignored-candidates/cards", () => {
    it("unignores a card", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/ignored-candidates/cards", {
          provider: "tcgplayer",
          externalId: "iic-card-001",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("is idempotent (unignoring same card again succeeds)", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/ignored-candidates/cards", {
          provider: "tcgplayer",
          externalId: "iic-card-001",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("unignores second card", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/ignored-candidates/cards", {
          provider: "cardmarket",
          externalId: "iic-card-002",
        }),
      );
      expect(res.status).toBe(204);
    });
  });

  // ── DELETE /admin/ignored-candidates/printings ────────────────────────────

  describe("DELETE /admin/ignored-candidates/printings", () => {
    it("unignores a printing with finish", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/ignored-candidates/printings", {
          provider: "tcgplayer",
          externalId: "iic-print-001",
          finish: "foil",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("unignores a printing with null finish", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/ignored-candidates/printings", {
          provider: "tcgplayer",
          externalId: "iic-print-002",
          finish: null,
        }),
      );
      expect(res.status).toBe(204);
    });

    it("unignores the cardmarket printing", async () => {
      const res = await app.fetch(
        req("DELETE", "/admin/ignored-candidates/printings", {
          provider: "cardmarket",
          externalId: "iic-print-003",
          finish: null,
        }),
      );
      expect(res.status).toBe(204);
    });
  });

  // ── GET /admin/ignored-candidates (after cleanup) ─────────────────────────

  describe("GET /admin/ignored-candidates (after cleanup)", () => {
    it("has no iic- entries remaining", async () => {
      const res = await app.fetch(req("GET", "/admin/ignored-candidates"));
      expect(res.status).toBe(200);

      const json = await res.json();
      const iicCards = json.cards.filter((c: { externalId: string }) =>
        c.externalId.startsWith("iic-"),
      );
      const iicPrintings = json.printings.filter((p: { externalId: string }) =>
        p.externalId.startsWith("iic-"),
      );
      expect(iicCards).toHaveLength(0);
      expect(iicPrintings).toHaveLength(0);
    });
  });
});
