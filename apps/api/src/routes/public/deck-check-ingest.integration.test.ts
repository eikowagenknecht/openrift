import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos } from "../../deps.js";
import { CARD_FURY_UNIT } from "../../test/fixtures/constants.js";
import {
  createTestContext,
  refreshCardAggregates,
  req,
  syncCardCardTypes,
} from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

// Fresh ids, not in run-integration.ts's TEST_USERS registry: the suite seeds
// its own users (like the deck-check-player suite) so the FK targets exist.
const OWNER_ID = crypto.randomUUID();
const JUDGE_ID = crypto.randomUUID();

const GROUP_SLUG = "deck-check-ingest-itest";

const ownerCtx = createTestContext(OWNER_ID);
const judgeCtx = createTestContext(JUDGE_ID);

/**
 * Builds an ingest push request authenticated with a Bearer push key.
 * @param token The push key, or `null` to omit the Authorization header.
 * @param body The push payload.
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

/**
 * A push entry built from the default single-card list, with overrides applied.
 * @param overrides Fields to override on the default entry.
 * @returns A provider push entry payload.
 */
function entryPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    externalId: "entry-1",
    playerName: "A. Player",
    cards: [{ name: CARD_FURY_UNIT.name, quantity: 3, section: "main" }],
    ...overrides,
  };
}

/**
 * Restored coverage for the deck-check INGEST push pipeline on the ADR-033
 * tournament-scoped surface. The ingest endpoint is unchanged, but its old
 * driving calls (group-scoped event/key CRUD) were removed; this suite re-points
 * setup at the live host-scoped key mint (`/me/deck-check-keys`) and the
 * tournament-scoped judge API (`/tournaments/{id}/deck-check/...`). The group
 * CRUD / authz cases the original file also covered are tested elsewhere now.
 */
