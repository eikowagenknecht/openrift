import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../../deps.js";
import { CARD_FURY_UNIT } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

const OWNER_ID = "a0000000-0150-4000-a000-000000000001";
const ADMIN_ID = "a0000000-0151-4000-a000-000000000001";
const JUDGE_ID = "a0000000-0152-4000-a000-000000000001";
const MEMBER_ID = "a0000000-0153-4000-a000-000000000001";

const GROUP_SLUG = "deck-check-itest";

const ownerCtx = createTestContext(OWNER_ID);
const adminCtx = createTestContext(ADMIN_ID);
const judgeCtx = createTestContext(JUDGE_ID);
const memberCtx = createTestContext(MEMBER_ID);

/**
 * Builds an ingest push request authenticated with a Bearer push key.
 * @returns A Request aimed at the ingest endpoint.
 */
function ingestReq(token: string | null, body: unknown): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new Request("http://localhost/api/v1/ingest/deck-check", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function entryPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    externalId: "entry-1",
    playerName: "A. Player",
    playerEmail: "player@example.com",
    cards: [{ name: CARD_FURY_UNIT.name, quantity: 3, section: "main" }],
    ...overrides,
  };
}

describe.skipIf(!ownerCtx)("deck-check routes (integration, ADR-025)", () => {
  // oxlint-disable typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ownerCtx!;
  const ownerApp = ownerCtx!.app;
  const adminApp = adminCtx!.app;
  const judgeApp = judgeCtx!.app;
  const memberApp = memberCtx!.app;
  // oxlint-enable typescript/no-non-null-assertion
  const repos = createRepos(db);

  let groupId: string;
  let pushToken: string;
  let eventId: string;
  const ambiguousCardIds: string[] = [];

  /**
   * Pushes entries into the suite's event with the suite's key.
   * @returns The ingest response.
   */
  function push(entries: Record<string, unknown>[]): Promise<Response> {
    return ownerApp.fetch(ingestReq(pushToken, { eventId, entries }));
  }

  beforeAll(async () => {
    for (const [userId, name] of [
      [OWNER_ID, "Check Owner"],
      [ADMIN_ID, "Check Admin"],
      [JUDGE_ID, "Check Judge"],
      [MEMBER_ID, "Check Member"],
    ] as const) {
      await db
        .insertInto("users")
        .values({
          id: userId,
          email: `${name.toLowerCase().replaceAll(" ", "-")}@test.com`,
          name,
          emailVerified: true,
          image: null,
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    }

    const group = await repos.friendGroups.createWithOwner(
      { slug: GROUP_SLUG, name: "Deck Check Test Group", description: null, code: null },
      OWNER_ID,
    );
    groupId = group.id;
    await repos.friendGroups.addMember(groupId, ADMIN_ID, "admin");
    await repos.friendGroups.addMember(groupId, JUDGE_ID, "judge");
    await repos.friendGroups.addMember(groupId, MEMBER_ID, "member");

    // Two cards sharing a name make a name lookup ambiguous.
    for (const slug of ["dc-ambiguous-a", "dc-ambiguous-b"]) {
      const row = await db
        .insertInto("cards")
        .values({
          slug,
          name: "Ambiguous Twin",
          type: "unit",
          might: null,
          energy: 2,
          power: null,
          mightBonus: null,
          keywords: [],
          tags: [],
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      ambiguousCardIds.push(row.id);
    }
  });

  afterAll(async () => {
    await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
    if (ambiguousCardIds.length > 0) {
      await db.deleteFrom("cards").where("id", "in", ambiguousCardIds).execute();
    }
    await db
      .deleteFrom("users")
      .where("id", "in", [OWNER_ID, ADMIN_ID, JUDGE_ID, MEMBER_ID])
      .execute();
  });

  it("accepts 'judge' in friend_group_members.role", async () => {
    const membership = await repos.friendGroups.getMembership(groupId, JUDGE_ID);
    expect(membership?.role).toBe("judge");
  });

  describe("authorization boundaries", () => {
    it("returns 403 for a plain member on every deck-check surface", async () => {
      for (const request of [
        req("GET", `/friend-groups/${GROUP_SLUG}/checks`),
        req("POST", `/friend-groups/${GROUP_SLUG}/checks`, { name: "Nope" }),
        req("GET", `/friend-groups/${GROUP_SLUG}/deck-check-keys`),
        req("POST", `/friend-groups/${GROUP_SLUG}/deck-check-keys`, { label: "nope" }),
      ]) {
        const res = await memberApp.fetch(request.clone());
        expect(res.status).toBe(403);
      }
    });

    it("lets a judge read checks but not manage events or keys", async () => {
      const list = await judgeApp.fetch(req("GET", `/friend-groups/${GROUP_SLUG}/checks`));
      expect(list.status).toBe(200);
      const create = await judgeApp.fetch(
        req("POST", `/friend-groups/${GROUP_SLUG}/checks`, { name: "No" }),
      );
      expect(create.status).toBe(403);
      const keys = await judgeApp.fetch(req("GET", `/friend-groups/${GROUP_SLUG}/deck-check-keys`));
      expect(keys.status).toBe(403);
    });

    it("lets an admin create events and keys", async () => {
      const eventRes = await adminApp.fetch(
        req("POST", `/friend-groups/${GROUP_SLUG}/checks`, {
          name: "Integration Cup",
          eventDate: "2026-06-20",
        }),
      );
      expect(eventRes.status).toBe(201);
      eventId = ((await eventRes.json()) as { id: string }).id;

      const keyRes = await adminApp.fetch(
        req("POST", `/friend-groups/${GROUP_SLUG}/deck-check-keys`, { label: "itest" }),
      );
      expect(keyRes.status).toBe(201);
      const minted = (await keyRes.json()) as { token: string; key: { tokenPrefix: string } };
      expect(minted.token.startsWith("orpk_")).toBe(true);
      expect(minted.token.startsWith(minted.key.tokenPrefix)).toBe(true);
      pushToken = minted.token;

      // Plaintext is never persisted; only the SHA-256 hash is stored.
      const stored = await db
        .selectFrom("deckCheckKeys")
        .selectAll()
        .where("groupId", "=", groupId)
        .execute();
      expect(stored.some((row) => row.tokenHash === minted.token)).toBe(false);
    });
  });

  describe("ingest push", () => {
    it("rejects a missing or unknown key with 401", async () => {
      const missing = await ownerApp.fetch(ingestReq(null, { eventId, entries: [] }));
      expect(missing.status).toBe(401);
      const unknown = await ownerApp.fetch(ingestReq("orpk_wrong", { eventId, entries: [] }));
      expect(unknown.status).toBe(401);
    });

    it("rejects an unknown event id with 404 (pushes never create events)", async () => {
      const res = await ownerApp.fetch(
        ingestReq(pushToken, {
          eventId: "a0000000-0000-4000-a000-00000000dead",
          entries: [entryPayload()],
        }),
      );
      expect(res.status).toBe(404);
    });

    it("creates entries on first push and upserts them by externalId", async () => {
      const first = await push([entryPayload()]);
      expect(first.status).toBe(200);
      const firstResult = (await first.json()) as { eventId: string; entriesCreated: number };
      expect(firstResult.eventId).toBe(eventId);
      expect(firstResult.entriesCreated).toBe(1);

      const second = await push([entryPayload()]);
      const secondResult = (await second.json()) as {
        entriesCreated: number;
        entriesUnchanged: number;
      };
      expect(secondResult.entriesCreated).toBe(0);
      expect(secondResult.entriesUnchanged).toBe(1);
    });

    it("resolves matched, ambiguous, and unmatched lines against the catalog", async () => {
      const res = await push([
        entryPayload({
          externalId: "entry-resolution",
          playerName: "R. Solver",
          cards: [
            { name: CARD_FURY_UNIT.name, quantity: 1, section: "main" },
            { name: "Ambiguous Twin", quantity: 2, section: "main" },
            { name: "Totally Unknown Card", quantity: 3, section: "main" },
          ],
        }),
      ]);
      expect(res.status).toBe(200);

      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const cards = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(cards.map((card) => card.matchStatus)).toEqual(["matched", "ambiguous", "unmatched"]);
      expect(cards[0]?.resolvedCardId).toBe(CARD_FURY_UNIT.id);
      expect(cards[0]?.resolvedPrintingId).not.toBeNull();
      expect(cards[1]?.resolvedCardId).toBeNull();
      expect(cards[2]?.resolvedCardId).toBeNull();
    });

    it("rejects unknown sections with 422 and imports nothing from the push", async () => {
      const res = await push([
        entryPayload({
          externalId: "entry-bad-section",
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "commander" }],
        }),
      ]);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("commander");

      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-bad-section");
      expect(entry).toBeUndefined();
    });

    it("invalidates a checked entry when the list changes, and not on an identical re-push", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-1");

      // Judge ticks a card and marks the entry checked.
      const cards = await repos.deckCheck.listCardsForEntry(entry!.id);
      const tickRes = await judgeApp.fetch(
        req(
          "PUT",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${cards[0]!.id}`,
          { copyIndex: 0, found: true },
        ),
      );
      expect(tickRes.status).toBe(204);
      const verdictRes = await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/verdict`, {
          checkStatus: "checked",
          notes: "clean",
        }),
      );
      expect(verdictRes.status).toBe(200);

      // Identical re-push: check state untouched.
      await push([entryPayload()]);
      let reloaded = await repos.deckCheck.getEntryByExternalId(eventId, "entry-1");
      expect(reloaded?.checkStatus).toBe("checked");
      expect(reloaded?.checkedBy).toBe(JUDGE_ID);

      // Changed list: reverts to unchecked, ticks reset, change summary stored.
      await push([
        entryPayload({
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 2, section: "main" }],
        }),
      ]);
      reloaded = await repos.deckCheck.getEntryByExternalId(eventId, "entry-1");
      expect(reloaded?.checkStatus).toBe("unchecked");
      expect(reloaded?.checkedBy).toBeNull();
      expect(reloaded?.checkedAt).toBeNull();
      expect(reloaded?.changeSummary?.changed).toHaveLength(1);
      const newCards = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(newCards.every((card) => !card.foundCopies.some(Boolean))).toBe(true);

      // A tick against one of the replaced (now deleted) card rows is a 409.
      const staleTick = await judgeApp.fetch(
        req(
          "PUT",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${cards[0]!.id}`,
          { copyIndex: 0, found: true },
        ),
      );
      expect(staleTick.status).toBe(409);
    });

    it("withdraws via the explicit flag and restores on a flagless re-push", async () => {
      await push([entryPayload({ externalId: "entry-2", withdrawn: true })]);
      let entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-2");
      expect(entry?.withdrawnAt).not.toBeNull();

      // The other entry was absent from that push and is untouched.
      expect(await repos.deckCheck.getEntryByExternalId(eventId, "entry-1")).toBeDefined();

      await push([entryPayload({ externalId: "entry-2" })]);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-2");
      expect(entry?.withdrawnAt).toBeNull();
    });

    it("stores sharing consent, defaults to allowed, and keeps it on a flagless re-push", async () => {
      // Omitted flags on a fresh entry fall back to the column default (true).
      await push([entryPayload({ externalId: "entry-consent" })]);
      let entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-consent");
      expect(entry?.allowNameSharing).toBe(true);
      expect(entry?.allowRiotIdSharing).toBe(true);

      // An explicit refusal lands.
      await push([
        entryPayload({
          externalId: "entry-consent",
          allowNameSharing: false,
          allowRiotIdSharing: false,
        }),
      ]);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-consent");
      expect(entry?.allowNameSharing).toBe(false);
      expect(entry?.allowRiotIdSharing).toBe(false);

      // A flagless re-push is no statement: the stored refusal survives.
      await push([entryPayload({ externalId: "entry-consent" })]);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-consent");
      expect(entry?.allowNameSharing).toBe(false);
      expect(entry?.allowRiotIdSharing).toBe(false);
    });

    it("rejects pushes to an archived event with 409", async () => {
      const archive = await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, { status: "archived" }),
      );
      expect(archive.status).toBe(200);

      const res = await push([]);
      expect(res.status).toBe(409);

      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, { status: "active" }),
      );
    });
  });

  describe("checker payload", () => {
    it("returns PII, violations, and stats to a judge", async () => {
      // Give the event a format so the deck-rules run; the 2-card list is
      // nowhere near a legal constructed deck.
      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          format: "constructed",
          allowedSets: ["OGN"],
        }),
      );
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-1");

      const res = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`),
      );
      expect(res.status).toBe(200);
      const detail = (await res.json()) as {
        entry: { playerEmail: string | null };
        violations: { code: string }[];
        typeCounts: { cardType: string; count: number }[];
      };
      expect(detail.entry.playerEmail).toBe("player@example.com");
      expect(detail.violations.length).toBeGreaterThan(0);
      // The only card is from OGS while only OGN is allowed.
      expect(detail.violations.some((violation) => violation.code === "out-of-allowed-sets")).toBe(
        true,
      );
      expect(detail.typeCounts.some((count) => count.cardType === "unit")).toBe(true);

      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          format: null,
          allowedSets: null,
        }),
      );
    });

    it("re-resolves unmatched lines once the card exists in the catalog", async () => {
      const inserted = await db
        .insertInto("cards")
        .values({
          slug: "dc-late-addition",
          name: "Totally Unknown Card",
          type: "unit",
          might: null,
          energy: 1,
          power: null,
          mightBonus: null,
          keywords: [],
          tags: [],
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      try {
        const res = await judgeApp.fetch(
          req("POST", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/re-resolve`),
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { updatedLines: number };
        expect(body.updatedLines).toBeGreaterThanOrEqual(1);

        const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
        const cards = await repos.deckCheck.listCardsForEntry(entry!.id);
        const lateCard = cards.find((card) => card.rawName === "Totally Unknown Card");
        expect(lateCard?.matchStatus).toBe("matched");
        expect(lateCard?.resolvedCardId).toBe(inserted.id);
        // Check state and the content hash were untouched by re-resolution.
        expect(entry?.checkStatus).toBe("unchecked");
      } finally {
        await db
          .updateTable("deckCheckEntryCards")
          .set({ resolvedCardId: null, resolvedPrintingId: null, matchStatus: "unmatched" })
          .where("resolvedCardId", "=", inserted.id)
          .execute();
        await db.deleteFrom("cards").where("id", "=", inserted.id).execute();
      }
    });
  });

  describe("on-site repair", () => {
    it("edits player details, adds a card, and removes single copies", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-2");
      const hashBefore = entry!.contentHash;

      const patch = await judgeApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`, {
          playerName: "Corrected Player",
          riotId: "Player#EUW",
          allowNameSharing: false,
        }),
      );
      expect(patch.status).toBe(200);
      const patched = (await patch.json()) as {
        entry: {
          playerName: string;
          riotId: string | null;
          allowNameSharing: boolean;
          allowRiotIdSharing: boolean;
        };
      };
      expect(patched.entry.playerName).toBe("Corrected Player");
      expect(patched.entry.riotId).toBe("Player#EUW");
      // The judge recorded a refusal for the name; the untouched flag keeps its default.
      expect(patched.entry.allowNameSharing).toBe(false);
      expect(patched.entry.allowRiotIdSharing).toBe(true);

      const add = await judgeApp.fetch(
        req("POST", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards`, {
          name: "Ambiguous Twin",
          quantity: 2,
          section: "sideboard",
        }),
      );
      expect(add.status).toBe(200);
      const afterAdd = await repos.deckCheck.getEntryByExternalId(eventId, "entry-2");
      // Card edits recompute the hash so provider re-pushes diff correctly.
      expect(afterAdd!.contentHash).not.toBe(hashBefore);

      const cards = await repos.deckCheck.listCardsForEntry(entry!.id);
      const added = cards.find((card) => card.zone === "sideboard");
      expect(added?.quantity).toBe(2);
      expect(added?.matchStatus).toBe("ambiguous");

      const removeOne = await judgeApp.fetch(
        req(
          "DELETE",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${added!.id}/copies/0`,
        ),
      );
      expect(removeOne.status).toBe(204);
      let reloaded = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(reloaded.find((card) => card.id === added!.id)?.quantity).toBe(1);

      const removeLast = await judgeApp.fetch(
        req(
          "DELETE",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${added!.id}/copies/0`,
        ),
      );
      expect(removeLast.status).toBe(204);
      reloaded = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(reloaded.find((card) => card.id === added!.id)).toBeUndefined();
    });

    it("splices the removed copy's tick, keeping the other cells", async () => {
      // Dedicated entry so earlier re-push tests can't change the quantity.
      await push([entryPayload({ externalId: "entry-splice", playerName: "S. Plice" })]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-splice");
      const cards = await repos.deckCheck.listCardsForEntry(entry!.id);
      const line = cards[0]!;
      expect(line.quantity).toBe(3);

      // Tick copies 1 and 3 (indexes 0 and 2), then remove copy 1.
      await repos.deckCheck.setCardCopyFound(entry!.id, line.id, 0, true);
      await repos.deckCheck.setCardCopyFound(entry!.id, line.id, 2, true);
      const removed = await repos.deckCheck.deleteEntryCardCopy(entry!.id, line.id, 0);
      expect(removed).toBe(true);

      const reloaded = await repos.deckCheck.listCardsForEntry(entry!.id);
      const after = reloaded.find((card) => card.id === line.id);
      expect(after?.quantity).toBe(line.quantity - 1);
      // The remaining ticks shift down with their copies: [t,f,t] minus copy 1 = [f,t].
      expect(after?.foundCopies).toEqual([false, true]);
    });
  });

  describe("manual entry", () => {
    /**
     * Builds a manual-entry create request body.
     * @returns A request body for POST /checks/:eventId/entries.
     */
    function manualBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        playerName: "M. Anual",
        playerEmail: "manual@example.com",
        cards: [
          { name: CARD_FURY_UNIT.name, quantity: 2, section: "main" },
          { name: "Totally Unknown Card", quantity: 1, section: "sideboard" },
        ],
        ...overrides,
      };
    }

    it("returns 403 for a plain member", async () => {
      const res = await memberApp.fetch(
        req("POST", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries`, manualBody()),
      );
      expect(res.status).toBe(403);
    });

    it("lets a judge add a player + decklist, stamped as a manual entry", async () => {
      const res = await judgeApp.fetch(
        req("POST", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries`, manualBody()),
      );
      expect(res.status).toBe(201);
      const detail = (await res.json()) as {
        entry: { id: string; source: string; externalId: string; playerName: string };
        cards: { matchStatus: string; zone: string }[];
      };
      expect(detail.entry.source).toBe("manual");
      expect(detail.entry.externalId.startsWith("manual:")).toBe(true);
      expect(detail.entry.playerName).toBe("M. Anual");
      // Cards resolve against the catalog exactly as a push would.
      expect(detail.cards.map((card) => card.matchStatus)).toEqual(["matched", "unmatched"]);

      // It shows up in the event list as manual, while pushed entries read as api.
      const list = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`),
      );
      const { entries } = (await list.json()) as {
        entries: { id: string; source: string }[];
      };
      expect(entries.find((entry) => entry.id === detail.entry.id)?.source).toBe("manual");
      expect(entries.some((entry) => entry.source === "api")).toBe(true);
    });

    it("rejects an unknown section with 422", async () => {
      const res = await judgeApp.fetch(
        req("POST", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries`, {
          playerName: "Bad Section",
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "commander" }],
        }),
      );
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: string }).error).toContain("commander");
    });

    it("rejects adding to an archived event with 409", async () => {
      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, { status: "archived" }),
      );
      const res = await judgeApp.fetch(
        req("POST", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries`, manualBody()),
      );
      expect(res.status).toBe(409);
      // Restore so later tests see an active event.
      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, { status: "active" }),
      );
    });
  });

  describe("keys and cascades", () => {
    it("renames a key", async () => {
      const keys = await repos.deckCheck.listKeysForGroup(groupId);
      const active = keys.find((key) => key.revokedAt === null);
      const res = await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/deck-check-keys/${active!.id}`, {
          label: "renamed",
        }),
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as { label: string }).label).toBe("renamed");
    });

    it("revoked keys stop authenticating", async () => {
      const keys = await repos.deckCheck.listKeysForGroup(groupId);
      const active = keys.find((key) => key.revokedAt === null);
      const revoke = await adminApp.fetch(
        req("DELETE", `/friend-groups/${GROUP_SLUG}/deck-check-keys/${active!.id}`),
      );
      expect(revoke.status).toBe(204);

      const res = await push([]);
      expect(res.status).toBe(401);
    });

    it("deleting the event cascades to entries and cards", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-1");

      const del = await adminApp.fetch(
        req("DELETE", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`),
      );
      expect(del.status).toBe(204);

      expect(await repos.deckCheck.getEvent(groupId, eventId)).toBeUndefined();
      const orphanedCards = await db
        .selectFrom("deckCheckEntryCards")
        .selectAll()
        .where("entryId", "=", entry!.id)
        .execute();
      expect(orphanedCards).toHaveLength(0);
    });
  });
});
