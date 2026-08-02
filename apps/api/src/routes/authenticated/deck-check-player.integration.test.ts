import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../../deps.js";
import { CARD_FURY_UNIT } from "../../test/fixtures/constants.js";
import { createTestContext, req } from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

const OWNER_ID = crypto.randomUUID();
const ADMIN_ID = crypto.randomUUID();
const JUDGE_ID = crypto.randomUUID();
const MEMBER_ID = crypto.randomUUID();
const PLAYER_ID = crypto.randomUUID();
const STRANGER_ID = crypto.randomUUID();
const UNVERIFIED_ID = crypto.randomUUID();
const OUTSIDER_ID = crypto.randomUUID();

const PLAYER_EMAIL = `test-${PLAYER_ID}@test.com`;
const STRANGER_EMAIL = `test-${STRANGER_ID}@test.com`;
const UNVERIFIED_EMAIL = `test-${UNVERIFIED_ID}@test.com`;
const OUTSIDER_EMAIL = `test-${OUTSIDER_ID}@test.com`;

const GROUP_SLUG = "deck-check-player-itest";

const ownerCtx = createTestContext(OWNER_ID);
const judgeCtx = createTestContext(JUDGE_ID);
const memberCtx = createTestContext(MEMBER_ID);
const playerCtx = createTestContext(PLAYER_ID, PLAYER_EMAIL);
const strangerCtx = createTestContext(STRANGER_ID, STRANGER_EMAIL);
const unverifiedCtx = createTestContext(UNVERIFIED_ID, UNVERIFIED_EMAIL);
// A signed-in user who never claimed or self-registered: the canonical
// "stranger" for the self-registration-off deck-submission gate (ADR-033).
const outsiderCtx = createTestContext(OUTSIDER_ID, OUTSIDER_EMAIL);

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
  const ownerApp = ownerCtx!.app;
  const judgeApp = judgeCtx!.app;
  const memberApp = memberCtx!.app;
  const playerApp = playerCtx!.app;
  const strangerApp = strangerCtx!.app;
  const unverifiedApp = unverifiedCtx!.app;
  const outsiderApp = outsiderCtx!.app;
  // oxlint-enable typescript/no-non-null-assertion
  const repos = createRepos(db);

  let groupId: string;
  let pushToken: string;
  let eventId: string;
  let playerDeckId: string;
  let strangerDeckId: string;
  let submissionToken: string;

  async function push(entries: Record<string, unknown>[]): Promise<Response> {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
    return await ownerCtx!.app.fetch(ingestReq(pushToken, { tournamentId: eventId, entries }));
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
      .execute();
  }

  beforeAll(async () => {
    await createUser(OWNER_ID, `test-${OWNER_ID}@test.com`, true);
    await createUser(ADMIN_ID, `test-${ADMIN_ID}@test.com`, true);
    await createUser(JUDGE_ID, `test-${JUDGE_ID}@test.com`, true);
    await createUser(MEMBER_ID, `test-${MEMBER_ID}@test.com`, true);
    await createUser(PLAYER_ID, PLAYER_EMAIL, true);
    await createUser(STRANGER_ID, STRANGER_EMAIL, true);
    await createUser(UNVERIFIED_ID, UNVERIFIED_EMAIL, false);
    await createUser(OUTSIDER_ID, OUTSIDER_EMAIL, true);

    const group = await repos.friendGroups.createWithOwner(
      { slug: GROUP_SLUG, name: "Player Self-Service Group", description: null, code: null },
      OWNER_ID,
    );
    groupId = group.id;
    await repos.friendGroups.addMember(groupId, ADMIN_ID, "admin");
    // ADR-033 retired the friend-group `judge` role; judging is tournament staff.
    await repos.friendGroups.addMember(groupId, JUDGE_ID, "member");
    await repos.friendGroups.addMember(groupId, MEMBER_ID, "member");

    const event = await repos.tournaments.create({
      hostType: "user",
      hostUserId: OWNER_ID,
      groupId,
      name: "Self-Service Cup",
      startsAt: new Date("2026-07-01"),
      pairingStyle: "none",
      deckSubmission: "optional",
      // Most of this suite exercises the lenient lock mode (self-service
      // corrections until the deadline); the strict default gets its own block.
      listLockMode: "at_deadline",
    });
    eventId = event.id;
    await repos.tournaments.addStaff(eventId, JUDGE_ID, "judge");

    // Host-scoped push key (ADR-033): the tournament is hosted by the group
    // owner, so the owner mints the personal integration key the ingest uses.
    const keyRes = await ownerApp.fetch(
      req("POST", "/me/deck-check-keys", { label: "player-itest" }),
    );
    pushToken = ((await readJson(keyRes)) as { token: string }).token;

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
        OUTSIDER_ID,
      ])
      .execute();
  });

  describe("ingest creates unclaimed walk-ins", () => {
    it("a pushed entry starts unclaimed, then the player claims it by link", async () => {
      const res = await push([
        {
          externalId: "p-entry-1",
          playerName: "P. Layer",
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 3, section: "main" }],
        },
      ]);
      expect(res.status).toBe(200);

      // No email auto-match anymore: the entry starts unclaimed.
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(entry?.claimedUserId).toBeNull();

      // The player claims it through its claim link, which links the participant
      // (and so the deck) to their account. Downstream tests rely on this link.
      const claim = await playerApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect(claim.status).toBe(200);
      const linked = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(linked?.claimedUserId).toBe(PLAYER_ID);
      expect(linked?.claimSource).toBe("claim_link");
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

  describe("player access", () => {
    it("resolves the caller's own entry from the tournament id", async () => {
      const res = await playerApp.fetch(req("GET", `/deck-check/mine/tournament/${eventId}`));
      expect(res.status).toBe(200);
      const body = (await readJson(res)) as { entry: { eventName: string } };
      expect(body.entry.eventName).toBe("Self-Service Cup");
    });

    it("returns 404 for a viewer with no entry in the tournament", async () => {
      // Same tournament, a member who never handed in a deck: the read is
      // keyed on the caller's own participant link, not on the tournament.
      const res = await memberApp.fetch(req("GET", `/deck-check/mine/tournament/${eventId}`));
      expect(res.status).toBe(404);
    });

    it("omits the judging team's fields from the player payload", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      await repos.deckCheck.updateEntry(entry!.id, { notes: "judge-private note" });

      const res = await playerApp.fetch(req("GET", `/deck-check/mine/tournament/${eventId}`));
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

  describe("group-less tournament (ADR-033)", () => {
    it("lists and opens a personally-hosted entry with no owning friend group", async () => {
      // A tournament hosted by a user directly, with groupId = null — the new
      // first-class config. The player's own queries must left-join the group,
      // not inner-join, or the player's own deck page 404s for this entry.
      const tournament = await repos.tournaments.create({
        hostType: "user",
        hostUserId: OWNER_ID,
        groupId: null,
        name: "Solo-Hosted Cup",
        pairingStyle: "none",
        deckSubmission: "optional",
      });
      const participant = await repos.tournaments.createParticipant({
        tournamentId: tournament.id,
        displayName: "P. Layer",
        userId: PLAYER_ID,
        claimSource: "claim_link",
        claimedAt: new Date(),
      });
      const entry = await repos.deckCheck.createEntry({
        tournamentId: tournament.id,
        participantId: participant.id,
        externalId: "groupless-entry-1",
        submittedAt: new Date(),
        contentHash: "groupless-hash",
        withdrawnAt: null,
        state: "submitted",
      });

      try {
        const detailRes = await playerApp.fetch(
          req("GET", `/deck-check/mine/tournament/${tournament.id}`),
        );
        expect(detailRes.status).toBe(200);
        const detail = (await readJson(detailRes)) as {
          entry: { id: string; eventName: string; groupName: string | null };
        };
        expect(detail.entry.id).toBe(entry.id);
        expect(detail.entry.eventName).toBe("Solo-Hosted Cup");
        expect(detail.entry.groupName).toBeNull();
      } finally {
        await db.deleteFrom("tournaments").where("id", "=", tournament.id).execute();
      }
    });
  });

  describe("judge link management", () => {
    it("rejects unlink for a plain member", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      const unlink = await memberApp.fetch(
        req("DELETE", `/tournaments/${eventId}/deck-check/entries/${entry?.id}/link`),
      );
      expect(unlink.status).toBe(403);
    });

    it("unlink clears the account link and blocks a re-claim", async () => {
      // A separate entry/account, so p-entry-1 stays linked to PLAYER for the
      // self-submission tests below.
      const memberEntry = [
        {
          externalId: "p-entry-member",
          playerName: "M. Ember",
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 3, section: "main" }],
        },
      ];
      await push(memberEntry);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-member");
      // MEMBER claims the walk-in by link.
      const claim = await memberApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect(claim.status).toBe(200);
      const claimed = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-member");
      expect(claimed?.claimedUserId).toBe(MEMBER_ID);

      const unlink = await judgeApp.fetch(
        req("DELETE", `/tournaments/${eventId}/deck-check/entries/${entry?.id}/link`),
      );
      expect(unlink.status).toBe(200);

      // Unlink clears the link and sets the block, so a re-claim is refused.
      const after = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-member");
      expect(after?.claimedUserId).toBeNull();
      expect(after?.claimBlockedAt).not.toBeNull();
      const reclaim = await memberApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect(((await readJson(reclaim)) as { status: string }).status).toBe("blocked");
    });
  });

  describe("self-submission", () => {
    it("enabling self-submission mints a token; the page resolves for a holder", async () => {
      // ADR-033 split the toggle from the token: the host opts in to
      // self-registration on the tournament, then mints the submission token.
      await ownerApp.fetch(req("PATCH", `/tournaments/${eventId}`, { selfRegistration: true }));
      const res = await ownerApp.fetch(req("POST", `/tournaments/${eventId}/submission-token`));
      expect(res.status).toBe(200);
      const body = (await readJson(res)) as { submissionToken: string | null };
      expect(body.submissionToken).not.toBeNull();
      submissionToken = body.submissionToken as string;

      const page = await playerApp.fetch(req("GET", `/deck-check/submissions/${submissionToken}`));
      expect(page.status).toBe(200);
      const pageBody = (await readJson(page)) as {
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
      const body = (await readJson(res)) as { entryId: string | null };
      expect(body.entryId).toBe(entry?.id);
      const after = await repos.deckCheck.getEntryByExternalId(eventId, "p-entry-1");
      expect(after?.state).toBe("submitted");
      expect(after?.claimedUserId).toBe(PLAYER_ID);

      // Once a judge approved it, the token link is locked out.
      await judgeApp.fetch(
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entry?.id}/state`, {
          state: "approved",
        }),
      );
      const locked = await playerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: playerDeckId }),
      );
      expect(locked.status).toBe(409);

      // Revoke so later tests see a submitted entry again.
      await judgeApp.fetch(
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entry?.id}/state`, {
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
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        },
      ]);
      const result = (await readJson(res)) as { entriesUpdated: number; entriesIgnored: number };
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

      // Viewing still works; the deck page badges the entry as withdrawn.
      const view = await playerApp.fetch(req("GET", `/deck-check/mine/tournament/${eventId}`));
      const body = (await readJson(view)) as { entry: { state: string } };
      expect(body.entry.state).toBe("withdrawn");
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
      const firstBody = (await readJson(first)) as { entryId: string };

      const entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      expect(entry?.id).toBe(firstBody.entryId);
      expect(entry?.claimSource).toBe("self_submit");
      expect(entry?.state).toBe("submitted");
      expect(entry?.riotId).toBe("Stranger#EUW");

      const second = await strangerApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckId: strangerDeckId }),
      );
      const secondBody = (await readJson(second)) as { entryId: string };
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

      // The player declines publishing and Riot-ID sharing (but not name); the
      // same-list submit records each flag it was sent, leaving name at its default.
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

      // A flagless re-submit is no statement: every refusal survives.
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
      const body = (await readJson(res)) as { entryId: string | null; cards: unknown[] };
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

    it("self-registration off keeps the link for a claimed participant but blocks a stranger", async () => {
      // ADR-033: self-registration is a roster-policy gate, not the link's kill
      // switch. Turning it off must not break deck submission for someone who
      // already holds a spot, while a stranger is told to claim first.
      await ownerApp.fetch(req("PATCH", `/tournaments/${eventId}`, { selfRegistration: false }));

      // PLAYER claimed p-entry-1 earlier, so the link still resolves (this was a
      // 404 before the fix, when self-registration doubled as the link gate).
      const holderPage = await playerApp.fetch(
        req("GET", `/deck-check/submissions/${submissionToken}`),
      );
      expect(holderPage.status).toBe(200);

      // A signed-in stranger who never claimed a spot is refused (403), and the
      // refusal does not silently self-register them.
      const strangerPage = await outsiderApp.fetch(
        req("GET", `/deck-check/submissions/${submissionToken}`),
      );
      expect(strangerPage.status).toBe(403);
      const strangerSubmit = await outsiderApp.fetch(
        req("POST", `/deck-check/submissions/${submissionToken}`, { deckCode: "irrelevant" }),
      );
      expect(strangerSubmit.status).toBe(403);
      const created = await repos.tournaments.findParticipantByUser(eventId, OUTSIDER_ID);
      expect(created).toBeFalsy();

      // Restore self-registration for the remaining cases.
      await ownerApp.fetch(req("PATCH", `/tournaments/${eventId}`, { selfRegistration: true }));
    });

    it("disabling the submission token kills the link; regenerating replaces it", async () => {
      // The token, not the self-registration flag, is the link's kill switch.
      const disable = await ownerApp.fetch(
        req("DELETE", `/tournaments/${eventId}/submission-token`),
      );
      expect(disable.status).toBe(200);
      const dead = await playerApp.fetch(req("GET", `/deck-check/submissions/${submissionToken}`));
      expect(dead.status).toBe(404);

      const regen = await ownerApp.fetch(req("POST", `/tournaments/${eventId}/submission-token`));
      expect(regen.status).toBe(200);
      const newToken = ((await readJson(regen)) as { submissionToken: string }).submissionToken;
      expect(newToken).not.toBe(submissionToken);

      const oldDead = await playerApp.fetch(
        req("GET", `/deck-check/submissions/${submissionToken}`),
      );
      expect(oldDead.status).toBe(404);
      submissionToken = newToken;
    });

    it("a passed close date blocks edits while viewing still works", async () => {
      await ownerApp.fetch(
        req("PATCH", `/tournaments/${eventId}`, {
          submissionsCloseAt: "2020-01-01T00:00:00Z",
        }),
      );
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      const edit = await strangerApp.fetch(
        req("PUT", `/deck-check/mine/${entry?.id}/list`, { deckId: strangerDeckId }),
      );
      expect(edit.status).toBe(409);

      const view = await strangerApp.fetch(req("GET", `/deck-check/mine/tournament/${eventId}`));
      expect(view.status).toBe(200);
      const body = (await readJson(view)) as { entry: { canEdit: boolean } };
      expect(body.entry.canEdit).toBe(false);
    });
  });

  describe("player lifecycle (ADR-027)", () => {
    let entryId2: string;

    beforeAll(async () => {
      // Re-open the window the previous block closed.
      await ownerApp.fetch(
        req("PATCH", `/tournaments/${eventId}`, {
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

    it("hands each caller their own entry in a tournament holding several", async () => {
      // Both the player and the stranger have an entry in this tournament by
      // now. The read is addressed by tournament, so ownership is the only
      // thing separating the two payloads.
      const mine = await playerApp.fetch(req("GET", `/deck-check/mine/tournament/${eventId}`));
      const theirs = await strangerApp.fetch(req("GET", `/deck-check/mine/tournament/${eventId}`));
      const mineBody = (await readJson(mine)) as { entry: { id: string } };
      const theirsBody = (await readJson(theirs)) as { entry: { id: string } };
      expect(theirsBody.entry.id).toBe(entryId2);
      expect(mineBody.entry.id).not.toBe(entryId2);
    });

    it("unlocks a submitted entry self-service, then resubmits with a diff", async () => {
      const unlock = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      expect(unlock.status).toBe(200);
      const unlocked = (await readJson(unlock)) as { entry: { state: string; canEdit: boolean } };
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
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entryId2}/state`, {
          state: "approved",
        }),
      );

      // Direct unlock files a request instead.
      const request = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      expect(request.status).toBe(200);
      const requested = (await readJson(request)) as {
        entry: { state: string; unlockRequested: boolean };
      };
      expect(requested.entry.state).toBe("approved");
      expect(requested.entry.unlockRequested).toBe(true);

      // The player can cancel their own request.
      const cancel = await strangerApp.fetch(req("DELETE", `/deck-check/mine/${entryId2}/unlock`));
      expect(
        ((await readJson(cancel)) as { entry: { unlockRequested: boolean } }).entry.unlockRequested,
      ).toBe(false);

      // A judge can decline a request, keeping the approval.
      await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      const deny = await judgeApp.fetch(
        req("DELETE", `/tournaments/${eventId}/deck-check/entries/${entryId2}/unlock-request`),
      );
      expect(deny.status).toBe(200);
      let reloaded = await repos.deckCheck.getEntry(eventId, entryId2);
      expect(reloaded?.state).toBe("approved");
      expect(reloaded?.unlockRequestedAt).toBeNull();

      // Granting is the transition to editable; the approval fields clear.
      await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      const grant = await judgeApp.fetch(
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entryId2}/state`, {
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
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entryId2}/state`, {
          state: "submitted",
        }),
      );
      const reject = await judgeApp.fetch(
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entryId2}/state`, {
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

      const view = await strangerApp.fetch(req("GET", `/deck-check/mine/tournament/${eventId}`));
      const body = (await readJson(view)) as {
        entry: { state: string; reviewOutcome: string | null; playerMessage: string | null };
      };
      expect(body.entry.state).toBe("editable");
      expect(body.entry.reviewOutcome).toBe("issue");
      expect(body.entry.playerMessage).toBe("Fix the rune count");
    });

    it("auto-submits an entry left editable when the deadline passes", async () => {
      const closeAt = "2020-06-01T12:00:00.000Z";
      await ownerApp.fetch(
        req("PATCH", `/tournaments/${eventId}`, {
          submissionsCloseAt: closeAt,
        }),
      );

      // Any judge or player load settles the entry; use the judge event list.
      const list = await judgeApp.fetch(req("GET", `/tournaments/${eventId}/deck-check/entries`));
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
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entryId2}/state`, {
          state: "approved",
        }),
      );
      expect(approve.status).toBe(200);

      await ownerApp.fetch(
        req("PATCH", `/tournaments/${eventId}`, {
          submissionsCloseAt: null,
        }),
      );
    });
  });

  describe("on_submit lock mode (TR 401.3)", () => {
    let entryId2: string;

    beforeAll(async () => {
      const patch = await ownerApp.fetch(
        req("PATCH", `/tournaments/${eventId}`, {
          listLockMode: "on_submit",
        }),
      );
      expect(patch.status).toBe(200);
      expect(((await readJson(patch)) as { listLockMode: string }).listLockMode).toBe("on_submit");

      const entry = await repos.deckCheck.getEntryByExternalId(eventId, `openrift:${STRANGER_ID}`);
      // oxlint-disable-next-line typescript/no-non-null-assertion -- created by the earlier suite
      entryId2 = entry!.id;
      // The previous block left it approved; bring it back to submitted.
      await judgeApp.fetch(
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entryId2}/state`, {
          state: "submitted",
        }),
      );
    });

    it("a submitted deck only files an unlock request, never unlocks itself", async () => {
      const unlock = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/unlock`));
      expect(unlock.status).toBe(200);
      const body = (await readJson(unlock)) as {
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
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entryId2}/state`, {
          state: "editable",
        }),
      );
      expect(grant.status).toBe(200);

      const detailRes = await judgeApp.fetch(
        req("GET", `/tournaments/${eventId}/deck-check/entries/${entryId2}`),
      );
      expect(detailRes.status).toBe(200);
      const detail = (await readJson(detailRes)) as {
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
        req("GET", `/tournaments/${eventId}/deck-check/entries`),
      );
      const list = (await readJson(listRes)) as {
        entries: { id: string; copyCount: number; verifiedCopyCount: number }[];
      };
      const summary = list.entries.find((candidate) => candidate.id === entryId2);
      expect(summary?.copyCount).toBe(0);
      expect(summary?.verifiedCopyCount).toBe(0);

      // Card-level judge actions are rejected while the list is hidden.
      const cards = await repos.deckCheck.listCardsForEntry(entryId2);
      const tick = await judgeApp.fetch(
        req("PUT", `/tournaments/${eventId}/deck-check/entries/${entryId2}/cards/${cards[0]!.id}`, {
          copyIndex: 0,
          found: true,
        }),
      );
      expect(tick.status).toBe(409);
    });

    it("submitting delivers the list to the judges again", async () => {
      const submit = await strangerApp.fetch(req("POST", `/deck-check/mine/${entryId2}/submit`));
      expect(submit.status).toBe(200);

      const detailRes = await judgeApp.fetch(
        req("GET", `/tournaments/${eventId}/deck-check/entries/${entryId2}`),
      );
      const detail = (await readJson(detailRes)) as { entry: { state: string }; cards: unknown[] };
      expect(detail.entry.state).toBe("submitted");
      expect(detail.cards.length).toBeGreaterThan(0);
    });
  });

  describe("claim tokens (amendment)", () => {
    interface ClaimResult {
      status: string;
      tournamentId: string | null;
      entryId: string | null;
    }
    const fury = { name: CARD_FURY_UNIT.name, quantity: 1, section: "main" };

    it("returns a per-entry claim link and a stable token across re-push", async () => {
      const first = await push([
        { externalId: "claim-stable", playerName: "C. Stable", cards: [fury] },
      ]);
      expect(first.status).toBe(200);
      const firstBody = (await readJson(first)) as {
        entries: { externalId: string; entryId: string; claimUrl: string }[];
      };
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-stable");
      const row = firstBody.entries.find((entryRow) => entryRow.externalId === "claim-stable");
      expect(row?.entryId).toBe(entry?.id);
      expect(row?.claimUrl).toBe(`http://localhost:5173/tournaments/claim/${entry?.claimToken}`);

      const second = await push([
        { externalId: "claim-stable", playerName: "C. Stable", cards: [fury] },
      ]);
      const secondBody = (await readJson(second)) as {
        entries: { externalId: string; claimUrl: string }[];
      };
      expect(
        secondBody.entries.find((entryRow) => entryRow.externalId === "claim-stable")?.claimUrl,
      ).toBe(row?.claimUrl);
    });

    it("mints a token on push for an entry missing one", async () => {
      await push([{ externalId: "claim-mint", playerName: "M. Int", cards: [fury] }]);
      const before = await repos.deckCheck.getEntryByExternalId(eventId, "claim-mint");
      // The claim token lives on the participant now (ADR-033).
      await db
        .updateTable("tournamentParticipants")
        .set({ claimToken: null })
        // oxlint-disable-next-line typescript/no-non-null-assertion -- just pushed
        .where("id", "=", before!.participantId!)
        .execute();

      const res = await push([{ externalId: "claim-mint", playerName: "M. Int", cards: [fury] }]);
      const body = (await readJson(res)) as { entries: { externalId: string; claimUrl: string }[] };
      const after = await repos.deckCheck.getEntryByExternalId(eventId, "claim-mint");
      expect(after?.claimToken).not.toBeNull();
      const row = body.entries.find((entryRow) => entryRow.externalId === "claim-mint");
      // oxlint-disable-next-line typescript/no-non-null-assertion -- asserted above
      expect(row?.claimUrl).toContain(after!.claimToken!);
    });

    it("the public landing reveals the tournament, group, and spot; unknown token is 404", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-stable");
      const res = await unverifiedApp.fetch(req("GET", `/deck-check/claim/${entry?.claimToken}`));
      expect(res.status).toBe(200);
      const body = (await readJson(res)) as {
        tournamentName: string;
        groupName: string | null;
        participantName: string;
      };
      expect(body.tournamentName).toBe("Self-Service Cup");
      expect(body.groupName).toBe("Player Self-Service Group");
      expect(body.participantName).toBe("C. Stable");

      const missing = await unverifiedApp.fetch(req("GET", "/deck-check/claim/no-such-token"));
      expect(missing.status).toBe(404);
    });

    it("claims an unclaimed entry, then is idempotent for the same caller", async () => {
      await push([{ externalId: "claim-unclaimed", playerName: "U. Nclaimed", cards: [fury] }]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unclaimed");

      // MEMBER has no other participant in this tournament, so linking respects
      // the one-participant-per-account index (ADR-033).
      const first = await memberApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect(first.status).toBe(200);
      expect((await readJson(first)) as ClaimResult).toEqual({
        status: "claimed",
        tournamentId: eventId,
        entryId: entry?.id,
      });
      const linked = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unclaimed");
      expect(linked?.claimedUserId).toBe(MEMBER_ID);
      expect(linked?.claimSource).toBe("claim_link");

      const again = await memberApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect((await readJson(again)) as ClaimResult).toEqual({
        status: "already",
        tournamentId: eventId,
        entryId: entry?.id,
      });
    });

    it("refuses a claim for an entry linked to a different account", async () => {
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unclaimed");
      const res = await playerApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect((await readJson(res)) as ClaimResult).toEqual({
        status: "conflict",
        tournamentId: null,
        entryId: null,
      });
      const still = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unclaimed");
      expect(still?.claimedUserId).toBe(MEMBER_ID);
    });

    it("refuses a claim for a judge-blocked entry", async () => {
      await push([{ externalId: "claim-blocked", playerName: "B. Locked", cards: [fury] }]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-blocked");
      // The claim block lives on the participant now (ADR-033).
      await db
        .updateTable("tournamentParticipants")
        .set({ claimBlockedAt: new Date() })
        // oxlint-disable-next-line typescript/no-non-null-assertion -- just pushed
        .where("id", "=", entry!.participantId!)
        .execute();

      const res = await strangerApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect((await readJson(res)) as ClaimResult).toEqual({
        status: "blocked",
        tournamentId: null,
        entryId: null,
      });
      const still = await repos.deckCheck.getEntryByExternalId(eventId, "claim-blocked");
      expect(still?.claimedUserId).toBeNull();
    });

    it("lets an unverified-email account claim (no verification gate)", async () => {
      await push([{ externalId: "claim-unverified", playerName: "V. Erify", cards: [fury] }]);
      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "claim-unverified");
      const res = await unverifiedApp.fetch(req("POST", `/deck-check/claim/${entry?.claimToken}`));
      expect(res.status).toBe(200);
      expect((await readJson(res)) as ClaimResult).toEqual({
        status: "claimed",
        tournamentId: eventId,
        entryId: entry?.id,
      });
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
