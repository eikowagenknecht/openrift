import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../../../deps.js";
import { CARD_FURY_RUNE, CARD_FURY_UNIT } from "../../../test/fixtures/constants.js";
import { createTestContext, req } from "../../../test/integration-context.js";
import { readJson } from "../../../test/read-json.js";

const HOST_ID = crypto.randomUUID();
const JUDGE_ID = crypto.randomUUID();
const STRANGER_ID = crypto.randomUUID();
const ORG_OWNER_ID = crypto.randomUUID();
const MEMBER_ID = crypto.randomUUID();

const ORG_ID = crypto.randomUUID();
const GROUP_SLUG = "tdc-itest-group";

const ALL_IDS = [HOST_ID, JUDGE_ID, STRANGER_ID, ORG_OWNER_ID, MEMBER_ID];

const hostCtx = createTestContext(HOST_ID, `test-${HOST_ID}@test.com`);
const judgeCtx = createTestContext(JUDGE_ID, `test-${JUDGE_ID}@test.com`);
const strangerCtx = createTestContext(STRANGER_ID, `test-${STRANGER_ID}@test.com`);
const orgOwnerCtx = createTestContext(ORG_OWNER_ID, `test-${ORG_OWNER_ID}@test.com`);
const memberCtx = createTestContext(MEMBER_ID, `test-${MEMBER_ID}@test.com`);

interface EntrySummary {
  id: string;
  playerName: string;
  participantId: string | null;
  participantStatus: string | null;
}
interface CardLine {
  id: string;
  zone: string;
  quantity: number;
  foundCopies?: boolean[];
}

