import { afterAll, describe, expect, it } from "vitest";

import { META_ARCHIVE_USER_ID } from "../../repositories/meta.js";
import {
  adminReq,
  createTestContext,
  createUnauthenticatedTestContext,
  req,
  seedTestUser,
} from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

// ---------------------------------------------------------------------------
// Integration tests: meta archive routes (ADR-014).
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix mtr- / MTR for everything it creates. The user starts as a
// non-admin so the 403 cases run before promotion — the isAdmin cache only
// caches positive results, so a never-admin user always re-checks the DB.
// ---------------------------------------------------------------------------

const USER_ID = crypto.randomUUID();

const ctx = createTestContext(USER_ID);
const anonCtx = createUnauthenticatedTestContext();

const FORMAT = "freeform";

let legendCardId: string;
let mainCardId: string;
const createdEventIds: string[] = [];
const createdDeckIds: string[] = [];

/** @returns The inserted card's id. */
async function seedCard(name: string, normName: string, type: string): Promise<string> {
  const [card] = await ctx!.db
    .insertInto("cards")
    .values({ name, slug: normName, type, normName, keywords: [], tags: [] })
    .returning("id")
    .execute();
  return card.id;
}

/** @returns A create-event body with the given slug. */
function eventBody(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    name: `MTR ${slug}`,
    eventDate: "2026-08-01",
    format: FORMAT,
    playerCount: 32,
    organizer: "MTR Organizer",
    sourceUrl: "https://example.invalid/mtr",
    notes: "MTR notes",
    ...overrides,
  };
}

/** @returns A create-deck body attached to `eventId`. */
function deckBody(eventId: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId,
    name: "MTR Deck",
    format: FORMAT,
    cards: [
      { cardId: legendCardId, zone: "legend", quantity: 1 },
      { cardId: mainCardId, zone: "main", quantity: 3 },
    ],
    playerName: "MTR Pilot",
    finishTier: 1,
    record: "5-1",
    ...overrides,
  };
}

/**
 * Creates an event through the admin API and remembers it for teardown.
 * @returns The new event's id.
 */
async function createEvent(slug: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await ctx!.app.fetch(adminReq("POST", "/meta/events", eventBody(slug, overrides)));
  expect(res.status).toBe(201);
  const json = await readJson(res);
  createdEventIds.push(json.id);
  return json.id;
}

/**
 * Creates an archived deck through the admin API and remembers it for teardown.
 * @returns The new deck's id and share token.
 */
async function createDeck(
  eventId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ deckId: string; shareToken: string | null }> {
  const res = await ctx!.app.fetch(adminReq("POST", "/meta/decks", deckBody(eventId, overrides)));
  expect(res.status).toBe(201);
  const json = await readJson(res);
  createdDeckIds.push(json.deckId);
  return { deckId: json.deckId, shareToken: json.shareToken };
}

if (ctx) {
  const { db } = ctx;

  await seedTestUser(db, { id: USER_ID });
  legendCardId = await seedCard("MTR Legend", "mtr-legend", "legend");
  mainCardId = await seedCard("MTR Main", "mtr-main", "spell");

  afterAll(async () => {
    await db.deleteFrom("decks").where("id", "in", createdDeckIds).execute();
    await db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
    await db.deleteFrom("cards").where("id", "in", [legendCardId, mainCardId]).execute();
    // Takes the admins row and any deck this user owns with it.
    await db.deleteFrom("users").where("id", "=", USER_ID).execute();
  });
}

