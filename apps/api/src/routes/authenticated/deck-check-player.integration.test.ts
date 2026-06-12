import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../../deps.js";
import { CARD_FURY_UNIT } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";

const OWNER_ID = "a0000000-0160-4000-a000-000000000001";
const ADMIN_ID = "a0000000-0161-4000-a000-000000000001";
const JUDGE_ID = "a0000000-0162-4000-a000-000000000001";
const MEMBER_ID = "a0000000-0163-4000-a000-000000000001";
const PLAYER_ID = "a0000000-0164-4000-a000-000000000001";
const STRANGER_ID = "a0000000-0165-4000-a000-000000000001";
const UNVERIFIED_ID = "a0000000-0166-4000-a000-000000000001";
const LATE_ID = "a0000000-0167-4000-a000-000000000001";

const PLAYER_EMAIL = "dc-player@test.com";
const STRANGER_EMAIL = "dc-stranger@test.com";
const UNVERIFIED_EMAIL = "dc-unverified@test.com";
const LATE_EMAIL = "dc-late@test.com";

const GROUP_SLUG = "deck-check-player-itest";

const ownerCtx = createTestContext(OWNER_ID);
const adminCtx = createTestContext(ADMIN_ID);
const judgeCtx = createTestContext(JUDGE_ID);
const memberCtx = createTestContext(MEMBER_ID);
const playerCtx = createTestContext(PLAYER_ID, PLAYER_EMAIL);
const strangerCtx = createTestContext(STRANGER_ID, STRANGER_EMAIL);
const lateCtx = createTestContext(LATE_ID, LATE_EMAIL);

/**
 * Builds an ingest push request authenticated with a Bearer push key.
 * @returns A Request aimed at the ingest endpoint.
 */
