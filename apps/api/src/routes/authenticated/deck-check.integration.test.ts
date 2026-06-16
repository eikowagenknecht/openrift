import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../../deps.js";
import { CARD_FURY_RUNE, CARD_FURY_UNIT } from "../../test/fixtures/constants.js";
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

      // Judge approves the list, ticks a card, and marks the entry checked.
      const approveRes = await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/state`, {
          state: "approved",
        }),
      );
      expect(approveRes.status).toBe(200);
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
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/state`, {
          state: "checked",
          reviewOutcome: "ok",
          notes: "clean",
        }),
      );
      expect(verdictRes.status).toBe(200);

      // Identical re-push: check state untouched.
      await push([entryPayload()]);
      let reloaded = await repos.deckCheck.getEntryByExternalId(eventId, "entry-1");
      expect(reloaded?.state).toBe("checked");
      expect(reloaded?.reviewOutcome).toBe("ok");
      expect(reloaded?.checkedBy).toBe(JUDGE_ID);

      // Changed list: back to submitted, ticks reset, change summary stored.
      await push([
        entryPayload({
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 2, section: "main" }],
        }),
      ]);
      reloaded = await repos.deckCheck.getEntryByExternalId(eventId, "entry-1");
      expect(reloaded?.state).toBe("submitted");
      expect(reloaded?.reviewOutcome).toBeNull();
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

    it("withdraws via the explicit flag and restores to submitted on a flagless re-push", async () => {
      await push([entryPayload({ externalId: "entry-2", withdrawn: true })]);
      let entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-2");
      expect(entry?.state).toBe("withdrawn");
      expect(entry?.withdrawnAt).not.toBeNull();

      // The other entry was absent from that push and is untouched.
      expect(await repos.deckCheck.getEntryByExternalId(eventId, "entry-1")).toBeDefined();

      await push([entryPayload({ externalId: "entry-2" })]);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-2");
      expect(entry?.state).toBe("submitted");
      expect(entry?.withdrawnAt).toBeNull();
    });

    it("stores sharing consent, defaults to allowed, and keeps it on a flagless re-push", async () => {
      // Omitted flags on a fresh entry fall back to the column default (true).
      await push([entryPayload({ externalId: "entry-consent" })]);
      let entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-consent");
      expect(entry?.allowDeckPublishing).toBe(true);
      expect(entry?.allowNameSharing).toBe(true);
      expect(entry?.allowRiotIdSharing).toBe(true);

      // An explicit refusal lands.
      await push([
        entryPayload({
          externalId: "entry-consent",
          allowDeckPublishing: false,
          allowNameSharing: false,
          allowRiotIdSharing: false,
        }),
      ]);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-consent");
      expect(entry?.allowDeckPublishing).toBe(false);
      expect(entry?.allowNameSharing).toBe(false);
      expect(entry?.allowRiotIdSharing).toBe(false);

      // A flagless re-push is no statement: the stored refusal survives.
      await push([entryPayload({ externalId: "entry-consent" })]);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-consent");
      expect(entry?.allowDeckPublishing).toBe(false);
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

    it("exposes the claim token only while the entry can still be claimed", async () => {
      await push([
        entryPayload({ externalId: "entry-claim-token", playerEmail: "claim-token@example.com" }),
      ]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-claim-token");

      // Unclaimed and unblocked: the judge can copy the link, so the token ships.
      const open = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`),
      );
      const openBody = (await open.json()) as { entry: { claimToken: string | null } };
      expect(openBody.entry.claimToken).toBeTruthy();
      expect(openBody.entry.claimToken).toBe(entry!.claimToken);

      // Once linked, a claim link would be a no-op, so the token is withheld.
      await repos.deckCheck.linkEntryIfUnclaimed(entry!.id, MEMBER_ID, "judge_manual");
      const linked = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`),
      );
      const linkedBody = (await linked.json()) as { entry: { claimToken: string | null } };
      expect(linkedBody.entry.claimToken).toBeNull();

      // A judge unlink blocks re-claiming, so the token stays withheld.
      await repos.deckCheck.unlinkEntry(entry!.id);
      const blocked = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`),
      );
      const blockedBody = (await blocked.json()) as {
        entry: { claimToken: string | null; claimBlocked: boolean };
      };
      expect(blockedBody.entry.claimBlocked).toBe(true);
      expect(blockedBody.entry.claimToken).toBeNull();
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
        // Lifecycle state and the content hash were untouched by re-resolution.
        expect(entry?.state).toBe("submitted");
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
          allowDeckPublishing: false,
          allowNameSharing: false,
        }),
      );
      expect(patch.status).toBe(200);
      const patched = (await patch.json()) as {
        entry: {
          playerName: string;
          riotId: string | null;
          allowDeckPublishing: boolean;
          allowNameSharing: boolean;
          allowRiotIdSharing: boolean;
        };
      };
      expect(patched.entry.playerName).toBe("Corrected Player");
      expect(patched.entry.riotId).toBe("Player#EUW");
      // The judge recorded a refusal for publishing and the name; the untouched flag keeps its default.
      expect(patched.entry.allowDeckPublishing).toBe(false);
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

    it("reassigns a mis-zoned card via the fix endpoint, mapping section to zone", async () => {
      // A provider that mislabels its sections lands the card in the wrong zone.
      await push([
        entryPayload({
          externalId: "entry-zone",
          playerName: "Z. One",
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        }),
      ]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-zone");
      const hashBefore = entry!.contentHash;
      const cardsBefore = await repos.deckCheck.listCardsForEntry(entry!.id);
      const card = cardsBefore[0]!;
      expect(card.zone).toBe("main");

      // Moving the card to the right zone updates both the zone and the stored
      // section, and recomputes the hash so a re-push diffs correctly.
      const move = await judgeApp.fetch(
        req(
          "PATCH",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${card.id}`,
          { name: card.rawName, section: "sideboard" },
        ),
      );
      expect(move.status).toBe(200);
      let reloadedCards = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(reloadedCards[0]!.zone).toBe("sideboard");
      expect(reloadedCards[0]!.section).toBe("sideboard");
      const movedEntry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-zone");
      expect(movedEntry!.contentHash).not.toBe(hashBefore);

      // A name-only fix (section omitted) leaves the zone and section untouched.
      const nameOnly = await judgeApp.fetch(
        req(
          "PATCH",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${card.id}`,
          { name: CARD_FURY_UNIT.name },
        ),
      );
      expect(nameOnly.status).toBe(200);
      reloadedCards = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(reloadedCards[0]!.zone).toBe("sideboard");
      expect(reloadedCards[0]!.section).toBe("sideboard");

      // An unknown section is rejected, exactly like the add path.
      const bad = await judgeApp.fetch(
        req(
          "PATCH",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${card.id}`,
          { name: card.rawName, section: "commander" },
        ),
      );
      expect(bad.status).toBe(422);
    });

    it("splits a multi-copy line when moving some copies, merging into the target zone", async () => {
      await push([
        entryPayload({
          externalId: "entry-split",
          playerName: "S. Plit",
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 3, section: "main" }],
        }),
      ]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-split");
      const before = await repos.deckCheck.listCardsForEntry(entry!.id);
      const cardId = before[0]!.id;
      expect(before[0]!.quantity).toBe(3);

      // Move 1 of 3 copies to the sideboard: the line splits, the rest stay.
      const split = await judgeApp.fetch(
        req(
          "PATCH",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${cardId}`,
          { name: CARD_FURY_UNIT.name, section: "sideboard", copies: 1 },
        ),
      );
      expect(split.status).toBe(200);
      const afterSplit = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(afterSplit.find((card) => card.zone === "main")?.quantity).toBe(2);
      const side = afterSplit.find((card) => card.zone === "sideboard");
      expect(side?.quantity).toBe(1);
      expect(side?.resolvedCardId).toBe(CARD_FURY_UNIT.id);

      // Moving another copy merges into the existing sideboard line, not a 2nd row.
      const mainCardId = afterSplit.find((card) => card.zone === "main")!.id;
      const merge = await judgeApp.fetch(
        req(
          "PATCH",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${mainCardId}`,
          { name: CARD_FURY_UNIT.name, section: "sideboard", copies: 1 },
        ),
      );
      expect(merge.status).toBe(200);
      const afterMerge = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(afterMerge.filter((card) => card.zone === "sideboard")).toHaveLength(1);
      expect(afterMerge.find((card) => card.zone === "sideboard")?.quantity).toBe(2);
      expect(afterMerge.find((card) => card.zone === "main")?.quantity).toBe(1);

      // Moving the rest (copies omitted) merges and deletes the now-empty main line.
      const lastMainId = afterMerge.find((card) => card.zone === "main")!.id;
      const moveRest = await judgeApp.fetch(
        req(
          "PATCH",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/cards/${lastMainId}`,
          { name: CARD_FURY_UNIT.name, section: "sideboard" },
        ),
      );
      expect(moveRest.status).toBe(200);
      const afterRest = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(afterRest).toHaveLength(1);
      expect(afterRest[0]!.zone).toBe("sideboard");
      expect(afterRest[0]!.quantity).toBe(3);
    });

    it("suggests and bulk-applies zone fixes only for the cards the judge confirms", async () => {
      // A provider that lumps everything into "main" lands a Rune and a Legend
      // in the wrong zone, while an ordinary Unit is correctly in main.
      await push([
        entryPayload({
          externalId: "entry-zonefix",
          playerName: "Z. Fix",
          cards: [
            { name: CARD_FURY_RUNE.name, quantity: 1, section: "main" },
            { name: CARD_FURY_UNIT.name, quantity: 1, section: "main" },
          ],
        }),
      ]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-zonefix");
      const hashBefore = entry!.contentHash;

      // The checker payload flags only the type-locked Rune, never the Unit.
      const detailRes = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`),
      );
      expect(detailRes.status).toBe(200);
      const detail = (await detailRes.json()) as {
        zoneSuggestions: { cardId: string; suggestedZone: string; currentZone: string }[];
      };
      expect(detail.zoneSuggestions).toHaveLength(1);
      const suggestion = detail.zoneSuggestions[0]!;
      expect(suggestion).toMatchObject({ currentZone: "main", suggestedZone: "runes" });

      // Applying the confirmed id moves the Rune and recomputes the hash.
      const apply = await judgeApp.fetch(
        req(
          "POST",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/zone-fixes`,
          {
            cardIds: [suggestion.cardId],
          },
        ),
      );
      expect(apply.status).toBe(200);
      const cards = await repos.deckCheck.listCardsForEntry(entry!.id);
      const rune = cards.find((card) => card.id === suggestion.cardId);
      expect(rune?.zone).toBe("runes");
      expect(rune?.section).toBe("runes");
      const applied = await repos.deckCheck.getEntryByExternalId(eventId, "entry-zonefix");
      expect(applied!.contentHash).not.toBe(hashBefore);

      // Nothing left to suggest, and a forged id can't move anything.
      const afterRes = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`),
      );
      const after = (await afterRes.json()) as { zoneSuggestions: unknown[] };
      expect(after.zoneSuggestions).toHaveLength(0);

      const unitCard = cards.find((card) => card.id !== suggestion.cardId)!;
      const forged = await judgeApp.fetch(
        req(
          "POST",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/zone-fixes`,
          {
            cardIds: [unitCard.id],
          },
        ),
      );
      expect(forged.status).toBe(200);
      const afterForge = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(afterForge.find((card) => card.id === unitCard.id)?.zone).toBe("main");
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

  describe("lifecycle transitions (ADR-027)", () => {
    /**
     * Issues a judge state transition for one entry.
     * @returns The route response.
     */
    function transition(entryId: string, body: Record<string, unknown>): Promise<Response> {
      return judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId}/state`, body),
      );
    }

    it("returns 403 for a plain member", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const res = await memberApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}/state`, {
          state: "approved",
        }),
      );
      expect(res.status).toBe(403);
    });

    it("approves a submitted entry, recording the judge and outcome", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const res = await transition(entry!.id, { state: "approved" });
      expect(res.status).toBe(200);

      const approved = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(approved?.state).toBe("approved");
      expect(approved?.reviewOutcome).toBe("ok");
      expect(approved?.approvedBy).toBe(JUDGE_ID);
      expect(approved?.approvedAt).not.toBeNull();
    });

    it("rejects approving an entry that is not submitted", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const res = await transition(entry!.id, { state: "approved" });
      expect(res.status).toBe(409);
    });

    it("revokes an approval back to submitted", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const res = await transition(entry!.id, { state: "submitted" });
      expect(res.status).toBe(200);

      const revoked = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(revoked?.state).toBe("submitted");
      expect(revoked?.reviewOutcome).toBeNull();
      expect(revoked?.approvedBy).toBeNull();
    });

    it("rejects handing an unclaimed entry to a player, but records an issue in place", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const unlock = await transition(entry!.id, { state: "editable" });
      expect(unlock.status).toBe(409);

      const mark = await transition(entry!.id, { state: "submitted", reviewOutcome: "issue" });
      expect(mark.status).toBe(200);
      const marked = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(marked?.state).toBe("submitted");
      expect(marked?.reviewOutcome).toBe("issue");
    });

    it("rejects checking a submitted entry that has not been approved", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const res = await transition(entry!.id, { state: "checked", reviewOutcome: "ok" });
      expect(res.status).toBe(409);
      const reloaded = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(reloaded?.state).toBe("submitted");
    });

    it("requires an outcome to mark an approved entry checked", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const approve = await transition(entry!.id, { state: "approved" });
      expect(approve.status).toBe(200);

      const missing = await transition(entry!.id, { state: "checked" });
      expect(missing.status).toBe(422);

      const issue = await transition(entry!.id, { state: "checked", reviewOutcome: "issue" });
      expect(issue.status).toBe(200);
      const checked = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(checked?.state).toBe("checked");
      expect(checked?.reviewOutcome).toBe("issue");
      expect(checked?.checkedBy).toBe(JUDGE_ID);
    });

    it("re-opens a checked entry to submitted", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const res = await transition(entry!.id, { state: "submitted" });
      expect(res.status).toBe(200);
      const reopened = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(reopened?.state).toBe("submitted");
      expect(reopened?.checkedBy).toBeNull();
      expect(reopened?.reviewOutcome).toBeNull();
    });

    it("withdraws an entry as a judge, clearing a pending unlock request", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      await repos.deckCheck.updateEntry(entry!.id, { unlockRequestedAt: new Date() });

      const res = await transition(entry!.id, { state: "withdrawn" });
      expect(res.status).toBe(200);

      const withdrawn = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(withdrawn?.state).toBe("withdrawn");
      expect(withdrawn?.withdrawnAt).not.toBeNull();
      expect(withdrawn?.unlockRequestedAt).toBeNull();
    });

    it("rejects transitions on a withdrawn entry except the restore to submitted", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(entry?.state).toBe("withdrawn");

      const approve = await transition(entry!.id, { state: "approved" });
      expect(approve.status).toBe(409);
      const rewithdraw = await transition(entry!.id, { state: "withdrawn" });
      expect(rewithdraw.status).toBe(409);

      const restore = await transition(entry!.id, { state: "submitted" });
      expect(restore.status).toBe(200);
      const restored = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(restored?.state).toBe("submitted");
      expect(restored?.withdrawnAt).toBeNull();
    });

    it("invalidates an approval when a changed list is pushed", async () => {
      await transition(
        (await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution"))!.id,
        { state: "approved" },
      );

      const res = await push([
        entryPayload({
          externalId: "entry-resolution",
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 9, section: "main" }],
        }),
      ]);
      const result = (await res.json()) as { checksInvalidated: number };
      expect(result.checksInvalidated).toBe(1);

      const reloaded = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      expect(reloaded?.state).toBe("submitted");
      expect(reloaded?.approvedBy).toBeNull();
      expect(reloaded?.changeSummary).not.toBeNull();
    });
  });

  describe("entry deletion", () => {
    it("returns 403 for a judge", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-1");
      const res = await judgeApp.fetch(
        req("DELETE", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`),
      );
      expect(res.status).toBe(403);
      expect(await repos.deckCheck.getEntryByExternalId(eventId, "entry-1")).toBeDefined();
    });

    it("lets an admin delete an entry, cascading to its cards", async () => {
      await push([entryPayload({ externalId: "entry-delete-me", playerName: "D. Ropout" })]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-delete-me");

      const res = await adminApp.fetch(
        req("DELETE", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`),
      );
      expect(res.status).toBe(204);

      expect(
        await repos.deckCheck.getEntryByExternalId(eventId, "entry-delete-me"),
      ).toBeUndefined();
      const orphanedCards = await db
        .selectFrom("deckCheckEntryCards")
        .selectAll()
        .where("entryId", "=", entry!.id)
        .execute();
      expect(orphanedCards).toHaveLength(0);

      const repeat = await adminApp.fetch(
        req("DELETE", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry!.id}`),
      );
      expect(repeat.status).toBe(404);
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
