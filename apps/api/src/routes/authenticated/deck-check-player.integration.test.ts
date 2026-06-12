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
const unverifiedCtx = createTestContext(UNVERIFIED_ID, UNVERIFIED_EMAIL);

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
  const unverifiedApp = unverifiedCtx!.app;
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
    // Most of this suite exercises the lenient lock mode (self-service
    // corrections until the deadline); the strict default gets its own block.
    await repos.deckCheck.updateEvent(groupId, eventId, { listLockMode: "at_deadline" });

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
      const body = JSON.parse(raw) as {
        entry: { eventName: string; state: string; canEdit: boolean };
      };
      expect(body.entry.eventName).toBe("Self-Service Cup");
      // A provider-fed entry arrives submitted, which is locked (ADR-027).
      expect(body.entry.state).toBe("submitted");
      expect(body.entry.canEdit).toBe(false);
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

    it("a token submission replaces a submitted entry, but a reviewed one is locked", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");

      // Submitted entry: the token link replaces and resubmits in one step.
      const res = await playerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: playerDeckId }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { entryId: string | null };
      expect(body.entryId).toBe(entry?.id);
      const after = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(after?.state).toBe("submitted");
      expect(after?.claimedUserId).toBe(PLAYER_ID);

      // Once a judge approved it, the token link is locked out.
      await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry?.id}/state`, {
          state: "approved",
        }),
      );
      const locked = await playerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: playerDeckId }),
      );
      expect(locked.status).toBe(409);

      // Revoke so later tests see a submitted entry again.
      await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entry?.id}/state`, {
          state: "submitted",
        }),
      );
    });

    it("a provider push always wins, replacing a player-submitted list", async () => {
      const before = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      const res = await push([
        {
          externalId: "p-entry-1",
          playerName: "Renamed By Provider",
          playerEmail: PLAYER_EMAIL,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        },
      ]);
      const result = (await res.json()) as { entriesUpdated: number; entriesIgnored: number };
      expect(result.entriesUpdated).toBe(1);
      // Deprecated field, always 0 since ADR-027 removed edit-takeover.
      expect(result.entriesIgnored).toBe(0);

      const after = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(after?.playerName).toBe("Renamed By Provider");
      expect(after?.contentHash).not.toBe(before?.contentHash);
      expect(after?.state).toBe("submitted");

      const withdraw = await push([
        { externalId: "p-entry-1", playerName: "X", withdrawn: true, cards: [] },
      ]);
      expect(withdraw.status).toBe(200);
      const withdrawn = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(withdrawn?.state).toBe("withdrawn");
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
      const body = (await list.json()) as { items: { state: string }[] };
      expect(body.items.some((item) => item.state === "withdrawn")).toBe(true);
    });

    it("a user without a linked entry creates one openrift: entry, upserted on re-submit", async () => {
      // The profile's free-text Riot ID is snapshotted onto the entry (ADR-028).
      await db
        .updateTable("users")
        .set({ riotId: "Stranger#EUW" })
        .where("id", "=", STRANGER_ID)
        .execute();

      const first = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: strangerDeckId }),
      );
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { entryId: string };

      const entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      expect(entry?.id).toBe(firstBody.entryId);
      expect(entry?.claimSource).toBe("self_submit");
      expect(entry?.state).toBe("submitted");
      expect(entry?.playerEmail).toBe(STRANGER_EMAIL);
      expect(entry?.riotId).toBe("Stranger#EUW");

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
      expect(entry?.allowDeckPublishing).toBe(true);
      expect(entry?.allowNameSharing).toBe(true);
      expect(entry?.allowRiotIdSharing).toBe(true);

      // The player declines publishing and the Riot ID; the same-list submit still records it.
      const declined = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, {
          deckId: strangerDeckId,
          allowDeckPublishing: false,
          allowRiotIdSharing: false,
        }),
      );
      expect(declined.status).toBe(200);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      expect(entry?.allowDeckPublishing).toBe(false);
      expect(entry?.allowNameSharing).toBe(true);
      expect(entry?.allowRiotIdSharing).toBe(false);

      // A flagless re-submit is no statement: the refusal survives.
      const flagless = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: strangerDeckId }),
      );
      expect(flagless.status).toBe(200);
      entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      expect(entry?.allowDeckPublishing).toBe(false);
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

  describe("player lifecycle (ADR-027)", () => {
    let entryId2: string;

    beforeAll(async () => {
      // Re-open the window the previous block closed.
      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          submissionsCloseAt: null,
        }),
      );
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      // oxlint-disable-next-line typescript/no-non-null-assertion -- created by the earlier suite
      entryId2 = entry!.id;
    });

    it("rejects a list edit while the entry is submitted", async () => {
      const res = await strangerApp.fetch(
        req("PUT", `/deck-check/mine/${entryId2}/list`, { deckId: strangerDeckId }),
      );
      expect(res.status).toBe(409);
    });

    it("unlocks a submitted entry self-service, then resubmits with a diff", async () => {
      const unlock = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      expect(unlock.status).toBe(200);
      const unlocked = (await unlock.json()) as { entry: { state: string; canEdit: boolean } };
      expect(unlocked.entry.state).toBe("editable");
      expect(unlocked.entry.canEdit).toBe(true);

      // Quantity 2 differs from the 3-copy deck the consent test resubmitted,
      // so the resubmission below has an actual diff against the baseline.
      const edit = await strangerApp.fetch(
        req("PUT", `/deck-check/mine/${entryId2}/list`, {
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 2, section: "main" }],
        }),
      );
      expect(edit.status).toBe(200);
      // The edit alone never changes the state.
      const midway = await repos.deckCheck.getEntry(eventId, entryId2);
      expect(midway?.state).toBe("editable");

      const submit = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/submit`));
      expect(submit.status).toBe(200);
      const submitted = await repos.deckCheck.getEntry(eventId, entryId2);
      expect(submitted?.state).toBe("submitted");
      // The judge sees what changed against the pre-unlock list.
      expect(submitted?.changeSummary).not.toBeNull();
    });

    it("an approved entry only files an unlock request, which a judge grants or declines", async () => {
      await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}/state`, {
          state: "approved",
        }),
      );

      // Direct unlock files a request instead.
      const request = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      expect(request.status).toBe(200);
      const requested = (await request.json()) as {
        entry: { state: string; unlockRequested: boolean };
      };
      expect(requested.entry.state).toBe("approved");
      expect(requested.entry.unlockRequested).toBe(true);

      // The player can cancel their own request.
      const cancel = await strangerApp.fetch(req("DELETE", `/deck-check/mine/${entryId2}/unlock`));
      expect(
        ((await cancel.json()) as { entry: { unlockRequested: boolean } }).entry.unlockRequested,
      ).toBe(false);

      // A judge can decline a request, keeping the approval.
      await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      const deny = await judgeApp.fetch(
        req(
          "DELETE",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}/unlock-request`,
        ),
      );
      expect(deny.status).toBe(200);
      let reloaded = await repos.deckCheck.getEntry(eventId, entryId2);
      expect(reloaded?.state).toBe("approved");
      expect(reloaded?.unlockRequestedAt).toBeNull();

      // Granting is the transition to editable; the approval fields clear.
      await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      const grant = await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}/state`, {
          state: "editable",
        }),
      );
      expect(grant.status).toBe(200);
      reloaded = await repos.deckCheck.getEntry(eventId, entryId2);
      expect(reloaded?.state).toBe("editable");
      expect(reloaded?.unlockRequestedAt).toBeNull();
      expect(reloaded?.approvedBy).toBeNull();
    });

    it("a rejection hands the list back with an issue recorded", async () => {
      // Lock it again on the player's behalf, then reject it.
      await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}/state`, {
          state: "submitted",
        }),
      );
      const reject = await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}/state`, {
          state: "editable",
          reviewOutcome: "issue",
          playerMessage: "Fix the rune count",
        }),
      );
      expect(reject.status).toBe(200);

      const reloaded = await repos.deckCheck.getEntry(eventId, entryId2);
      expect(reloaded?.state).toBe("editable");
      expect(reloaded?.reviewOutcome).toBe("issue");
      expect(reloaded?.playerMessage).toBe("Fix the rune count");

      const view = await strangerApp.fetch(req("GET", `/deck-check/mine/${entryId2}`));
      const body = (await view.json()) as {
        entry: { state: string; reviewOutcome: string | null; playerMessage: string | null };
      };
      expect(body.entry.state).toBe("editable");
      expect(body.entry.reviewOutcome).toBe("issue");
      expect(body.entry.playerMessage).toBe("Fix the rune count");
    });

    it("auto-submits an entry left editable when the deadline passes", async () => {
      const closeAt = "2020-06-01T12:00:00.000Z";
      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          submissionsCloseAt: closeAt,
        }),
      );

      // Any judge or player load settles the entry; use the judge event list.
      const list = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`),
      );
      expect(list.status).toBe(200);
      const settled = await repos.deckCheck.getEntry(eventId, entryId2);
      expect(settled?.state).toBe("submitted");
      expect(settled?.submittedAt?.toISOString()).toBe(closeAt);

      // After the deadline the player is fully locked out...
      const unlock = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      expect(unlock.status).toBe(409);
      const submit = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/submit`));
      expect(submit.status).toBe(409);

      // ...while judges keep working, deadline or not.
      const approve = await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}/state`, {
          state: "approved",
        }),
      );
      expect(approve.status).toBe(200);

      await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          submissionsCloseAt: null,
        }),
      );
    });
  });

  describe("on_submit lock mode (TR 401.3)", () => {
    let entryId2: string;

    beforeAll(async () => {
      const patch = await adminApp.fetch(
        req("PATCH", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`, {
          listLockMode: "on_submit",
        }),
      );
      expect(patch.status).toBe(200);
      expect(((await patch.json()) as { listLockMode: string }).listLockMode).toBe("on_submit");

      const entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      // oxlint-disable-next-line typescript/no-non-null-assertion -- created by the earlier suite
      entryId2 = entry!.id;
      // The previous block left it approved; bring it back to submitted.
      await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}/state`, {
          state: "submitted",
        }),
      );
    });

    it("a submitted deck only files an unlock request, never unlocks itself", async () => {
      const unlock = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      expect(unlock.status).toBe(200);
      const body = (await unlock.json()) as {
        entry: { state: string; unlockRequested: boolean; canUnlock: boolean };
      };
      expect(body.entry.state).toBe("submitted");
      expect(body.entry.unlockRequested).toBe(true);
      expect(body.entry.canUnlock).toBe(false);

      // The token link cannot replace a submitted list either.
      const replace = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: strangerDeckId }),
      );
      expect(replace.status).toBe(409);
    });

    it("judges see no list content while the player edits", async () => {
      // Grant the pending request: the entry becomes editable.
      const grant = await judgeApp.fetch(
        req("PUT", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}/state`, {
          state: "editable",
        }),
      );
      expect(grant.status).toBe(200);

      const detailRes = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}`),
      );
      expect(detailRes.status).toBe(200);
      const detail = (await detailRes.json()) as {
        entry: { state: string };
        cards: unknown[];
        violations: unknown[];
        typeCounts: unknown[];
      };
      expect(detail.entry.state).toBe("editable");
      expect(detail.cards).toHaveLength(0);
      expect(detail.violations).toHaveLength(0);
      expect(detail.typeCounts).toHaveLength(0);

      const listRes = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}`),
      );
      const list = (await listRes.json()) as {
        entries: { id: string; copyCount: number; verifiedCopyCount: number }[];
      };
      const summary = list.entries.find((candidate) => candidate.id === entryId2);
      expect(summary?.copyCount).toBe(0);
      expect(summary?.verifiedCopyCount).toBe(0);

      // Card-level judge actions are rejected while the list is hidden.
      const cards = await repos.deckCheck.listCardsForEntry(entryId2);
      const tick = await judgeApp.fetch(
        req(
          "PUT",
          `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}/cards/${cards[0]!.id}`,
          { copyIndex: 0, found: true },
        ),
      );
      expect(tick.status).toBe(409);
    });

    it("submitting delivers the list to the judges again", async () => {
      const submit = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/submit`));
      expect(submit.status).toBe(200);

      const detailRes = await judgeApp.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/checks/${eventId}/entries/${entryId2}`),
      );
      const detail = (await detailRes.json()) as { entry: { state: string }; cards: unknown[] };
      expect(detail.entry.state).toBe("submitted");
      expect(detail.cards.length).toBeGreaterThan(0);
    });
  });

  describe("claim tokens (amendment)", () => {
    interface ClaimResult {
      status: string;
      entryId: string | null;
    }
    const fury = { name: CARD_FURY_UNIT.name, quantity: 1, section: "main" };

    it("returns a per-entry claim link and a stable token across re-push", async () => {
      const first = await push([
        { externalId: "claim-stable", playerName: "C. Stable", cards: [fury] },
      ]);
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as {
        entries: { externalId: string; entryId: string; claimUrl: string }[];
      };
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-stable");
      const row = firstBody.entries.find((entryRow) => entryRow.externalId === "claim-stable");
      expect(row?.entryId).toBe(entry?.id);
      expect(row?.claimUrl).toBe(`http://localhost:5173/tournament-claim/${entry?.claimToken}`);

      const second = await push([
        { externalId: "claim-stable", playerName: "C. Stable", cards: [fury] },
      ]);
      const secondBody = (await second.json()) as {
        entries: { externalId: string; claimUrl: string }[];
      };
      expect(
        secondBody.entries.find((entryRow) => entryRow.externalId === "claim-stable")?.claimUrl,
      ).toBe(row?.claimUrl);
    });

    it("mints a token on push for an entry missing one", async () => {
      await push([{ externalId: "claim-mint", playerName: "M. Int", cards: [fury] }]);
      const before = await repos.deckCheck.getEntryByExternalId(eventId, "claim-mint");
      await db
        .updateTable("deckCheckEntries")
        .set({ claimToken: null })
        // oxlint-disable-next-line typescript/no-non-null-assertion -- just pushed
        .where("id", "=", before!.id)
        .execute();

      const res = await push([{ externalId: "claim-mint", playerName: "M. Int", cards: [fury] }]);
      const body = (await res.json()) as { entries: { externalId: string; claimUrl: string }[] };
      const after = await repos.deckCheck.getEntryByExternalId(eventId, "claim-mint");
      expect(after?.claimToken).not.toBeNull();
      const row = body.entries.find((entryRow) => entryRow.externalId === "claim-mint");
      // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
      expect(row?.claimUrl).toContain(after!.claimToken!);
    });

    it("the public landing reveals only event and group; unknown token is 404", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-stable");
      const res = await unverifiedApp.fetch(req("GET", `/deck-check/claim/${entry?.claimToken}`));
      expect(res.status).toBe(200);
      const raw = await res.text();
      expect(raw).not.toContain("C. Stable");
      const body = JSON.parse(raw) as { eventName: string; groupName: string };
      expect(body.eventName).toBe("Self-Service Cup");
      expect(body.groupName).toBe("Player Self-Service Group");

      const missing = await unverifiedApp.fetch(req("GET", "/deck-check/claim/no-such-token"));
      expect(missing.status).toBe(404);
    });

    it("claims an unclaimed entry, then is idempotent for the same caller", async () => {
      await push([{ externalId: "claim-unclaimed", playerName: "U. Nclaimed", cards: [fury] }]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unclaimed");

      const first = await strangerApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect(first.status).toBe(200);
      expect((await first.json()) as ClaimResult).toEqual({
        status: "claimed",
        entryId: entry?.id,
      });
      const linked = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unclaimed");
      expect(linked?.claimedUserId).toBe(STRANGER_ID);
      expect(linked?.claimSource).toBe("claim_link");

      const again = await strangerApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect((await again.json()) as ClaimResult).toEqual({
        status: "already",
        entryId: entry?.id,
      });
    });

    it("refuses a claim for an entry linked to a different account", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unclaimed");
      const res = await playerApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect((await res.json()) as ClaimResult).toEqual({ status: "conflict", entryId: null });
      const still = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unclaimed");
      expect(still?.claimedUserId).toBe(STRANGER_ID);
    });

    it("refuses a claim for a judge-blocked entry", async () => {
      await push([{ externalId: "claim-blocked", playerName: "B. Locked", cards: [fury] }]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-blocked");
      await db
        .updateTable("deckCheckEntries")
        .set({ claimBlockedAt: new Date() })
        // oxlint-disable-next-line typescript/no-non-null-assertion -- just pushed
        .where("id", "=", entry!.id)
        .execute();

      const res = await strangerApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect((await res.json()) as ClaimResult).toEqual({ status: "blocked", entryId: null });
      const still = await repos.deckCheck.getEntryByExternalId(eventId, "claim-blocked");
      expect(still?.claimedUserId).toBeNull();
    });

    it("lets an unverified-email account claim (no verification gate)", async () => {
      await push([{ externalId: "claim-unverified", playerName: "V. Erify", cards: [fury] }]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unverified");
      const res = await unverifiedApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect(res.status).toBe(200);
      expect((await res.json()) as ClaimResult).toEqual({ status: "claimed", entryId: entry?.id });
      const linked = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unverified");
      expect(linked?.claimedUserId).toBe(UNVERIFIED_ID);
      expect(linked?.claimSource).toBe("claim_link");
    });

    it("returns 404 for an unknown claim token on POST", async () => {
      const res = await strangerApp.fetch(req("POST", "/deck-check/claim/no-such-token"));
      expect(res.status).toBe(404);
    });
  });
});