describe.skipIf(!hostCtx)("Tournament-scoped deck-check + host keys (integration, ADR-033)", () => {
  // oxlint-disable typescript/no-non-null-assertion -- guarded by skipIf
  const host = hostCtx!;
  const judge = judgeCtx!;
  const stranger = strangerCtx!;
  const orgOwner = orgOwnerCtx!;
  const member = memberCtx!;
  // oxlint-enable typescript/no-non-null-assertion
  const repos = createRepos(host.db);

  let tournamentId = "";

  beforeAll(async () => {
    for (const userId of ALL_IDS) {
      await host.db
        .insertInto("users")
        .values({
          id: userId,
          email: `test-${userId}@test.com`,
          name: "T",
          emailVerified: true,
          image: null,
        })
        .execute();
    }

    // `fk_organizations_owner_membership` is deferred, so the org and its
    // owner's membership row must commit in one transaction.
    await host.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("organizations")
        .values({ id: ORG_ID, slug: "tdc-org", name: "TDC Org" })
        .execute();
      await trx
        .insertInto("organizationMembers")
        .values({ orgId: ORG_ID, userId: ORG_OWNER_ID, role: "owner" })
        .onConflict((oc) => oc.columns(["orgId", "userId"]).doNothing())
        .execute();
    });

    const group = await repos.friendGroups.createWithOwner(
      { slug: GROUP_SLUG, name: "TDC Group", description: null, code: null },
      HOST_ID,
    );
    await repos.friendGroups.addMember(group.id, MEMBER_ID, "member");

    const created = await host.app.fetch(
      req("POST", "/tournaments", {
        name: "Deck Check Cup",
        host: { type: "user" },
        pairingStyle: "none",
        deckSubmission: "required",
        startsAt: "2026-06-01T12:00:00Z",
        groupId: group.id,
      }),
    );
    tournamentId = ((await readJson(created)) as { id: string }).id;
    await repos.tournaments.addStaff(tournamentId, JUDGE_ID, "judge");
    // tournamentToEvent maps status running -> active; deck-check only treats an active event.
    await repos.tournaments.updateSettings(tournamentId, { status: "running" });
  });

  afterAll(async () => {
    await host.db.deleteFrom("tournaments").where("hostUserId", "in", ALL_IDS).execute();
    await host.db.deleteFrom("deckCheckKeys").where("hostUserId", "in", ALL_IDS).execute();
    await host.db.deleteFrom("deckCheckKeys").where("hostOrgId", "=", ORG_ID).execute();
    await host.db.deleteFrom("friendGroups").where("slug", "=", GROUP_SLUG).execute();
    await host.db.deleteFrom("organizations").where("id", "=", ORG_ID).execute();
    await host.db.deleteFrom("users").where("id", "in", ALL_IDS).execute();
  });

  describe("tournament-scoped judge API", () => {
    let entryId = "";

    it("lists entries for the host and 403s an unrelated user", async () => {
      const ok = await host.app.fetch(
        req("GET", `/tournaments/${tournamentId}/deck-check/entries`),
      );
      expect(ok.status).toBe(200);
      const body = (await readJson(ok)) as { event: { id: string }; entries: EntrySummary[] };
      expect(body.event.id).toBe(tournamentId);

      const denied = await stranger.app.fetch(
        req("GET", `/tournaments/${tournamentId}/deck-check/entries`),
      );
      expect(denied.status).toBe(403);
    });

    it("lets a staff judge attach a deck to an existing participant", async () => {
      const participant = await repos.tournaments.createParticipant({
        tournamentId,
        displayName: "Manual Maud",
        status: "active",
      });
      const res = await judge.app.fetch(
        req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
          participantId: participant.id,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        }),
      );
      expect(res.status).toBe(201);
      const body = (await readJson(res)) as { entry: { id: string }; cards: CardLine[] };
      entryId = body.entry.id;
      expect(body.cards).toHaveLength(1);

      const dup = await judge.app.fetch(
        req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
          participantId: participant.id,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        }),
      );
      expect(dup.status).toBe(409);
    });

    it("transitions entry state and ticks a card copy", async () => {
      const approve = await judge.app.fetch(
        req("PUT", `/tournaments/${tournamentId}/deck-check/entries/${entryId}/state`, {
          state: "approved",
        }),
      );
      expect(approve.status).toBe(200);
      expect(((await readJson(approve)) as { entry: { state: string } }).entry.state).toBe(
        "approved",
      );

      const detail = await host.app.fetch(
        req("GET", `/tournaments/${tournamentId}/deck-check/entries/${entryId}`),
      );
      const cardId = ((await readJson(detail)) as { cards: CardLine[] }).cards[0]!.id;

      const tick = await judge.app.fetch(
        req("PUT", `/tournaments/${tournamentId}/deck-check/entries/${entryId}/cards/${cardId}`, {
          copyIndex: 0,
          found: true,
        }),
      );
      expect(tick.status).toBe(204);

      const denied = await stranger.app.fetch(
        req("PUT", `/tournaments/${tournamentId}/deck-check/entries/${entryId}/cards/${cardId}`, {
          copyIndex: 0,
          found: false,
        }),
      );
      expect(denied.status).toBe(403);
    });

    it("counts approved and checked entries separately in the event summary", async () => {
      interface Summary {
        event: { approvedCount: number; checkedCount: number; entryCount: number };
      }
      const fetchSummary = async (): Promise<Summary["event"]> => {
        const res = await host.app.fetch(
          req("GET", `/tournaments/${tournamentId}/deck-check/entries`),
        );
        return ((await readJson(res)) as Summary).event;
      };

      // entryId was driven to "approved" by the prior test.
      const before = await fetchSummary();
      expect(before.approvedCount).toBeGreaterThanOrEqual(1);

      const checked = await judge.app.fetch(
        req("PUT", `/tournaments/${tournamentId}/deck-check/entries/${entryId}/state`, {
          state: "checked",
          reviewOutcome: "ok",
        }),
      );
      expect(checked.status).toBe(200);

      const after = await fetchSummary();
      expect(after.checkedCount).toBe(before.checkedCount + 1);
      expect(after.approvedCount).toBe(before.approvedCount - 1);
      expect(after.entryCount).toBe(before.entryCount);
    });

    it("marking a clean check fills every found tick; a flagged check leaves them", async () => {
      const fetchCards = async (entry: string): Promise<CardLine[]> => {
        const res = await host.app.fetch(
          req("GET", `/tournaments/${tournamentId}/deck-check/entries/${entry}`),
        );
        return ((await readJson(res)) as { cards: CardLine[] }).cards;
      };
      const setState = async (entry: string, body: Record<string, unknown>): Promise<Response> =>
        await judge.app.fetch(
          req("PUT", `/tournaments/${tournamentId}/deck-check/entries/${entry}/state`, body),
        );
      const driveToApproved = async (displayName: string): Promise<string> => {
        const participant = await repos.tournaments.createParticipant({
          tournamentId,
          displayName,
          status: "active",
        });
        const created = await judge.app.fetch(
          req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
            participantId: participant.id,
            cards: [{ name: CARD_FURY_UNIT.name, quantity: 3, section: "main" }],
          }),
        );
        const entry = ((await readJson(created)) as { entry: { id: string } }).entry.id;
        await setState(entry, { state: "approved" });
        return entry;
      };

      const cleanEntry = await driveToApproved("Auto Aria");
      await setState(cleanEntry, { state: "checked", reviewOutcome: "ok" });
      const checkedCards = await fetchCards(cleanEntry);
      expect(checkedCards[0]!.foundCopies).toEqual([true, true, true]);

      await setState(cleanEntry, { state: "submitted" });
      const reopenedCards = await fetchCards(cleanEntry);
      expect(reopenedCards[0]!.foundCopies ?? []).not.toContain(true);

      const flaggedEntry = await driveToApproved("Flagged Fae");
      await setState(flaggedEntry, { state: "checked", reviewOutcome: "issue" });
      const flaggedCards = await fetchCards(flaggedEntry);
      expect(flaggedCards[0]!.foundCopies ?? []).not.toContain(true);
    });

    it("removing a participant also deletes their decklist (no orphaned entry)", async () => {
      const participant = await repos.tournaments.createParticipant({
        tournamentId,
        displayName: "Cascade Cara",
        status: "active",
      });
      const created = await judge.app.fetch(
        req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
          participantId: participant.id,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        }),
      );
      expect(created.status).toBe(201);
      const newEntryId = ((await readJson(created)) as { entry: { id: string } }).entry.id;

      const removed = await host.app.fetch(
        req("DELETE", `/tournaments/${tournamentId}/participants/${participant.id}`),
      );
      expect(removed.ok).toBe(true);

      const gone = await host.app.fetch(
        req("GET", `/tournaments/${tournamentId}/deck-check/entries/${newEntryId}`),
      );
      expect(gone.status).toBe(404);
    });

    it("surfaces the owning participant's dropped status on their deck entry", async () => {
      const participant = await repos.tournaments.createParticipant({
        tournamentId,
        displayName: "Dropout Dale",
        status: "active",
      });
      const created = await judge.app.fetch(
        req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
          participantId: participant.id,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        }),
      );
      expect(created.status).toBe(201);

      const findEntry = async (): Promise<EntrySummary | undefined> => {
        const res = await host.app.fetch(
          req("GET", `/tournaments/${tournamentId}/deck-check/entries`),
        );
        const body = (await readJson(res)) as { entries: EntrySummary[] };
        return body.entries.find((entry) => entry.participantId === participant.id);
      };

      const whileActive = await findEntry();
      expect(whileActive?.participantStatus).toBe("active");

      const dropped = await host.app.fetch(
        req("POST", `/tournaments/${tournamentId}/participants/${participant.id}/drop`),
      );
      expect(dropped.ok).toBe(true);

      const after = await findEntry();
      expect(after).toBeDefined();
      expect(after?.participantStatus).toBe("dropped");
    });

    it("404s a deck-check action on a tournament without deck check enabled", async () => {
      const plain = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "No Deck Check",
          host: { type: "user" },
          pairingStyle: "pod",
          deckSubmission: "none",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      const plainId = ((await readJson(plain)) as { id: string }).id;
      const res = await host.app.fetch(req("GET", `/tournaments/${plainId}/deck-check/entries`));
      expect(res.status).toBe(404);
    });
  });

  describe("host-scoped integration keys", () => {
    it("mints, lists, and revokes a personal key", async () => {
      const minted = await host.app.fetch(
        req("POST", "/me/deck-check-keys", { label: "My laptop" }),
      );
      expect(minted.status).toBe(201);
      const body = (await readJson(minted)) as { key: { id: string }; token: string };
      expect(body.token.startsWith("orpk_")).toBe(true);
      const keyId = body.key.id;

      const list = await host.app.fetch(req("GET", "/me/deck-check-keys"));
      const items = ((await readJson(list)) as { items: { id: string }[] }).items;
      expect(items.some((item) => item.id === keyId)).toBe(true);

      const otherList = await stranger.app.fetch(req("GET", "/me/deck-check-keys"));
      const otherItems = ((await readJson(otherList)) as { items: { id: string }[] }).items;
      expect(otherItems.some((item) => item.id === keyId)).toBe(false);

      const revoke = await host.app.fetch(req("DELETE", `/me/deck-check-keys/${keyId}`));
      expect(revoke.status).toBe(204);
      const afterList = await host.app.fetch(req("GET", "/me/deck-check-keys"));
      const after = (
        (await readJson(afterList)) as { items: { id: string; revokedAt: string | null }[] }
      ).items;
      expect(after.find((item) => item.id === keyId)?.revokedAt).not.toBeNull();
    });

    it("mints an org key for an owner and 403s a non-member", async () => {
      const minted = await orgOwner.app.fetch(
        req("POST", `/organizations/${ORG_ID}/deck-check-keys`, { label: "Store register" }),
      );
      expect(minted.status).toBe(201);
      const keyId = ((await readJson(minted)) as { key: { id: string } }).key.id;

      const list = await orgOwner.app.fetch(req("GET", `/organizations/${ORG_ID}/deck-check-keys`));
      expect(
        ((await readJson(list)) as { items: { id: string }[] }).items.some((i) => i.id === keyId),
      ).toBe(true);

      const denied = await stranger.app.fetch(
        req("GET", `/organizations/${ORG_ID}/deck-check-keys`),
      );
      expect(denied.status).toBe(403);

      const deniedMint = await stranger.app.fetch(
        req("POST", `/organizations/${ORG_ID}/deck-check-keys`, { label: "Nope" }),
      );
      expect(deniedMint.status).toBe(403);

      const revoke = await orgOwner.app.fetch(
        req("DELETE", `/organizations/${ORG_ID}/deck-check-keys/${keyId}`),
      );
      expect(revoke.status).toBe(204);
    });
  });

  describe("resolveOrCreateParticipant (deck attach + match)", () => {
    // A fresh tournament: MEMBER/STRANGER already have participants in the
    // shared tournament, which would collide with the one-per-account index.
    let rpId = "";
    beforeAll(async () => {
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Resolve Participant Cup",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      rpId = ((await readJson(created)) as { id: string }).id;
    });

    it("creates a fresh walk-in when no account is given", async () => {
      const created = await repos.tournaments.resolveOrCreateParticipant({
        tournamentId: rpId,
        displayName: "Fresh Walkin",
      });
      expect(created.displayName).toBe("Fresh Walkin");
      expect(created.userId).toBeNull();
      // Walk-ins are matched only by linked account, never by name or email.
      const again = await repos.tournaments.resolveOrCreateParticipant({
        tournamentId: rpId,
        displayName: "Another Walkin",
      });
      expect(again.id).not.toBe(created.id);
    });

    it("matches an existing participant by linked account", async () => {
      const seeded = await repos.tournaments.createParticipant({
        tournamentId: rpId,
        displayName: "Account Holder",
        userId: MEMBER_ID,
        status: "active",
      });
      const resolved = await repos.tournaments.resolveOrCreateParticipant({
        tournamentId: rpId,
        userId: MEMBER_ID,
        displayName: "ignored",
      });
      expect(resolved.id).toBe(seeded.id);
    });

    it("creates a new linked participant when the account has no existing spot", async () => {
      const resolved = await repos.tournaments.resolveOrCreateParticipant({
        tournamentId: rpId,
        userId: STRANGER_ID,
        displayName: "New Linked",
        claimSource: "self_submit",
      });
      expect(resolved.userId).toBe(STRANGER_ID);
      expect(resolved.displayName).toBe("New Linked");
    });
  });

  describe("group tournament lens", () => {
    it("lists the group's tournaments for a member and 404s a non-member", async () => {
      const ok = await member.app.fetch(req("GET", `/friend-groups/${GROUP_SLUG}/tournaments`));
      expect(ok.status).toBe(200);
      const items = ((await readJson(ok)) as { items: { id: string }[] }).items;
      expect(items.some((item) => item.id === tournamentId)).toBe(true);

      const denied = await stranger.app.fetch(
        req("GET", `/friend-groups/${GROUP_SLUG}/tournaments`),
      );
      expect(denied.status).toBe(404);
    });
  });

  // The happy transitions live in "tournament-scoped judge API" above.
  describe("lifecycle transition guards", () => {
    const newSubmittedEntry = async (displayName: string): Promise<string> => {
      const participant = await repos.tournaments.createParticipant({
        tournamentId,
        displayName,
        status: "active",
      });
      const created = await judge.app.fetch(
        req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
          participantId: participant.id,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        }),
      );
      return ((await readJson(created)) as { entry: { id: string } }).entry.id;
    };
    const expectState = async (
      entry: string,
      body: Record<string, unknown>,
      status: number,
    ): Promise<void> => {
      const res = await judge.app.fetch(
        req("PUT", `/tournaments/${tournamentId}/deck-check/entries/${entry}/state`, body),
      );
      expect(res.status).toBe(status);
    };

    it("rejects approving an entry that is not submitted", async () => {
      const entry = await newSubmittedEntry("Guard Garen");
      await expectState(entry, { state: "approved" }, 200);
      await expectState(entry, { state: "approved" }, 409);
    });

    it("rejects checking an entry that has not been approved", async () => {
      const entry = await newSubmittedEntry("Guard Lux");
      await expectState(entry, { state: "checked", reviewOutcome: "ok" }, 409);
    });

    it("requires a review outcome to mark an approved entry checked", async () => {
      const entry = await newSubmittedEntry("Guard Yi");
      await expectState(entry, { state: "approved" }, 200);
      await expectState(entry, { state: "checked" }, 422);
    });

    it("locks a withdrawn entry to everything but the restore to submitted", async () => {
      const entry = await newSubmittedEntry("Guard Annie");
      await expectState(entry, { state: "withdrawn" }, 200);
      await expectState(entry, { state: "approved" }, 409);
      await expectState(entry, { state: "submitted" }, 200);
    });
  });

  describe("manual entry validation", () => {
    it("rejects an unknown deck section with 422", async () => {
      const participant = await repos.tournaments.createParticipant({
        tournamentId,
        displayName: "Section Sona",
        status: "active",
      });
      const res = await judge.app.fetch(
        req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
          participantId: participant.id,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "bogus-zone" }],
        }),
      );
      expect(res.status).toBe(422);
    });

    it("rejects adding a deck to an archived tournament with 409", async () => {
      // status completed maps to the deck-check event's "archived".
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Archived Cup",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      const archivedId = ((await readJson(created)) as { id: string }).id;
      await repos.tournaments.addStaff(archivedId, JUDGE_ID, "judge");
      const participant = await repos.tournaments.createParticipant({
        tournamentId: archivedId,
        displayName: "Late Lee",
        status: "active",
      });
      await repos.tournaments.updateSettings(archivedId, { status: "completed" });

      const res = await judge.app.fetch(
        req("POST", `/tournaments/${archivedId}/deck-check/entries`, {
          participantId: participant.id,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        }),
      );
      expect(res.status).toBe(409);
    });
  });

  describe("on-site repair", () => {
    const fetchCards = async (entry: string): Promise<CardLine[]> => {
      const res = await host.app.fetch(
        req("GET", `/tournaments/${tournamentId}/deck-check/entries/${entry}`),
      );
      return ((await readJson(res)) as { cards: CardLine[] }).cards;
    };
    const newEntry = async (
      displayName: string,
      cards: { name: string; quantity: number; section: string }[],
    ): Promise<string> => {
      const participant = await repos.tournaments.createParticipant({
        tournamentId,
        displayName,
        status: "active",
      });
      const created = await judge.app.fetch(
        req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
          participantId: participant.id,
          cards,
        }),
      );
      return ((await readJson(created)) as { entry: { id: string } }).entry.id;
    };

    it("splits a multi-copy line on a partial move, merging into the target zone", async () => {
      const entry = await newEntry("Repair Riven", [
        { name: CARD_FURY_UNIT.name, quantity: 3, section: "main" },
        { name: CARD_FURY_UNIT.name, quantity: 1, section: "sideboard" },
      ]);
      const created = await fetchCards(entry);
      const mainLine = created.find((card) => card.zone === "main")!;
      const res = await judge.app.fetch(
        req(
          "PATCH",
          `/tournaments/${tournamentId}/deck-check/entries/${entry}/cards/${mainLine.id}`,
          { name: CARD_FURY_UNIT.name, section: "sideboard", copies: 2 },
        ),
      );
      expect(res.status).toBe(200);
      const after = await fetchCards(entry);
      expect(after).toHaveLength(2);
      expect(after.find((card) => card.zone === "main")?.quantity).toBe(1);
      expect(after.find((card) => card.zone === "sideboard")?.quantity).toBe(3);
    });

    it("splices the removed copy's tick, keeping the other cells", async () => {
      const entry = await newEntry("Repair Sona", [
        { name: CARD_FURY_UNIT.name, quantity: 3, section: "main" },
      ]);
      const initial = await fetchCards(entry);
      const line = initial[0]!;
      for (const copyIndex of [0, 2]) {
        await judge.app.fetch(
          req("PUT", `/tournaments/${tournamentId}/deck-check/entries/${entry}/cards/${line.id}`, {
            copyIndex,
            found: true,
          }),
        );
      }
      const res = await judge.app.fetch(
        req(
          "DELETE",
          `/tournaments/${tournamentId}/deck-check/entries/${entry}/cards/${line.id}/copies/1`,
        ),
      );
      expect(res.status).toBe(204);
      const afterRemoval = await fetchCards(entry);
      expect(afterRemoval[0]!.foundCopies).toEqual([true, true]);
    });

    it("applies only a currently-suggested zone fix, ignoring forged ids", async () => {
      const entry = await newEntry("Repair Ryze", [
        { name: CARD_FURY_RUNE.name, quantity: 1, section: "main" },
      ]);
      const beforeFix = await fetchCards(entry);
      const runeLine = beforeFix[0]!;
      const res = await judge.app.fetch(
        req("POST", `/tournaments/${tournamentId}/deck-check/entries/${entry}/zone-fixes`, {
          cardIds: [runeLine.id, "00000000-0000-7000-8000-000000000000"],
        }),
      );
      expect(res.status).toBe(200);
      const afterFix = await fetchCards(entry);
      expect(afterFix[0]!.zone).toBe("runes");
    });
  });

  describe("claim token exposure", () => {
    it("hides an entry's claim token once the spot is claimed", async () => {
      const participant = await repos.tournaments.createParticipant({
        tournamentId,
        displayName: "Claim Caitlyn",
        status: "active",
      });
      const created = await judge.app.fetch(
        req("POST", `/tournaments/${tournamentId}/deck-check/entries`, {
          participantId: participant.id,
          cards: [{ name: CARD_FURY_UNIT.name, quantity: 1, section: "main" }],
        }),
      );
      const entryId = ((await readJson(created)) as { entry: { id: string } }).entry.id;
      const entryToken = async (): Promise<string | null> => {
        const res = await host.app.fetch(
          req("GET", `/tournaments/${tournamentId}/deck-check/entries/${entryId}`),
        );
        return ((await readJson(res)) as { entry: { claimToken: string | null } }).entry.claimToken;
      };

      const token = await entryToken();
      expect(token).toBeTruthy();

      const claim = await stranger.app.fetch(req("POST", `/deck-check/claim/${token}`));
      expect(claim.status).toBe(200);

      expect(await entryToken()).toBeNull();
    });
  });
});
