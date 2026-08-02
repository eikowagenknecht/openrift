import { describe, expect, it } from "vitest";

import {
  adminReq,
  createTestContext,
  refreshCardAggregates,
  syncCardCardTypes,
} from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

// ---------------------------------------------------------------------------
// Integration tests: card-review per-section grant (ADR-040 lineage)
//
// A non-admin user holding the `card-review` grant may reach only the
// candidate review endpoints, sees only candidates from helper-reviewable
// providers, and may only accept data from those providers. Everything else
// 403s. A full-admin control context verifies admins stay unscoped.
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix CRG- for entities it creates.
// ---------------------------------------------------------------------------

const ADMIN_USER_ID = "a0000000-0198-4000-a000-000000000001";
const GRANT_USER_ID = "a0000000-0199-4000-a000-000000000001";

const adminCtx = createTestContext(ADMIN_USER_ID);
const grantCtx = createTestContext(GRANT_USER_ID);

const ALLOWED = "crg-allowed";
const DENIED = "crg-denied";

let card1Id: string;
let card2Id: string;
let printing1Id: string;
let cpAllowedUnlinked1Id: string;
let cpAllowedUnlinked2Id: string;
let cpAllowedLinkedId: string;
let cpDeniedId: string;

if (adminCtx && grantCtx) {
  const { db } = grantCtx;

  // ── Seed data ──────────────────────────────────────────────────────────────

  // The grant that makes GRANT_USER a card-review helper
  await db
    .insertInto("adminGrants")
    .values({ userId: GRANT_USER_ID, section: "card-review" })
    .execute();

  // One helper-reviewable provider, one not
  await db
    .insertInto("providerSettings")
    .values([
      {
        provider: ALLOWED,
        helperReviewable: true,
        isFavorite: false,
        isHidden: false,
        sortOrder: 0,
      },
      {
        provider: DENIED,
        helperReviewable: false,
        isFavorite: false,
        isHidden: false,
        sortOrder: 0,
      },
    ])
    .onConflict((oc) => oc.column("provider").doNothing())
    .execute();

  const [set] = await db
    .insertInto("sets")
    .values({ slug: "CRG-TEST", name: "CRG Test Set", printedTotal: 5, sortOrder: 199 })
    .returning("id")
    .execute();

  // Matched card with candidates from both providers
  const [card1] = await db
    .insertInto("cards")
    .values({
      slug: "CRG-001",
      name: "CRG Matched Card",
      type: "unit",
      might: 2,
      energy: 2,
      power: 1,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  card1Id = card1.id;

  // Matched card whose only candidate is from the denied provider
  const [card2] = await db
    .insertInto("cards")
    .values({
      slug: "CRG-002",
      name: "CRG Denied Only Card",
      type: "spell",
      might: null,
      energy: 1,
      power: null,
      mightBonus: null,
      keywords: [],
      tags: [],
    })
    .returning("id")
    .execute();
  card2Id = card2.id;
  await syncCardCardTypes(db);

  await db
    .insertInto("cardDomains")
    .values([
      { cardId: card1Id, domainSlug: "mind", ordinal: 0 },
      { cardId: card2Id, domainSlug: "calm", ordinal: 0 },
    ])
    .execute();

  await db
    .insertInto("cardNameAliases")
    .values([
      { cardId: card1Id, normName: "crgmatchedcard" },
      { cardId: card2Id, normName: "crgdeniedonlycard" },
    ])
    .execute();

  const [printing1] = await db
    .insertInto("printings")
    .values({
      cardId: card1Id,
      setId: set.id,
      shortCode: "CRG-001",
      rarity: "common",
      artVariant: "normal",
      isSigned: false,
      finish: "normal",
      artist: "CRG Artist",
      publicCode: "CRG",
      printedRulesText: null,
      printedEffectText: null,
      flavorText: null,
      comment: null,
      size: "standard",
      language: "EN",
    })
    .returning("id")
    .execute();
  printing1Id = printing1.id;

  const candidateCard = (provider: string, name: string, externalId: string) => ({
    provider,
    name,
    types: ["unit"],
    superTypes: [],
    domains: ["mind"],
    might: 2,
    energy: 2,
    power: 1,
    mightBonus: null,
    rulesText: null,
    effectText: null,
    tags: [],
    shortCode: null,
    externalId,
    extraData: null,
  });

  const [ccAllowedMatched] = await db
    .insertInto("candidateCards")
    .values(candidateCard(ALLOWED, "CRG Matched Card", "crg-cc-allowed"))
    .returning("id")
    .execute();
  const [ccDeniedMatched] = await db
    .insertInto("candidateCards")
    .values(candidateCard(DENIED, "CRG Matched Card", "crg-cc-denied"))
    .returning("id")
    .execute();
  const [_ccDeniedOnly] = await db
    .insertInto("candidateCards")
    .values(candidateCard(DENIED, "CRG Denied Only Card", "crg-cc-denied-only"))
    .returning("id")
    .execute();
  // Unmatched groups (no card with these names)
  await db
    .insertInto("candidateCards")
    .values(candidateCard(ALLOWED, "CRG Allowed New", "crg-cc-new-allowed"))
    .execute();
  await db
    .insertInto("candidateCards")
    .values(candidateCard(DENIED, "CRG Denied New", "crg-cc-new-denied"))
    .execute();

  const candidatePrinting = (
    candidateCardId: string,
    shortCode: string,
    externalId: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    candidateCardId,
    printingId: null,
    shortCode,
    setId: "CRG-TEST",
    setName: "CRG Test Set",
    rarity: "common",
    artVariant: "normal",
    isSigned: false,
    finish: "normal",
    artist: "CRG Artist",
    publicCode: "CRG",
    printedRulesText: null,
    printedEffectText: null,
    imageUrl: null,
    flavorText: null,
    externalId,
    extraData: null,
    ...overrides,
  });

  const [cpA1] = await db
    .insertInto("candidatePrintings")
    .values(candidatePrinting(ccAllowedMatched.id, "CRG-001b", "crg-cp-allowed-1"))
    .returning("id")
    .execute();
  cpAllowedUnlinked1Id = cpA1.id;

  const [cpA2] = await db
    .insertInto("candidatePrintings")
    .values(
      candidatePrinting(ccAllowedMatched.id, "CRG-001c", "crg-cp-allowed-2", { finish: "foil" }),
    )
    .returning("id")
    .execute();
  cpAllowedUnlinked2Id = cpA2.id;

  const [cpA3] = await db
    .insertInto("candidatePrintings")
    .values(
      candidatePrinting(ccAllowedMatched.id, "CRG-001", "crg-cp-allowed-linked", {
        printingId: printing1Id,
        imageUrl: "https://example.com/crg-001.png",
      }),
    )
    .returning("id")
    .execute();
  cpAllowedLinkedId = cpA3.id;

  const [cpD1] = await db
    .insertInto("candidatePrintings")
    .values(candidatePrinting(ccDeniedMatched.id, "CRG-001d", "crg-cp-denied-1"))
    .returning("id")
    .execute();
  cpDeniedId = cpD1.id;

  await refreshCardAggregates(db);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!adminCtx || !grantCtx)("card-review grant (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: grantApp } = grantCtx!;
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app: adminApp, db } = adminCtx!;

  // ── Path gate: excluded endpoints 403 for the grant holder ────────────────

  describe("excluded endpoints 403", () => {
    it.each([
      ["GET", "/cards/export"],
      ["GET", "/cards/provider-stats"],
      ["GET", "/cards/provider-names"],
      ["GET", "/unified-mappings"],
      ["GET", "/users"],
      ["POST", "/cards/create"],
      ["POST", "/cards/upload"],
      ["POST", "/cards/new/crgallowednew/accept-favorites"],
      ["POST", "/cards/CRG-001/accept-favorite-printings"],
      ["POST", "/cards/errata/upload"],
      ["POST", "/cards/by-provider/crg-allowed/check"],
      ["DELETE", "/cards/by-provider/crg-allowed"],
      ["POST", "/ignored-candidates/cards"],
      ["PATCH", "/provider-settings/crg-allowed"],
      ["PUT", "/provider-settings/reorder"],
      ["POST", "/cards/printing/00000000-0000-4000-a000-000000000000/add-image-url"],
      ["DELETE", "/cards/printing-images/00000000-0000-4000-a000-000000000000"],
    ])("%s %s", async (method, path) => {
      const res = await grantApp.fetch(adminReq(method, path, {}));
      expect(res.status).toBe(403);
    });

    it("403s check/uncheck and candidate-printing DELETE by id", async () => {
      const checkRes = await grantApp.fetch(
        adminReq("POST", `/cards/${cpAllowedUnlinked1Id}/check`),
      );
      expect(checkRes.status).toBe(403);

      const deleteRes = await grantApp.fetch(
        adminReq("DELETE", `/cards/candidate-printings/${cpAllowedUnlinked1Id}`),
      );
      expect(deleteRes.status).toBe(403);
    });
  });

  // ── Read filtering ─────────────────────────────────────────────────────────

  describe("read filtering", () => {
    it("filters the candidate list to allowed providers", async () => {
      const res = await grantApp.fetch(adminReq("GET", "/cards"));
      expect(res.status).toBe(200);
      const json = await readJson(res);

      const bySlug = (slug: string) =>
        json.find((r: { cardSlug: string | null }) => r.cardSlug === slug);
      const byName = (name: string) => json.find((r: { name: string }) => r.name === name);

      // matched card with an allowed candidate stays, and only counts allowed ones
      expect(bySlug("CRG-001")).toBeDefined();
      expect(bySlug("CRG-001").candidateCount).toBe(1);
      // matched card with only denied candidates disappears
      expect(bySlug("CRG-002")).toBeUndefined();
      // unmatched groups: allowed stays, denied disappears
      expect(byName("CRG Allowed New")).toBeDefined();
      expect(byName("CRG Denied New")).toBeUndefined();
    });

    it("full admins keep the unfiltered list", async () => {
      const res = await adminApp.fetch(adminReq("GET", "/cards"));
      expect(res.status).toBe(200);
      const json = await readJson(res);

      const card1 = json.find((r: { cardSlug: string | null }) => r.cardSlug === "CRG-001");
      expect(card1.candidateCount).toBe(2);
      expect(json.find((r: { cardSlug: string | null }) => r.cardSlug === "CRG-002")).toBeDefined();
      expect(json.find((r: { name: string }) => r.name === "CRG Denied New")).toBeDefined();
    });

    it("filters card-detail sources and candidate printings to allowed providers", async () => {
      const res = await grantApp.fetch(adminReq("GET", "/cards/CRG-001"));
      expect(res.status).toBe(200);
      const json = await readJson(res);

      expect(json.sources.map((s: { provider: string }) => s.provider)).toEqual([ALLOWED]);
      const cpIds = json.candidatePrintings.map((cp: { id: string }) => cp.id);
      expect(cpIds).toContain(cpAllowedUnlinked1Id);
      expect(cpIds).not.toContain(cpDeniedId);
      // marketplace data is admin-only
      expect(json.marketplaceMappings).toEqual([]);
      // accepted printings stay visible (live catalog data)
      expect(json.printings).toHaveLength(1);
    });

    it("full admins keep both providers on the card detail", async () => {
      const res = await adminApp.fetch(adminReq("GET", "/cards/CRG-001"));
      const json = await readJson(res);
      const providers = json.sources.map((s: { provider: string }) => s.provider).sort();
      expect(providers).toEqual([ALLOWED, DENIED]);
    });

    it("filters the unmatched detail to allowed providers", async () => {
      const allowed = await grantApp.fetch(adminReq("GET", "/cards/new/crgallowednew"));
      expect(allowed.status).toBe(200);
      const allowedJson = await readJson(allowed);
      expect(allowedJson.sources).toHaveLength(1);
      expect(allowedJson.sources[0].provider).toBe(ALLOWED);

      // the denied group reads as empty, not 403 — it simply isn't visible
      const denied = await grantApp.fetch(adminReq("GET", "/cards/new/crgdeniednew"));
      expect(denied.status).toBe(200);
      const deniedJson = await readJson(denied);
      expect(deniedJson.sources).toHaveLength(0);
    });

    it("allows the supporting reads the pages need", async () => {
      for (const path of [
        "/cards/all-cards",
        "/cards/distinct-artists",
        "/provider-settings",
        "/markers",
        "/languages",
        "/distribution-channels",
        "/sets",
      ]) {
        const res = await grantApp.fetch(adminReq("GET", path));
        expect(res.status, path).toBe(200);
      }
    });
  });

  // ── Write scoping: 403 outside the provider allowlist ─────────────────────

  describe("write scoping 403", () => {
    it("rejects patching a denied provider's candidate printing", async () => {
      const res = await grantApp.fetch(
        adminReq("PATCH", `/cards/candidate-printings/${cpDeniedId}`, { rarity: "rare" }),
      );
      expect(res.status).toBe(403);
    });

    it("rejects accepting a new card whose candidates are all denied", async () => {
      const res = await grantApp.fetch(
        adminReq("POST", "/cards/new/crgdeniednew/accept", {
          cardFields: {
            id: "CRG-NEW-DENIED",
            name: "CRG Denied New",
            types: ["unit"],
            domains: ["mind"],
          },
        }),
      );
      expect(res.status).toBe(403);
    });

    it("rejects accept-field on a card with only denied candidates", async () => {
      const res = await grantApp.fetch(
        adminReq("POST", `/cards/${card2Id}/accept-field`, { field: "energy", value: 3 }),
      );
      expect(res.status).toBe(403);
    });

    it("rejects accept-printing with denied candidate ids or an empty id list", async () => {
      const denied = await grantApp.fetch(
        adminReq("POST", `/cards/${card1Id}/accept-printing`, {
          printingFields: {
            shortCode: "CRG-001d",
            setId: "CRG-TEST",
            rarity: "common",
            finish: "normal",
            artist: "CRG Artist",
            publicCode: "CRG",
          },
          candidatePrintingIds: [cpDeniedId],
        }),
      );
      expect(denied.status).toBe(403);

      // empty ids = de-facto manual printing creation, which is excluded
      const empty = await grantApp.fetch(
        adminReq("POST", `/cards/${card1Id}/accept-printing`, {
          printingFields: {
            shortCode: "CRG-001e",
            setId: "CRG-TEST",
            rarity: "common",
            finish: "normal",
            artist: "CRG Artist",
            publicCode: "CRG",
          },
          candidatePrintingIds: [],
        }),
      );
      expect(empty.status).toBe(403);
    });

    it("rejects set-image on a denied provider's candidate printing", async () => {
      const res = await grantApp.fetch(
        adminReq("POST", `/cards/candidate-printings/${cpDeniedId}/set-image`, { mode: "main" }),
      );
      expect(res.status).toBe(403);
    });
  });

  // ── Happy path: the allowed review flow works end to end ──────────────────

  describe("allowed review flow", () => {
    it("patches an allowed candidate printing's differentiators", async () => {
      const res = await grantApp.fetch(
        adminReq("PATCH", `/cards/candidate-printings/${cpAllowedUnlinked2Id}`, {
          rarity: "rare",
        }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("candidatePrintings")
        .select("rarity")
        .where("id", "=", cpAllowedUnlinked2Id)
        .executeTakeFirst();
      expect(row?.rarity).toBe("rare");
    });

    it("accepts a field on a card with allowed candidates", async () => {
      const res = await grantApp.fetch(
        adminReq("POST", `/cards/${card1Id}/accept-field`, { field: "energy", value: 4 }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("cards")
        .select("energy")
        .where("id", "=", card1Id)
        .executeTakeFirst();
      expect(row?.energy).toBe(4);
    });

    it("accepts a printing field via the printing's card", async () => {
      const res = await grantApp.fetch(
        adminReq("POST", `/cards/printing/${printing1Id}/accept-field`, {
          field: "artist",
          value: "CRG Artist Updated",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("sets a printing image from an allowed candidate printing", async () => {
      const res = await grantApp.fetch(
        adminReq("POST", `/cards/candidate-printings/${cpAllowedLinkedId}/set-image`, {
          mode: "main",
        }),
      );
      expect(res.status).toBe(204);
    });

    it("accepts a printing from allowed candidate ids", async () => {
      const res = await grantApp.fetch(
        adminReq("POST", `/cards/${card1Id}/accept-printing`, {
          printingFields: {
            shortCode: "CRG-001b",
            setId: "CRG-TEST",
            rarity: "common",
            artVariant: "normal",
            finish: "normal",
            artist: "CRG Artist",
            publicCode: "CRG",
          },
          candidatePrintingIds: [cpAllowedUnlinked1Id],
        }),
      );
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.printingId).toBeTypeOf("string");
    });

    it("accepts a new card from an allowed unmatched group", async () => {
      const res = await grantApp.fetch(
        adminReq("POST", "/cards/new/crgallowednew/accept", {
          cardFields: {
            id: "CRG-NEW-001",
            name: "CRG Allowed New",
            types: ["unit"],
            domains: ["mind"],
            might: 2,
            energy: 2,
            power: 1,
          },
        }),
      );
      expect(res.status).toBe(204);

      const card = await db
        .selectFrom("cards")
        .select("slug")
        .where("slug", "=", "CRG-NEW-001")
        .executeTakeFirst();
      expect(card).toBeDefined();
    });

    it("reaches the me probe and learns its sections", async () => {
      const res = await grantApp.fetch(adminReq("GET", "/me"));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.isAdmin).toBe(false);
      expect(json.sections).toEqual(["card-review"]);
    });
  });
});