describe.skipIf(!ctx)("Meta archive routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  // ── Admin gating, before the user is promoted ─────────────────────────────

  describe("admin-only access control (non-admin)", () => {
    it("refuses the event list", async () => {
      const res = await app.fetch(adminReq("GET", "/meta/events"));
      expect(res.status).toBe(403);
    });

    it("refuses event creation", async () => {
      const res = await app.fetch(adminReq("POST", "/meta/events", eventBody("mtr-forbidden")));
      expect(res.status).toBe(403);
    });

    it("refuses deck creation", async () => {
      const res = await app.fetch(adminReq("POST", "/meta/decks", deckBody(crypto.randomUUID())));
      expect(res.status).toBe(403);
    });
  });

  describe("promote user to admin", () => {
    it("inserts the user into admins", async () => {
      await db.insertInto("admins").values({ userId: USER_ID }).execute();
    });
  });

  // ── Event curation ────────────────────────────────────────────────────────

  describe("POST /admin/meta/events", () => {
    it("creates an event and reports a zero deck count", async () => {
      const res = await app.fetch(adminReq("POST", "/meta/events", eventBody("mtr-create")));
      expect(res.status).toBe(201);
      const json = await readJson(res);
      createdEventIds.push(json.id);
      expect(json.slug).toBe("mtr-create");
      expect(json.eventDate).toBe("2026-08-01");
      expect(json.deckCount).toBe(0);
    });

    it("rejects a duplicate slug with 409", async () => {
      const res = await app.fetch(adminReq("POST", "/meta/events", eventBody("mtr-create")));
      expect(res.status).toBe(409);
    });

    it.each(["decks", "events", "stats", "new", "admin"])(
      "rejects the reserved slug %s",
      async (slug) => {
        const res = await app.fetch(adminReq("POST", "/meta/events", eventBody(slug)));
        expect(res.status).toBe(400);
      },
    );

    it("rejects a slug that isn't URL-safe", async () => {
      const res = await app.fetch(adminReq("POST", "/meta/events", eventBody("MTR Spaces")));
      expect(res.status).toBe(400);
    });

    it("rejects an unknown deck format", async () => {
      const res = await app.fetch(
        adminReq("POST", "/meta/events", eventBody("mtr-bad-format", { format: "mtr-nope" })),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /admin/meta/events/{id}", () => {
    it("applies a partial update", async () => {
      const eventId = await createEvent("mtr-patch");
      const res = await app.fetch(
        adminReq("PATCH", `/meta/events/${eventId}`, { name: "MTR Renamed", notes: null }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("metaEvents")
        .select(["name", "notes", "organizer"])
        .where("id", "=", eventId)
        .executeTakeFirstOrThrow();
      expect(row.name).toBe("MTR Renamed");
      expect(row.notes).toBeNull();
      expect(row.organizer).toBe("MTR Organizer");
    });

    it("rejects a rename onto another event's slug", async () => {
      const first = await createEvent("mtr-clash-one");
      await createEvent("mtr-clash-two");
      const res = await app.fetch(
        adminReq("PATCH", `/meta/events/${first}`, { slug: "mtr-clash-two" }),
      );
      expect(res.status).toBe(409);
    });

    it("allows a no-op rename onto its own slug", async () => {
      const eventId = await createEvent("mtr-self-rename");
      const res = await app.fetch(
        adminReq("PATCH", `/meta/events/${eventId}`, { slug: "mtr-self-rename" }),
      );
      expect(res.status).toBe(204);
    });

    it("404s for an unknown event", async () => {
      const res = await app.fetch(
        adminReq("PATCH", `/meta/events/${crypto.randomUUID()}`, { name: "MTR Ghost" }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /admin/meta/events/{id}", () => {
    it("removes the event and the decks behind it", async () => {
      const eventId = await createEvent("mtr-delete");
      const { deckId } = await createDeck(eventId);

      const res = await app.fetch(adminReq("DELETE", `/meta/events/${eventId}`));
      expect(res.status).toBe(204);

      const decks = await db.selectFrom("decks").select("id").where("id", "=", deckId).execute();
      expect(decks).toHaveLength(0);
    });

    it("404s for an unknown event", async () => {
      const res = await app.fetch(adminReq("DELETE", `/meta/events/${crypto.randomUUID()}`));
      expect(res.status).toBe(404);
    });
  });

  // ── Deck curation ─────────────────────────────────────────────────────────

  describe("POST /admin/meta/decks", () => {
    it("mints the deck under the synthetic owner, public, with a token", async () => {
      const eventId = await createEvent("mtr-deck-owner");
      const { deckId, shareToken } = await createDeck(eventId);

      const deck = await db
        .selectFrom("decks")
        .select(["userId", "isPublic", "shareToken"])
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(deck.userId).toBe(META_ARCHIVE_USER_ID);
      expect(deck.isPublic).toBe(true);
      expect(deck.shareToken).toBe(shareToken);
    });

    it("404s when the event doesn't exist", async () => {
      const res = await app.fetch(adminReq("POST", "/meta/decks", deckBody(crypto.randomUUID())));
      expect(res.status).toBe(404);
    });

    it("rejects an empty card list", async () => {
      const eventId = await createEvent("mtr-empty-cards");
      const res = await app.fetch(
        adminReq("POST", "/meta/decks", deckBody(eventId, { cards: [] })),
      );
      expect(res.status).toBe(400);
    });

    it("rejects a finish tier outside the bounds", async () => {
      const eventId = await createEvent("mtr-bad-finish");
      const res = await app.fetch(
        adminReq("POST", "/meta/decks", deckBody(eventId, { finishTier: 0 })),
      );
      expect(res.status).toBe(400);
    });

    it("mints an archetype with no permalink at all", async () => {
      const eventId = await createEvent("mtr-archetype");
      const { deckId, shareToken } = await createDeck(eventId, {
        listStatus: "archetype",
        cards: [{ cardId: legendCardId, zone: "legend", quantity: 1 }],
      });
      expect(shareToken).toBeNull();

      const deck = await db
        .selectFrom("decks")
        .select(["isPublic", "shareToken"])
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();
      // Public, because it still shows in listings; token-less, because there
      // is no page for it to address.
      expect(deck.isPublic).toBe(true);
      expect(deck.shareToken).toBeNull();

      const satellite = await db
        .selectFrom("metaDecks")
        .select("listStatus")
        .where("deckId", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.listStatus).toBe("archetype");
    });

    it("gives a partial list a permalink, since its main deck is there", async () => {
      const eventId = await createEvent("mtr-partial");
      const { deckId, shareToken } = await createDeck(eventId, { listStatus: "partial" });
      // The missing battlefields cost it nothing: only 'archetype' withholds
      // the token.
      expect(shareToken).not.toBeNull();

      const satellite = await db
        .selectFrom("metaDecks")
        .select("listStatus")
        .where("deckId", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.listStatus).toBe("partial");
    });

    it("defaults an unstated status to a full list", async () => {
      const eventId = await createEvent("mtr-default-status");
      const { deckId } = await createDeck(eventId);

      const satellite = await db
        .selectFrom("metaDecks")
        .select("listStatus")
        .where("deckId", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.listStatus).toBe("full");
    });

    it("rejects a status outside the vocabulary", async () => {
      const eventId = await createEvent("mtr-bad-status");
      const res = await app.fetch(
        adminReq("POST", "/meta/decks", deckBody(eventId, { listStatus: "mostly" })),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /admin/meta/events/{id}/decks", () => {
    it("lists the event's decks best finish first", async () => {
      const eventId = await createEvent("mtr-event-decks");
      await createDeck(eventId, { playerName: "MTR Second", finishTier: 4 });
      await createDeck(eventId, { playerName: "MTR First", finishTier: 1 });

      const res = await app.fetch(adminReq("GET", `/meta/events/${eventId}/decks`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.decks.map((deck: { playerName: string }) => deck.playerName)).toEqual([
        "MTR First",
        "MTR Second",
      ]);
      expect(json.decks[0].cardCount).toBe(4);
    });

    it("404s for an unknown event", async () => {
      const res = await app.fetch(adminReq("GET", `/meta/events/${crypto.randomUUID()}/decks`));
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH / DELETE /admin/meta/decks/{id}", () => {
    it("updates the placement and replaces the cards", async () => {
      const eventId = await createEvent("mtr-deck-patch");
      const { deckId } = await createDeck(eventId);

      const res = await app.fetch(
        adminReq("PATCH", `/meta/decks/${deckId}`, {
          playerName: "MTR Updated",
          finishTier: 8,
          cards: [{ cardId: mainCardId, zone: "main", quantity: 1 }],
        }),
      );
      expect(res.status).toBe(204);

      const satellite = await db
        .selectFrom("metaDecks")
        .select(["playerName", "finishTier"])
        .where("deckId", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.playerName).toBe("MTR Updated");
      expect(satellite.finishTier).toBe(8);

      const cards = await db
        .selectFrom("deckCards")
        .select("cardId")
        .where("deckId", "=", deckId)
        .execute();
      expect(cards).toEqual([{ cardId: mainCardId }]);
    });

    it("mints the permalink when the real list finally arrives", async () => {
      const eventId = await createEvent("mtr-fill-in");
      const { deckId } = await createDeck(eventId, {
        listStatus: "archetype",
        cards: [{ cardId: legendCardId, zone: "legend", quantity: 1 }],
      });

      const res = await app.fetch(
        adminReq("PATCH", `/meta/decks/${deckId}`, {
          listStatus: "full",
          cards: [
            { cardId: legendCardId, zone: "legend", quantity: 1 },
            { cardId: mainCardId, zone: "main", quantity: 3 },
          ],
        }),
      );
      expect(res.status).toBe(204);

      const deck = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(deck.shareToken).not.toBeNull();

      const satellite = await db
        .selectFrom("metaDecks")
        .select("listStatus")
        .where("deckId", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.listStatus).toBe("full");
    });

    it("mints the permalink for a promotion to partial too", async () => {
      // Only 'archetype' withholds the token, so the archetype-to-partial move
      // has to mint it just like archetype-to-full does.
      const eventId = await createEvent("mtr-fill-partial");
      const { deckId } = await createDeck(eventId, {
        listStatus: "archetype",
        cards: [{ cardId: legendCardId, zone: "legend", quantity: 1 }],
      });

      const res = await app.fetch(
        adminReq("PATCH", `/meta/decks/${deckId}`, {
          listStatus: "partial",
          cards: [
            { cardId: legendCardId, zone: "legend", quantity: 1 },
            { cardId: mainCardId, zone: "main", quantity: 3 },
          ],
        }),
      );
      expect(res.status).toBe(204);

      const deck = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(deck.shareToken).not.toBeNull();
    });

    it("keeps the permalink stable across a second promotion", async () => {
      const eventId = await createEvent("mtr-fill-twice");
      const { deckId } = await createDeck(eventId, {
        listStatus: "archetype",
        cards: [{ cardId: legendCardId, zone: "legend", quantity: 1 }],
      });

      const patch = () =>
        app.fetch(adminReq("PATCH", `/meta/decks/${deckId}`, { listStatus: "full" }));
      const firstRes = await patch();
      expect(firstRes.status).toBe(204);
      const first = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();

      // A second flip must not rotate the token — links already published to
      // the filled-in deck have to keep working.
      const secondRes = await patch();
      expect(secondRes.status).toBe(204);
      const second = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(second.shareToken).toBe(first.shareToken);
    });

    it("deletes an archived deck", async () => {
      const eventId = await createEvent("mtr-deck-delete");
      const { deckId } = await createDeck(eventId);

      const res = await app.fetch(adminReq("DELETE", `/meta/decks/${deckId}`));
      expect(res.status).toBe(204);

      const again = await app.fetch(adminReq("DELETE", `/meta/decks/${deckId}`));
      expect(again.status).toBe(404);
    });
  });

  // ── Share-token rotation guard ────────────────────────────────────────────

  describe("POST /decks/{id}/share/rotate", () => {
    it("refuses to rotate an archived deck's permalink", async () => {
      const eventId = await createEvent("mtr-rotate");

      // Production can't reach this state: an archive deck is owned by the
      // synthetic user, which has no session, so the owner-scoped rotate never
      // matches one. Attaching a satellite row to *this* user's deck is the
      // only way to exercise the guard itself.
      const [deck] = await db
        .insertInto("decks")
        .values({
          userId: USER_ID,
          name: "MTR Guarded",
          description: null,
          format: FORMAT,
          formatConfig: null,
          isPublic: true,
          shareToken: "mtrGuard0001",
        })
        .returning("id")
        .execute();
      await db
        .insertInto("metaDecks")
        .values({
          deckId: deck.id,
          metaEventId: eventId,
          playerName: "MTR Guard",
          finishTier: 1,
          record: null,
        })
        .execute();

      const res = await app.fetch(req("POST", `/decks/${deck.id}/share/rotate`));
      expect(res.status).toBe(409);

      const after = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", deck.id)
        .executeTakeFirstOrThrow();
      expect(after.shareToken).toBe("mtrGuard0001");
    });

    it("still rotates a deck outside the archive", async () => {
      const [deck] = await db
        .insertInto("decks")
        .values({
          userId: USER_ID,
          name: "MTR Rotatable",
          description: null,
          format: FORMAT,
          formatConfig: null,
          isPublic: true,
          shareToken: "mtrRotate001",
        })
        .returning("id")
        .execute();

      const res = await app.fetch(req("POST", `/decks/${deck.id}/share/rotate`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.shareToken).not.toBe("mtrRotate001");
    });
  });
});

// ---------------------------------------------------------------------------
// Public reads, from a request with no session at all.
// ---------------------------------------------------------------------------

describe.skipIf(!ctx || !anonCtx)("Meta archive public reads (anonymous)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const anonApp = anonCtx!.app;

  it("renders the event list", async () => {
    const eventId = await createEvent("mtr-public-list");
    await createDeck(eventId);

    const res = await anonApp.fetch(req("GET", "/meta/events"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const event = json.events.find((row: { slug: string }) => row.slug === "mtr-public-list");
    expect(event.deckCount).toBe(1);
    expect(event.eventDate).toBe("2026-08-01");
    // The long-form fields belong to the detail shape only.
    expect(event.notes).toBeUndefined();
  });

  it("renders one event with its decks", async () => {
    const eventId = await createEvent("mtr-public-event");
    await createDeck(eventId, { playerName: "MTR Anon", finishTier: 2, record: "4-2" });

    const res = await anonApp.fetch(req("GET", "/meta/events/mtr-public-event"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.event.id).toBe(eventId);
    expect(json.event.notes).toBe("MTR notes");
    expect(json.decks).toHaveLength(1);
    expect(json.decks[0].playerName).toBe("MTR Anon");
    expect(json.decks[0].legendName).toBe("MTR Legend");
    expect(json.decks[0].event.slug).toBe("mtr-public-event");
  });

  it("404s an unknown event slug", async () => {
    const res = await anonApp.fetch(req("GET", "/meta/events/mtr-no-such-event"));
    expect(res.status).toBe(404);
  });

  it("renders the cross-event deck browser", async () => {
    const eventId = await createEvent("mtr-public-decks");
    const { shareToken } = await createDeck(eventId, { playerName: "MTR Browser" });

    const res = await anonApp.fetch(req("GET", "/meta/decks"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const deck = json.decks.find((row: { shareToken: string }) => row.shareToken === shareToken);
    expect(deck.playerName).toBe("MTR Browser");
  });

  it("renders one archived deck with its event panel", async () => {
    const eventId = await createEvent("mtr-public-deck");
    const { shareToken } = await createDeck(eventId, {
      playerName: "MTR Detail",
      finishTier: 4,
      record: "3-3",
    });

    const res = await anonApp.fetch(req("GET", `/meta/decks/${shareToken}`));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.deck.name).toBe("MTR Deck");
    expect(json.cards).toHaveLength(2);
    expect(json.meta).toEqual({
      event: {
        slug: "mtr-public-deck",
        name: "MTR mtr-public-deck",
        eventDate: "2026-08-01",
        format: FORMAT,
      },
      playerName: "MTR Detail",
      finishTier: 4,
      record: "3-3",
    });
  });

  it("404s a share token that belongs to a deck outside the archive", async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
    await ctx!.db
      .insertInto("decks")
      .values({
        userId: USER_ID,
        name: "MTR Regular Share",
        description: null,
        format: FORMAT,
        formatConfig: null,
        isPublic: true,
        shareToken: "mtrOutside01",
      })
      .execute();

    // The same token resolves fine on the ordinary share endpoint...
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
    const share = await anonCtx!.app.fetch(req("GET", "/decks/share/mtrOutside01"));
    expect(share.status).toBe(200);
    // ...but must not render as an archive entry.
    const res = await anonApp.fetch(req("GET", "/meta/decks/mtrOutside01"));
    expect(res.status).toBe(404);
  });

  it("lists an archetype with no token for the browser to link", async () => {
    const eventId = await createEvent("mtr-public-archetype");
    await createDeck(eventId, {
      playerName: "MTR Archetype",
      listStatus: "archetype",
      cards: [{ cardId: legendCardId, zone: "legend", quantity: 1 }],
    });

    const res = await anonApp.fetch(req("GET", "/meta/events/mtr-public-archetype"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.decks).toHaveLength(1);
    // Enough to render a tile, not enough to click one.
    expect(json.decks[0].listStatus).toBe("archetype");
    expect(json.decks[0].shareToken).toBeNull();
    expect(json.decks[0].legendName).toBe("MTR Legend");
  });

  it("404s a token that somehow resolves to an archetype", async () => {
    const eventId = await createEvent("mtr-archetype-token");
    const { deckId } = await createDeck(eventId, {
      listStatus: "archetype",
      cards: [{ cardId: legendCardId, zone: "legend", quantity: 1 }],
    });

    // Nothing in the API mints this token; the guard exists for a hand-edited
    // row, so the only way to exercise it is to hand-edit one.
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
    await ctx!.db
      .updateTable("decks")
      .set({ shareToken: "mtrArchety01" })
      .where("id", "=", deckId)
      .execute();

    const res = await anonApp.fetch(req("GET", "/meta/decks/mtrArchety01"));
    expect(res.status).toBe(404);
  });

  it("renders a partial list's page like any other", async () => {
    const eventId = await createEvent("mtr-public-partial");
    const { shareToken } = await createDeck(eventId, {
      playerName: "MTR Partial",
      listStatus: "partial",
    });

    // The main deck is what the page shows, and a partial list has all of it.
    const res = await anonApp.fetch(req("GET", `/meta/decks/${shareToken}`));
    expect(res.status).toBe(200);
  });

  it("computes inclusion and legend play-rate against the scope", async () => {
    const inScope = await createEvent("mtr-stats-in", { eventDate: "2026-05-10" });
    const outOfScope = await createEvent("mtr-stats-out", { eventDate: "2026-02-10" });
    await createDeck(inScope, { playerName: "MTR Stats A" });
    await createDeck(inScope, { playerName: "MTR Stats B" });
    await createDeck(outOfScope, { playerName: "MTR Stats C" });

    const res = await anonApp.fetch(
      req("GET", "/meta/stats?dateFrom=2026-05-01&dateTo=2026-05-31"),
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.totalDecks).toBe(2);

    const legend = json.legends.find((row: { cardId: string }) => row.cardId === legendCardId);
    expect(legend.deckCount).toBe(2);
    expect(legend.name).toBe("MTR Legend");

    const main = json.cards.find((row: { cardId: string }) => row.cardId === mainCardId);
    expect(main.deckCount).toBe(2);
    // The main-deck card is not a legend, so it appears in cards only.
    expect(json.legends.some((row: { cardId: string }) => row.cardId === mainCardId)).toBe(false);
    // And the inverse: "most played cards" counts the main deck, so the legend
    // stays out of it.
    expect(json.cards.some((row: { cardId: string }) => row.cardId === legendCardId)).toBe(false);
  });

  it("reports two denominators so the card panel isn't deflated by archetypes", async () => {
    const eventId = await createEvent("mtr-stats-archetype", { eventDate: "2026-04-10" });
    await createDeck(eventId, { playerName: "MTR Full" });
    // A partial list's main deck is complete, so it belongs on the card side
    // with the full one. Only the archetype drops out.
    await createDeck(eventId, { playerName: "MTR Partial", listStatus: "partial" });
    await createDeck(eventId, {
      playerName: "MTR Archetype",
      listStatus: "archetype",
      cards: [{ cardId: legendCardId, zone: "legend", quantity: 1 }],
    });

    const res = await anonApp.fetch(
      req("GET", "/meta/stats?dateFrom=2026-04-01&dateTo=2026-04-30"),
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    // Every deck counts as a deck; two of the three have a main deck.
    expect(json.totalDecks).toBe(3);
    expect(json.decksWithMainDeck).toBe(2);

    // The legend is real data on all three, so the play-rate axis sees them all.
    const legend = json.legends.find((row: { cardId: string }) => row.cardId === legendCardId);
    expect(legend.deckCount).toBe(3);

    // The main-deck card is in the two known main decks, and its count reads
    // against decksWithMainDeck rather than totalDecks.
    const main = json.cards.find((row: { cardId: string }) => row.cardId === mainCardId);
    expect(main.deckCount).toBe(2);
  });

  it("refuses an anonymous write to the admin surface", async () => {
    // No session at all, so the admin mount stops the request before the
    // role check ever runs.
    const res = await anonApp.fetch(adminReq("POST", "/meta/events", eventBody("mtr-anon-write")));
    expect(res.status).toBe(401);
  });
});