describe.skipIf(!ownerCtx)("deck-check ingest push (integration, ADR-033)", () => {
  // oxlint-disable typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ownerCtx!;
  const ownerApp = ownerCtx!.app;
  const judgeApp = judgeCtx!.app;
  // oxlint-enable typescript/no-non-null-assertion
  const repos = createRepos(db);

  let groupId: string;
  let eventId: string;
  let pushToken: string;
  const ambiguousCardIds: string[] = [];

  /**
   * Pushes entries into the suite's tournament with the suite's host key.
   * @param entries The entries to push.
   * @returns The ingest response.
   */
  async function push(entries: Record<string, unknown>[]): Promise<Response> {
    return await ownerApp.fetch(ingestReq(pushToken, { tournamentId: eventId, entries }));
  }

  /**
   * Inserts a test user if missing.
   * @param userId The user id.
   * @param email The user email.
   * @returns A promise that resolves once the row exists.
   */
  async function createUser(userId: string, email: string): Promise<void> {
    await db
      .insertInto("users")
      .values({
        id: userId,
        email,
        name: `User ${userId.slice(14, 18)}`,
        emailVerified: true,
        image: null,
      })
      .execute();
  }

  beforeAll(async () => {
    await createUser(OWNER_ID, `test-${OWNER_ID}@test.com`);
    await createUser(JUDGE_ID, `test-${JUDGE_ID}@test.com`);

    const group = await repos.friendGroups.createWithOwner(
      { slug: GROUP_SLUG, name: "Ingest Test Group", description: null, code: null },
      OWNER_ID,
    );
    groupId = group.id;

    // The deck-check tournament is hosted by the group owner; the judge gets the
    // per-tournament `judge` staff role so the tournament-scoped judge API admits
    // them (ADR-033).
    // A deck-check tournament is created through the umbrella tournament CRUD and
    // sits in `setup` until round 1 is generated. When OpenRift is used only for
    // deck check (no pairings) it stays in `setup`, and pushes must still land.
    const event = await repos.tournaments.create({
      hostType: "user",
      hostUserId: OWNER_ID,
      groupId,
      name: "Ingest Cup",
      startsAt: new Date("2026-06-20"),
      pairingStyle: "none",
      deckSubmission: "optional",
    });
    eventId = event.id;
    await repos.tournaments.addStaff(eventId, JUDGE_ID, "judge");

    // Host-scoped push key (ADR-033): the host (the owner) mints the integration
    // key the provider push authenticates with. The plaintext token ships once.
    const keyRes = await ownerApp.fetch(
      req("POST", "/me/deck-check-keys", { label: "ingest-itest" }),
    );
    expect(keyRes.status).toBe(201);
    const minted = (await readJson(keyRes)) as { token: string; key: { tokenPrefix: string } };
    expect(minted.token.startsWith("orpk_")).toBe(true);
    expect(minted.token.startsWith(minted.key.tokenPrefix)).toBe(true);
    pushToken = minted.token;

    // Two cards sharing a name make a name lookup ambiguous.
    for (const slug of ["dc-ingest-ambiguous-a", "dc-ingest-ambiguous-b"]) {
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
    // Resolution ranks against the catalog index, which reads through
    // `mv_card_aggregates`. A bare insert is invisible to it until the junction
    // is mirrored and the view is refreshed, exactly as it is to the catalog.
    await syncCardCardTypes(db);
    await refreshCardAggregates(db);
  });

  afterAll(async () => {
    await db.deleteFrom("friendGroups").where("id", "=", groupId).execute();
    await syncCardCardTypes(db);
    if (ambiguousCardIds.length > 0) {
      await db.deleteFrom("cards").where("id", "in", ambiguousCardIds).execute();
    }
    await db.deleteFrom("users").where("id", "in", [OWNER_ID, JUDGE_ID]).execute();
  });

  it("rejects a missing or unknown key with 401", async () => {
    const missing = await ownerApp.fetch(ingestReq(null, { tournamentId: eventId, entries: [] }));
    expect(missing.status).toBe(401);
    const unknown = await ownerApp.fetch(
      ingestReq("orpk_wrong", { tournamentId: eventId, entries: [] }),
    );
    expect(unknown.status).toBe(401);
  });

  it("stops authenticating a key once it is revoked", async () => {
    // A throwaway key, so revoking it leaves the suite's main pushToken intact.
    const mint = await ownerApp.fetch(req("POST", "/me/deck-check-keys", { label: "to-revoke" }));
    expect(mint.status).toBe(201);
    const minted = (await readJson(mint)) as { token: string; key: { id: string } };

    // It authenticates an (empty) push before revocation.
    const before = await ownerApp.fetch(
      ingestReq(minted.token, { tournamentId: eventId, entries: [] }),
    );
    expect(before.status).toBe(200);

    // Revoke it; the same token is now turned away at the door with 401.
    const revoke = await ownerApp.fetch(req("DELETE", `/me/deck-check-keys/${minted.key.id}`));
    expect(revoke.status).toBe(204);
    const after = await ownerApp.fetch(
      ingestReq(minted.token, { tournamentId: eventId, entries: [] }),
    );
    expect(after.status).toBe(401);
  });

  it("rejects an unknown tournament id with 404 (pushes never create tournaments)", async () => {
    const res = await ownerApp.fetch(
      ingestReq(pushToken, {
        tournamentId: "a0000000-0000-4000-a000-00000000dead",
        entries: [entryPayload()],
      }),
    );
    expect(res.status).toBe(404);
  });

  it("creates entries on first push and upserts them by externalId", async () => {
    const first = await push([entryPayload()]);
    expect(first.status).toBe(200);
    const firstResult = (await readJson(first)) as { tournamentId: string; entriesCreated: number };
    expect(firstResult.tournamentId).toBe(eventId);
    expect(firstResult.entriesCreated).toBe(1);

    const second = await push([entryPayload()]);
    const secondResult = (await readJson(second)) as {
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
    const body = (await readJson(res)) as { message: string };
    expect(body.message).toContain("commander");

    const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-bad-section");
    expect(entry).toBeUndefined();
  });

  it("invalidates a checked entry when the list changes, and not on an identical re-push", async () => {
    // A dedicated entry keeps this case independent of the upsert test above.
    await push([entryPayload({ externalId: "entry-check", playerName: "C. Hecked" })]);
    const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-check");

    // Judge approves the list, ticks a card, and marks the entry checked.
    const approveRes = await judgeApp.fetch(
      req("PUT", `/tournaments/${eventId}/deck-check/entries/${entry!.id}/state`, {
        state: "approved",
      }),
    );
    expect(approveRes.status).toBe(200);
    const cards = await repos.deckCheck.listCardsForEntry(entry!.id);
    const tickRes = await judgeApp.fetch(
      req("PUT", `/tournaments/${eventId}/deck-check/entries/${entry!.id}/cards/${cards[0]!.id}`, {
        copyIndex: 0,
        found: true,
      }),
    );
    expect(tickRes.status).toBe(204);
    const verdictRes = await judgeApp.fetch(
      req("PUT", `/tournaments/${eventId}/deck-check/entries/${entry!.id}/state`, {
        state: "checked",
        reviewOutcome: "ok",
        notes: "clean",
      }),
    );
    expect(verdictRes.status).toBe(200);

    // Identical re-push: the check verdict is untouched.
    await push([entryPayload({ externalId: "entry-check", playerName: "C. Hecked" })]);
    let reloaded = await repos.deckCheck.getEntryByExternalId(eventId, "entry-check");
    expect(reloaded?.state).toBe("checked");
    expect(reloaded?.reviewOutcome).toBe("ok");
    expect(reloaded?.checkedBy).toBe(JUDGE_ID);

    // Changed list: back to submitted, ticks reset, change summary stored.
    await push([
      entryPayload({
        externalId: "entry-check",
        playerName: "C. Hecked",
        cards: [{ name: CARD_FURY_UNIT.name, quantity: 2, section: "main" }],
      }),
    ]);
    reloaded = await repos.deckCheck.getEntryByExternalId(eventId, "entry-check");
    expect(reloaded?.state).toBe("submitted");
    expect(reloaded?.reviewOutcome).toBeNull();
    expect(reloaded?.checkedBy).toBeNull();
    expect(reloaded?.checkedAt).toBeNull();
    expect(reloaded?.changeSummary?.changed).toHaveLength(1);
    const newCards = await repos.deckCheck.listCardsForEntry(entry!.id);
    expect(newCards.every((card) => !card.foundCopies.some(Boolean))).toBe(true);

    // A tick against one of the replaced (now deleted) card rows is a 409.
    const staleTick = await judgeApp.fetch(
      req("PUT", `/tournaments/${eventId}/deck-check/entries/${entry!.id}/cards/${cards[0]!.id}`, {
        copyIndex: 0,
        found: true,
      }),
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

  it("stores all three consent flags, defaults to allowed, and keeps them on a flagless re-push", async () => {
    // Omitted flags on a fresh entry fall back to the column default (true).
    await push([entryPayload({ externalId: "entry-consent" })]);
    let entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-consent");
    expect(entry?.allowDeckPublishing).toBe(true);
    expect(entry?.allowNameSharing).toBe(true);
    expect(entry?.allowRiotIdSharing).toBe(true);

    // Explicit refusals all land — including the per-field name / Riot-ID flags.
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

    // A flagless re-push is no statement: every stored refusal survives.
    await push([entryPayload({ externalId: "entry-consent" })]);
    entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-consent");
    expect(entry?.allowDeckPublishing).toBe(false);
    expect(entry?.allowNameSharing).toBe(false);
    expect(entry?.allowRiotIdSharing).toBe(false);
  });

  it("accepts pushes while the tournament is still in setup (pre-start submission)", async () => {
    // Decks are handed in before the event starts, so a `setup` tournament (the
    // default a wizard-created deck-check tournament sits in) is a valid push
    // window. Regression: `setup` used to map to `archived` and 409.
    await repos.tournaments.updateSettings(eventId, { status: "setup" });
    const res = await push([]);
    expect(res.status).toBe(200);
  });

  it("rejects pushes to a completed or cancelled tournament with 409", async () => {
    // Only a finished/called-off tournament maps to the deck-check `archived`
    // state, which the ingest pipeline refuses (ADR-033).
    for (const status of ["completed", "cancelled"] as const) {
      await repos.tournaments.updateSettings(eventId, { status });
      const res = await push([]);
      expect(res.status).toBe(409);
    }
    // Restore the shared fixture to its pushable state for later tests.
    await repos.tournaments.updateSettings(eventId, { status: "setup" });
  });

  it("re-resolves unmatched lines once the card exists in the catalog", async () => {
    const inserted = await db
      .insertInto("cards")
      .values({
        slug: "dc-ingest-late-addition",
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
    // The card enters the catalog (and so the resolver's index) only once the
    // junction is mirrored and the aggregates view is refreshed.
    await syncCardCardTypes(db);
    await refreshCardAggregates(db);

    try {
      const res = await judgeApp.fetch(
        req("POST", `/tournaments/${eventId}/deck-check/re-resolve`),
      );
      expect(res.status).toBe(200);
      const body = (await readJson(res)) as { updatedLines: number };
      expect(body.updatedLines).toBeGreaterThanOrEqual(1);

      const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-resolution");
      const cards = await repos.deckCheck.listCardsForEntry(entry!.id);
      const lateCard = cards.find((card) => card.rawName === "Totally Unknown Card");
      expect(lateCard?.matchStatus).toBe("matched");
      expect(lateCard?.resolvedCardId).toBe(inserted.id);
      // Lifecycle state was untouched by re-resolution.
      expect(entry?.state).toBe("submitted");
    } finally {
      await db
        .updateTable("deckCheckEntryCards")
        .set({ resolvedCardId: null, resolvedPrintingId: null, matchStatus: "unmatched" })
        .where("resolvedCardId", "=", inserted.id)
        .execute();
      await syncCardCardTypes(db);
      await db.deleteFrom("cards").where("id", "=", inserted.id).execute();
    }
  });

  it("returns the entry detail with resolved cards, violations, and stats to a judge", async () => {
    // Give the tournament a format so the deck-rules run; the small list is
    // nowhere near a legal constructed deck, and its only card is from OGS while
    // only OGN is allowed, so an out-of-allowed-sets finding fires.
    await repos.tournaments.updateSettings(eventId, {
      deckFormat: "constructed",
      allowedSets: ["OGN"],
    });
    const entry = await repos.deckCheck.getEntryByExternalId(eventId, "entry-1");

    const res = await judgeApp.fetch(
      req("GET", `/tournaments/${eventId}/deck-check/entries/${entry!.id}`),
    );
    expect(res.status).toBe(200);
    const detail = (await readJson(res)) as {
      entry: { playerName: string };
      cards: { matchStatus: string; resolvedCardId: string | null }[];
      violations: { code: string }[];
      typeCounts: { cardType: string; count: number }[];
    };
    expect(detail.entry.playerName).toBe("A. Player");
    expect(detail.cards.some((card) => card.matchStatus === "matched")).toBe(true);
    expect(detail.cards.some((card) => card.resolvedCardId === CARD_FURY_UNIT.id)).toBe(true);
    expect(detail.violations.length).toBeGreaterThan(0);
    expect(detail.violations.some((violation) => violation.code === "out-of-allowed-sets")).toBe(
      true,
    );
    expect(detail.typeCounts.some((count) => count.cardType === "unit")).toBe(true);

    await repos.tournaments.updateSettings(eventId, { deckFormat: null, allowedSets: null });
  });

  it("removes a key only after it is revoked, and only its own host", async () => {
    const mint = await ownerApp.fetch(req("POST", "/me/deck-check-keys", { label: "to-remove" }));
    expect(mint.status).toBe(201);
    const keyId = ((await readJson(mint)) as { key: { id: string } }).key.id;

    // An active key cannot be removed — it must be revoked first.
    const tooEarly = await ownerApp.fetch(req("DELETE", `/me/deck-check-keys/${keyId}/permanent`));
    expect(tooEarly.status).toBe(404);

    const revoke = await ownerApp.fetch(req("DELETE", `/me/deck-check-keys/${keyId}`));
    expect(revoke.status).toBe(204);

    // A different account cannot remove this owner's key.
    const wrongHost = await judgeApp.fetch(req("DELETE", `/me/deck-check-keys/${keyId}/permanent`));
    expect(wrongHost.status).toBe(404);

    const remove = await ownerApp.fetch(req("DELETE", `/me/deck-check-keys/${keyId}/permanent`));
    expect(remove.status).toBe(204);

    // The row is gone from the list entirely (not just revoked).
    const list = await ownerApp.fetch(req("GET", "/me/deck-check-keys"));
    const items = ((await readJson(list)) as { items: { id: string }[] }).items;
    expect(items.some((item) => item.id === keyId)).toBe(false);
  });
});