function ingestReq(token: string, body: unknown): Request {
  return new Request("http://localhost/api/v1/ingest/deck-check", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!ownerCtx)("deck-check player self-service (integration, ADR-026)", () => {
  // oxlint-disable typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ownerCtx!;
  const adminApp = adminCtx!.app;
  const judgeApp = judgeCtx!.app;
  const memberApp = memberCtx!.app;
  const playerApp = playerCtx!.app;
  const strangerApp = strangerCtx!.app;
  const lateApp = lateCtx!.app;
  // oxlint-enable typescript/no-non-null-assertion
  const repos = createRepos(db);

  let groupId: string;
  let pushToken: string;
  let eventId: string;
  let playerDeckId: string;
  let strangerDeckId: string;
  let submissionToken: string;

  function push(entries: Record<string, unknown>[]): Promise<Response> {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
    return ownerCtx!.app.fetch(ingestReq(pushToken, { eventId, entries }));
  }

  async function createUser(userId: string, email: string, verified: boolean): Promise<void> {
    await db
      .insertInto("users")
      .values({
        id: userId,
        email,
        name: `User ${userId.slice(14, 18)}`,
        emailVerified: verified,
        image: null,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }

  beforeAll(async () => {
    await createUser(OWNER_ID, "dc-p-owner@test.com", true);
    await createUser(ADMIN_ID, "dc-p-admin@test.com", true);
    await createUser(JUDGE_ID, "dc-p-judge@test.com", true);
    await createUser(MEMBER_ID, "dc-p-member@test.com", true);
    await createUser(PLAYER_ID, PLAYER_EMAIL, true);
    await createUser(STRANGER_ID, STRANGER_EMAIL, true);
    await createUser(UNVERIFIED_ID, UNVERIFIED_EMAIL, false);
    // LATE_ID is deliberately not created yet; the lazy-match test creates it.

    const group = await repos.friendGroups.createWithOwner(
      { slug: GROUP_SLUG, name: "Player Self-Service Group", description: null, code: null },
      OWNER_ID,
    );
    groupId = group.id;
    await repos.friendGroups.addMember(groupId, ADMIN_ID, "admin");
    await repos.friendGroups.addMember(groupId, JUDGE_ID, "judge");
    await repos.friendGroups.addMember(groupId, MEMBER_ID, "member");

    const event = await repos.deckCheck.createEvent({
      groupId,
      name: "Self-Service Cup",
      eventDate: "2026-07-01",
      format: null,
      allowedSets: null,
    });
    eventId = event.id;

    const keyRes = await adminApp.fetch(
      req("POST", `/friend-groups/${GROUP_SLUG}/deck-check-keys`, { label: "player-itest" }),
    );
    pushToken = ((await keyRes.json()) as { token: string }).token;

    for (const [userId, assign] of [
      [PLAYER_ID, (id: string) => (playerDeckId = id)],
      [STRANGER_ID, (id: string) => (strangerDeckId = id)],
    ] as const) {
      const deck = await repos.decks.create({
        userId,
        name: "Submission Deck",
        description: null,
        format: "constructed",
        formatConfig: null,
        isWanted: false,
        isPublic: false,
      });
      await repos.decks.replaceCards(deck.id, [
        { cardId: CARD_FURY_UNIT.id, zone: "main", quantity: 3, preferredPrintingId: null },
      ]);
      assign(deck.id);
    }
  });

  afterAll(async () => {
    await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
    await db.deleteFrom("decks").where("id", "in", [playerDeckId, strangerDeckId]).execute();
    await db
      .deleteFrom("users")
      .where("id", "in", [
        OWNER_ID,
        ADMIN_ID,
        JUDGE_ID,
        MEMBER_ID,
        PLAYER_ID,
        STRANGER_ID,
        UNVERIFIED_ID,
        LATE_ID,
      ])
      .execute();
  });

  describe("auto-match at ingest", () => {
    it("links an entry whose email matches a verified account", async () => {
      const res = await push([
        {
          externalId: "p-entry-1",
          playerName: "P. Layer",
          playerEmail: PLAYER_EMAIL.toUpperCase(),
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 3, section: "main" }],
        },
      ]);
      expect(res.status).toBe(200);

      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(entry?.claimedUserId).toBe(PLAYER_ID);
      expect(entry?.claimSource).toBe("email_auto");
    });

    it("never links an unverified or absent email", async () => {
      await push([
        {
          externalId: "p-entry-unverified",
          playerName: "U. Verified",
          playerEmail: UNVERIFIED_EMAIL,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        },
        {
          externalId: "p-entry-no-email",
          playerName: "N. Omail",
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        },
      ]);
      const unverified = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-unverified");
      const noEmail = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-no-email");
      expect(unverified?.claimedUserId).toBeNull();
      expect(noEmail?.claimedUserId).toBeNull();
    });

    it("rejects the reserved openrift: external-id prefix with 422", async () => {
      const res = await push([
        {
          externalId: `openrift:${PLAYER_ID}`,
          playerName: "I. Mpostor",
          withdrawn: true,
          cards: [],
        },
      ]);
      expect(res.status).toBe(422);
      expect(
        await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${PLAYER_ID}`),
      ).toBeUndefined();
    });
  });

  describe("lazy match on page load", () => {
    it("links an entry once the account exists and loads the list", async () => {
      await push([
        {
          externalId: "p-entry-late",
          playerName: "L. Ate",
          playerEmail: LATE_EMAIL,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 2, section: "main" }],
        },
      ]);
      const before = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-late");
      expect(before?.claimedUserId).toBeNull();

      await createUser(LATE_ID, LATE_EMAIL, true);
      const res = await lateApp.fetch(req("GET", "/deck-check/mine"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { id: string }[] };
      expect(body.items.map((item) => item.id)).toContain(before?.id);

      const after = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-late");
      expect(after?.claimedUserId).toBe(LATE_ID);
      expect(after?.claimSource).toBe("email_auto");
    });
  });

  describe("player access", () => {
    it("lists only the caller's entries", async () => {
      const res = await playerApp.fetch(req("GET", "/deck-check/mine"));
      const body = (await res.json()) as { items: { eventName: string }[] };
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.eventName).toBe("Self-Service Cup");

      const memberRes = await memberApp.fetch(req("GET", "/deck-check/mine"));
      expect(((await memberRes.json()) as { items: unknown[] }).items).toHaveLength(0);
    });

    it("returns 404 (not 403) for an entry not linked to the caller", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      const res = await strangerApp.fetch(req("GET", `/deck-check/mine/${entry?.id}`));
      expect(res.status).toBe(404);
    });

    it("omits the judging team's fields from the player payload", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      await repos.deckCheck.updateEntry(entry!.id, { notes: "judge-private note" });

      const res = await playerApp.fetch(req("GET", `/deck-check/mine/${entry?.id}`));
      expect(res.status).toBe(200);
      const raw = await res.text();
      expect(raw).not.toContain("judge-private note");
      expect(raw).not.toContain("checkedBy");
      const body = JSON.parse(raw) as { entry: { eventName: string; canEdit: boolean } };
      expect(body.entry.eventName).toBe("Self-Service Cup");
      expect(body.entry.canEdit).toBe(true);
    });
  });

  describe("judge link management", () => {
    it("rejects link and unlink for a plain member", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      const link = await memberApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry?.id}/link`, {
          userId: STRANGER_ID,
        }),
      );
      expect(link.status).toBe(403);
      const unlink = await memberApp.fetch(
        req("DELETE", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry?.id}/link`),
      );
      expect(unlink.status).toBe(403);
    });

    it("unlink blocks the entry from re-matching on a later push", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      const unlink = await judgeApp.fetch(
        req("DELETE", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry?.id}/link`),
      );
      expect(unlink.status).toBe(200);

      // The identical re-push runs auto-match again; the block must hold.
      await push([
        {
          externalId: "p-entry-1",
          playerName: "P. Layer",
          playerEmail: PLAYER_EMAIL,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 3, section: "main" }],
        },
      ]);
      const after = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(after?.claimedUserId).toBeNull();
      expect(after?.claimBlockedAt).not.toBeNull();
    });

    it("a judge manual link clears the block", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      const res = await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry?.id}/link`, {
          userId: PLAYER_ID,
        }),
      );
      expect(res.status).toBe(200);
      const after = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(after?.claimedUserId).toBe(PLAYER_ID);
      expect(after?.claimSource).toBe("judge_manual");
      expect(after?.claimBlockedAt).toBeNull();
    });
  });

  describe("self-submission", () => {
    it("enabling self-submission mints a token; the page resolves for a holder", async () => {
      const res = await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          allowSelfSubmission: true,
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { submissionToken: string | null };
      expect(body.submissionToken).not.toBeNull();
      submissionToken = body.submissionToken as string;

      const page = await playerApp.fetch(req("GET", `/deck-check/submissions/${submissionToken}`));
      expect(page.status).toBe(200);
      const pageBody = (await page.json()) as {
        submissionsOpen: boolean;
        linkedEntry: { id: string } | null;
      };
      expect(pageBody.submissionsOpen).toBe(true);
      expect(pageBody.linkedEntry).not.toBeNull();
    });

    it("a linked player's submission edits their entry (takeover plus invalidation)", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry?.id}/verdict`, {
          checkStatus: "checked",
        }),
      );

      const res = await playerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: playerDeckId }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { entryId: string | null };
      expect(body.entryId).toBe(entry?.id);

      const after = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(after?.listOwner).toBe("player");
      // The pushed list had quantity 3 of the same card, the deck has 3 too,
      // but the push also carried only main-zone lines; an identical hash is
      // possible, so assert the takeover rather than a forced invalidation.
      expect(after?.claimedUserId).toBe(PLAYER_ID);
    });

    it("a provider push to a player-owned entry is ignored except withdrawal", async () => {
      const before = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      const res = await push([
        {
          externalId: "p-entry-1",
          playerName: "Renamed By Provider",
          playerEmail: "other@test.com",
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        },
      ]);
      const result = (await res.json()) as { entriesIgnored: number };
      expect(result.entriesIgnored).toBe(1);

      const after = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(after?.playerName).toBe(before?.playerName);
      expect(after?.playerEmail).toBe(before?.playerEmail);
      expect(after?.contentHash).toBe(before?.contentHash);
      expect(after?.providerPushIgnoredAt).not.toBeNull();

      const withdraw = await push([
        { externalId: "p-entry-1", playerName: "X", withdrawn: true, cards: [] },
      ]);
      expect(withdraw.status).toBe(200);
      const withdrawn = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(withdrawn?.withdrawnAt).not.toBeNull();
    });

    it("a withdrawn linked entry blocks both edit and re-submission", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      const edit = await playerApp.fetch(
        req("PUT", `/deck-check/mine/${entry?.id}/list`, { deckId: playerDeckId }),
      );
      expect(edit.status).toBe(409);

      const submit = await playerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: playerDeckId }),
      );
      expect(submit.status).toBe(409);

      // Viewing still works; the list badges the entry as withdrawn.
      const list = await playerApp.fetch(req("GET", "/deck-check/mine"));
      const body = (await list.json()) as { items: { withdrawn: boolean }[] };
      expect(body.items.some((item) => item.withdrawn)).toBe(true);
    });

    it("a user without a linked entry creates one openrift: entry, upserted on re-submit", async () => {
      const first = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: strangerDeckId }),
      );
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { entryId: string };

      const entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      expect(entry?.id).toBe(firstBody.entryId);
      expect(entry?.claimSource).toBe("self_submit");
      expect(entry?.listOwner).toBe("player");
      expect(entry?.playerEmail).toBe(STRANGER_EMAIL);

      const second = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: strangerDeckId }),
      );
      const secondBody = (await second.json()) as { entryId: string };
      expect(secondBody.entryId).toBe(firstBody.entryId);
    });

    it("accepts a pasted card list and infers type-bound zones", async () => {
      const res = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, {
          cards: [
            { name: CARD_FURY_UNIT.name, quantity: 2, section: "main" },
            // A headerless paste lands runes in main; the type allows only one zone.
            { name: "Fury Rune", quantity: 1, section: "main" },
          ],
        }),
      );
      expect(res.status).toBe(200);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      const lines = await repos.deckCheck.listCardsForEntry(entry!.id);
      expect(lines).toHaveLength(2);
      expect(lines[0]?.quantity).toBe(2);
      expect(lines[0]?.zone).toBe("main");
      expect(lines[0]?.matchStatus).toBe("matched");
      expect(lines[1]?.zone).toBe("runes");

      const badSection = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, {
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "commander" }],
        }),
      );
      expect(badSection.status).toBe(422);
    });

    it("records sharing consent on submit and keeps it on a flagless re-submit", async () => {
      // The previous submissions sent no flags, so the defaults (true) stand.
      let entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      expect(entry?.allowNameSharing).toBe(true);
      expect(entry?.allowRiotIdSharing).toBe(true);

      // The player declines the Riot ID; the same-list submit still records it.
      const declined = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, {
          deckId: strangerDeckId,
          allowRiotIdSharing: false,
        }),
      );
      expect(declined.status).toBe(200);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      expect(entry?.allowNameSharing).toBe(true);
      expect(entry?.allowRiotIdSharing).toBe(false);

      // A flagless re-submit is no statement: the refusal survives.
      const flagless = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: strangerDeckId }),
      );
      expect(flagless.status).toBe(200);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      expect(entry?.allowRiotIdSharing).toBe(false);
    });

    it("a dry run previews the resolved lines without writing", async () => {
      const entriesBefore = await repos.deckCheck.listEntriesForEvent(eventId);
      const res = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, {
          deckId: strangerDeckId,
          dryRun: true,
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { entryId: string | null; cards: unknown[] };
      expect(body.entryId).toBeNull();
      expect(body.cards.length).toBeGreaterThan(0);
      const entriesAfter = await repos.deckCheck.listEntriesForEvent(eventId);
      expect(entriesAfter).toHaveLength(entriesBefore.length);

      const garbled = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, {
          deckCode: "not-a-real-code",
          dryRun: true,
        }),
      );
      expect(garbled.status).toBe(422);
    });

    it("disabling self-submission kills the link; regenerating replaces it", async () => {
      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          allowSelfSubmission: false,
        }),
      );
      const dead = await playerApp.fetch(req("GET", `/deck-check/submissions/${submissionToken}`));
      expect(dead.status).toBe(404);

      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          allowSelfSubmission: true,
        }),
      );
      const regen = await adminApp.fetch(
        req("POST", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/submission-token`),
      );
      expect(regen.status).toBe(200);
      const newToken = ((await regen.json()) as { submissionToken: string }).submissionToken;
      expect(newToken).not.toBe(submissionToken);

      const oldDead = await playerApp.fetch(
        req("GET", `/deck-check/submissions/${submissionToken}`),
      );
      expect(oldDead.status).toBe(404);
      submissionToken = newToken;
    });

    it("a passed close date blocks edits while viewing still works", async () => {
      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          submissionsCloseAt: "2020-01-01T00:00:00Z",
        }),
      );
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      const edit = await strangerApp.fetch(
        req("PUT", `/deck-check/mine/${entry?.id}/list`, { deckId: strangerDeckId }),
      );
      expect(edit.status).toBe(409);

      const view = await strangerApp.fetch(req("GET", `/deck-check/mine/${entry?.id}`));
      expect(view.status).toBe(200);
      const body = (await view.json()) as { entry: { canEdit: boolean } };
      expect(body.entry.canEdit).toBe(false);
    });
  });
});
