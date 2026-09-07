import { RESERVED_META_EVENT_SLUGS } from "@openrift/shared/contracts/admin/meta";
import { afterAll, describe, expect, it } from "vitest";

import { META_ARCHIVE_USER_ID } from "../../repositories/meta.js";
import {
  adminReq,
  createTestContext,
  createUnauthenticatedTestContext,
  refreshCardAggregates,
  req,
  seedTestUser,
  syncCardCardTypes,
} from "../../test/integration-context.js";
import { readJson } from "../../test/read-json.js";

// Uses prefix mtr- / MTR for everything it creates. The user starts as a
// non-admin so the 403 cases run before promotion — the isAdmin cache only
// caches positive results, so a never-admin user always re-checks the DB.

const USER_ID = crypto.randomUUID();

const ctx = createTestContext(USER_ID);
const anonCtx = createUnauthenticatedTestContext();

const FORMAT = "freeform";

let legendCardId: string;
let mainCardId: string;
const createdEventIds: string[] = [];
const createdDeckIds: string[] = [];

async function seedCard(name: string, normName: string, type: string): Promise<string> {
  const [card] = await ctx!.db
    .insertInto("cards")
    .values({ name, slug: normName, type, normName, keywords: [], tags: [] })
    .returning("id")
    .execute();
  return card!.id;
}

function eventBody(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    name: `MTR ${slug}`,
    eventDate: "2026-08-01",
    format: FORMAT,
    playerCount: 32,
    organizer: "MTR Organizer",
    // No `sourceUrl` field: attribution is the citation list.
    notes: "MTR notes",
    ...overrides,
  };
}

function listBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "MTR Deck",
    format: FORMAT,
    cards: [
      { cardId: legendCardId, zone: "legend", quantity: 1 },
      { cardId: mainCardId, zone: "main", quantity: 3 },
    ],
    ...overrides,
  };
}

function playerBody(eventId: string, overrides: Record<string, unknown> = {}) {
  return {
    eventId,
    playerName: "MTR Player",
    rank: 1,
    wins: 5,
    losses: 1,
    draws: 0,
    legendCardId,
    list: listBody(),
    ...overrides,
  };
}

async function createEvent(slug: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await ctx!.app.fetch(adminReq("POST", "/meta/events", eventBody(slug, overrides)));
  expect(res.status).toBe(201);
  const json = await readJson(res);
  createdEventIds.push(json.id);
  return json.id;
}

async function createPlayer(
  eventId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ playerId: string; deckId: string | null; shareToken: string | null }> {
  const res = await ctx!.app.fetch(
    adminReq("POST", "/meta/players", playerBody(eventId, overrides)),
  );
  expect(res.status).toBe(201);
  const json = await readJson(res);
  if (json.deckId !== null) {
    createdDeckIds.push(json.deckId);
  }
  return { playerId: json.metaEventPlayerId, deckId: json.deckId, shareToken: json.shareToken };
}

async function adminPlayers(eventId: string) {
  const res = await ctx!.app.fetch(adminReq("GET", `/meta/events/${eventId}/players`));
  expect(res.status).toBe(200);
  const json = await readJson(res);
  return json.players;
}

if (ctx) {
  const { db } = ctx;

  await seedTestUser(db, { id: USER_ID });
  legendCardId = await seedCard("MTR Legend", "mtr-legend", "legend");
  mainCardId = await seedCard("MTR Main", "mtr-main", "spell");
  // The public deck page enriches its card rows through mv_card_aggregates,
  // which the harness refreshed before these two cards existed. Without the
  // refresh the inner join drops them and the route 500s on the missing
  // enrichment.
  await syncCardCardTypes(db);
  await refreshCardAggregates(db);

  afterAll(async () => {
    // Events first: `meta_event_players.deck_id` is ON DELETE RESTRICT, so the
    // decks are only free once the event has cascaded its standings rows.
    await db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
    await db.deleteFrom("decks").where("id", "in", createdDeckIds).execute();
    await db.deleteFrom("cards").where("id", "in", [legendCardId, mainCardId]).execute();
    // Takes the admins row and any deck this user owns with it.
    await db.deleteFrom("users").where("id", "=", USER_ID).execute();
  });
}

describe.skipIf(!ctx)("Meta archive routes (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  describe("admin-only access control (non-admin)", () => {
    it("refuses the event list", async () => {
      const res = await app.fetch(adminReq("GET", "/meta/events"));
      expect(res.status).toBe(403);
    });

    it("refuses event creation", async () => {
      const res = await app.fetch(adminReq("POST", "/meta/events", eventBody("mtr-forbidden")));
      expect(res.status).toBe(403);
    });

    it("refuses standings-row creation", async () => {
      const res = await app.fetch(
        adminReq("POST", "/meta/players", playerBody(crypto.randomUUID())),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("promote user to admin", () => {
    it("inserts the user into admins", async () => {
      await db.insertInto("admins").values({ userId: USER_ID }).execute();
    });
  });

  describe("GET /admin/meta/events", () => {
    it("pages the list and reports the total behind it", async () => {
      await createEvent("mtr-list-one");
      await createEvent("mtr-list-two");

      const res = await app.fetch(adminReq("GET", "/meta/events?limit=1&page=1"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { events: unknown[]; total: number; limit: number };
      expect(body.events).toHaveLength(1);
      expect(body.limit).toBe(1);
      expect(body.total).toBeGreaterThanOrEqual(2);
    });

    it("filters on the query rather than the page", async () => {
      const eventId = await createEvent("mtr-list-filtered", { name: "MTR Distinctive Cup" });

      const res = await app.fetch(adminReq("GET", "/meta/events?search=MTR%20Distinctive%20Cup"));
      const body = (await res.json()) as { events: { id: string }[]; total: number };
      expect(body.events.map((row) => row.id)).toEqual([eventId]);
      expect(body.total).toBe(1);
    });
  });

  describe("GET /admin/meta/events/{id}", () => {
    it("serves one event with its counts and sources", async () => {
      const eventId = await createEvent("mtr-get-one");

      const res = await app.fetch(adminReq("GET", `/meta/events/${eventId}`));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        id: eventId,
        slug: "mtr-get-one",
        playerRowCount: 0,
        deckCount: 0,
        sources: [],
      });
    });

    it("404s an event that is not there", async () => {
      const res = await app.fetch(adminReq("GET", `/meta/events/${crypto.randomUUID()}`));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /admin/meta/events", () => {
    it("creates an event and reports zero counts", async () => {
      const res = await app.fetch(adminReq("POST", "/meta/events", eventBody("mtr-create")));
      expect(res.status).toBe(201);
      const json = await readJson(res);
      createdEventIds.push(json.id);
      expect(json.slug).toBe("mtr-create");
      expect(json.eventDate).toBe("2026-08-01");
      expect(json.playerRowCount).toBe(0);
      expect(json.deckCount).toBe(0);
    });

    it("rejects a duplicate slug with 409", async () => {
      const res = await app.fetch(adminReq("POST", "/meta/events", eventBody("mtr-create")));
      expect(res.status).toBe(409);
    });

    it.each(RESERVED_META_EVENT_SLUGS)("rejects the reserved slug %s", async (slug) => {
      const res = await app.fetch(adminReq("POST", "/meta/events", eventBody(slug)));
      expect(res.status).toBe(400);
    });

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
    it("renames the slug and leaves every data field alone", async () => {
      const eventId = await createEvent("mtr-patch");
      const res = await app.fetch(
        adminReq("PATCH", `/meta/events/${eventId}`, { slug: "mtr-patch-renamed" }),
      );
      expect(res.status).toBe(204);

      const row = await db
        .selectFrom("metaEvents")
        .select(["slug", "name", "organizer"])
        .where("id", "=", eventId)
        .executeTakeFirstOrThrow();
      expect(row.slug).toBe("mtr-patch-renamed");
      expect(row.name).toBe("MTR mtr-patch");
      expect(row.organizer).toBe("MTR Organizer");
    });

    it("refuses a body carrying only a data field, which an overlay owns instead", async () => {
      const eventId = await createEvent("mtr-patch-data");
      const res = await app.fetch(
        adminReq("PATCH", `/meta/events/${eventId}`, { name: "MTR Renamed" }),
      );
      expect(res.status).toBe(400);
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
        adminReq("PATCH", `/meta/events/${crypto.randomUUID()}`, { slug: "mtr-ghost" }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("event citations", () => {
    it("creates a hand-entered citation and lists it", async () => {
      const eventId = await createEvent("mtr-citations");
      const created = await app.fetch(
        adminReq("POST", `/meta/events/${eventId}/sources`, {
          label: "Twitch VOD",
          sourceUrl: "https://example.invalid/mtr-vod",
        }),
      );
      expect(created.status).toBe(201);
      const citation = await readJson(created);
      expect(citation.provider).toBeNull();
      expect(citation.externalId).toBeNull();
      expect(citation.label).toBe("Twitch VOD");

      const listed = await app.fetch(adminReq("GET", `/meta/events/${eventId}/sources`));
      expect(listed.status).toBe(200);
      const body = await readJson(listed);
      expect(body.sources).toHaveLength(1);
      expect(body.sources[0].id).toBe(citation.id);
    });

    it("rejects a body that tries to claim a provider key", async () => {
      const eventId = await createEvent("mtr-citation-provider");
      const res = await app.fetch(
        adminReq("POST", `/meta/events/${eventId}/sources`, {
          label: "uvsgames",
          sourceUrl: "https://example.invalid/uvs",
          provider: "uvsgames",
          externalId: "evt-1",
        }),
      );
      // A provider citation is written by linking that provider's candidate,
      // never typed in: one typed here would collide with the unique key or
      // outlive the link that owns it.
      expect(res.status).toBe(400);
    });

    it("deletes a hand-entered citation", async () => {
      const eventId = await createEvent("mtr-citation-delete");
      const created = await app.fetch(
        adminReq("POST", `/meta/events/${eventId}/sources`, { label: "Standings photo" }),
      );
      const citation = await readJson(created);

      const removed = await app.fetch(
        adminReq("DELETE", `/meta/events/${eventId}/sources/${citation.id}`),
      );
      expect(removed.status).toBe(204);

      const listed = await app.fetch(adminReq("GET", `/meta/events/${eventId}/sources`));
      const body = await readJson(listed);
      expect(body.sources).toEqual([]);
    });

    it("404s a citation that belongs to another event", async () => {
      const eventId = await createEvent("mtr-citation-404");
      const res = await app.fetch(
        adminReq("DELETE", `/meta/events/${eventId}/sources/${crypto.randomUUID()}`),
      );
      expect(res.status).toBe(404);
    });

    it("404s citations for an unknown event", async () => {
      const res = await app.fetch(adminReq("GET", `/meta/events/${crypto.randomUUID()}/sources`));
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /admin/meta/events/{id}", () => {
    it("removes the event, its standings rows and the decks behind them", async () => {
      const eventId = await createEvent("mtr-delete");
      const { playerId, deckId } = await createPlayer(eventId);

      const res = await app.fetch(adminReq("DELETE", `/meta/events/${eventId}`));
      expect(res.status).toBe(204);

      const players = await db
        .selectFrom("metaEventPlayers")
        .select("id")
        .where("id", "=", playerId)
        .execute();
      expect(players).toHaveLength(0);
      const decks = await db.selectFrom("decks").select("id").where("id", "=", deckId).execute();
      expect(decks).toHaveLength(0);
    });

    it("404s for an unknown event", async () => {
      const res = await app.fetch(adminReq("DELETE", `/meta/events/${crypto.randomUUID()}`));
      expect(res.status).toBe(404);
    });
  });

  describe("POST /admin/meta/players", () => {
    it("mints the deck under the synthetic owner, public, with a token", async () => {
      const eventId = await createEvent("mtr-deck-owner");
      const { deckId, shareToken } = await createPlayer(eventId);

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
      const res = await app.fetch(
        adminReq("POST", "/meta/players", playerBody(crypto.randomUUID())),
      );
      expect(res.status).toBe(404);
    });

    it("rejects an empty card list", async () => {
      const eventId = await createEvent("mtr-empty-cards");
      const res = await app.fetch(
        adminReq("POST", "/meta/players", playerBody(eventId, { list: listBody({ cards: [] }) })),
      );
      expect(res.status).toBe(400);
    });

    it("rejects a rank below the bound", async () => {
      const eventId = await createEvent("mtr-bad-rank");
      const res = await app.fetch(
        adminReq("POST", "/meta/players", playerBody(eventId, { rank: 0 })),
      );
      expect(res.status).toBe(400);
    });

    it("files a standings-only entry with no deck and no permalink", async () => {
      const eventId = await createEvent("mtr-standings-only");
      const { playerId, deckId, shareToken } = await createPlayer(eventId, {
        playerName: "MTR Deckless",
        rank: 8,
        rankIsTier: true,
        list: null,
      });
      expect(deckId).toBeNull();
      expect(shareToken).toBeNull();

      const row = await db
        .selectFrom("metaEventPlayers")
        .select(["listStatus", "deckId", "rankIsTier", "legendCardId"])
        .where("id", "=", playerId)
        .executeTakeFirstOrThrow();
      // The legend is a column on the standings row, so the archive keeps it
      // whether or not a list was ever published.
      expect(row.listStatus).toBe("none");
      expect(row.deckId).toBeNull();
      expect(row.rankIsTier).toBe(true);
      expect(row.legendCardId).toBe(legendCardId);
    });

    it("gives a partial list a permalink, since its main deck is there", async () => {
      const eventId = await createEvent("mtr-partial");
      const { playerId, shareToken } = await createPlayer(eventId, {
        list: listBody({ listStatus: "partial" }),
      });
      expect(shareToken).not.toBeNull();

      const row = await db
        .selectFrom("metaEventPlayers")
        .select("listStatus")
        .where("id", "=", playerId)
        .executeTakeFirstOrThrow();
      expect(row.listStatus).toBe("partial");
    });

    it("defaults an unstated status to a full list", async () => {
      const eventId = await createEvent("mtr-default-status");
      const { playerId } = await createPlayer(eventId);

      const row = await db
        .selectFrom("metaEventPlayers")
        .select("listStatus")
        .where("id", "=", playerId)
        .executeTakeFirstOrThrow();
      expect(row.listStatus).toBe("full");
    });

    // "none" is the value that says there is no deck, so a list can never
    // carry it — a list that exists is at least partial.
    it.each(["mostly", "none"])("rejects the list status %s", async (listStatus) => {
      const eventId = await createEvent(`mtr-bad-status-${listStatus}`);
      const res = await app.fetch(
        adminReq("POST", "/meta/players", playerBody(eventId, { list: listBody({ listStatus }) })),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("GET /admin/meta/events/{id}/players", () => {
    it("lists the event's standings best finish first", async () => {
      const eventId = await createEvent("mtr-event-players");
      await createPlayer(eventId, { playerName: "MTR Second", rank: 4 });
      await createPlayer(eventId, { playerName: "MTR First", rank: 1 });
      await createPlayer(eventId, { playerName: "MTR Ninth", rank: 9, list: null });

      const players = await adminPlayers(eventId);
      expect(players.map((player: { playerName: string }) => player.playerName)).toEqual([
        "MTR First",
        "MTR Second",
        "MTR Ninth",
      ]);
      expect(players[0].cardCount).toBe(4);
      expect(players[0].legendName).toBe("MTR Legend");
      // A standings-only entry carries the whole deck half as null.
      expect(players[2].cardCount).toBe(0);
      expect(players[2].deckId).toBeNull();
      expect(players[2].shareToken).toBeNull();
      expect(players[2].deckFormat).toBeNull();
      expect(players[2].listStatus).toBe("none");
    });

    it("404s for an unknown event", async () => {
      const res = await app.fetch(adminReq("GET", `/meta/events/${crypto.randomUUID()}/players`));
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /admin/meta/players/{id}", () => {
    it("deletes a standings row and the deck behind it", async () => {
      const eventId = await createEvent("mtr-player-delete");
      const { playerId, deckId } = await createPlayer(eventId);

      const res = await app.fetch(adminReq("DELETE", `/meta/players/${playerId}`));
      expect(res.status).toBe(204);

      const decks = await db.selectFrom("decks").select("id").where("id", "=", deckId).execute();
      expect(decks).toHaveLength(0);

      const again = await app.fetch(adminReq("DELETE", `/meta/players/${playerId}`));
      expect(again.status).toBe(404);
    });
  });

  describe("POST /decks/{id}/share/rotate", () => {
    it("refuses to rotate an archived deck's permalink", async () => {
      const eventId = await createEvent("mtr-rotate");

      // Production can't reach this state: an archive deck is owned by the
      // synthetic user, which has no session, so the owner-scoped rotate never
      // matches one. Pointing a standings row at *this* user's deck is the
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
        .insertInto("metaEventPlayers")
        .values({
          metaEventId: eventId,
          playerName: "MTR Guard",
          rank: 1,
          deckId: deck!.id,
          listStatus: "full",
        })
        .execute();

      const res = await app.fetch(req("POST", `/decks/${deck!.id}/share/rotate`));
      expect(res.status).toBe(409);

      const after = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", deck!.id)
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

      const res = await app.fetch(req("POST", `/decks/${deck!.id}/share/rotate`));
      expect(res.status).toBe(200);
      const json = await readJson(res);
      expect(json.shareToken).not.toBe("mtrRotate001");
    });
  });
});

// Public reads, from a request with no session at all.
describe.skipIf(!ctx || !anonCtx)("Meta archive public reads (anonymous)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const anonApp = anonCtx!.app;

  async function scopedCounts(
    dateFrom: string,
    dateTo: string,
  ): Promise<{ totalPlayers: number; decksWithMainDeck: number }> {
    const res = await anonApp.fetch(
      req("GET", `/meta/counts?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    );
    expect(res.status).toBe(200);
    return await readJson(res);
  }

  it("renders the event list", async () => {
    const eventId = await createEvent("mtr-public-list");
    await createPlayer(eventId);
    await createPlayer(eventId, { playerName: "MTR Bystander", rank: 4, list: null });

    const res = await anonApp.fetch(req("GET", "/meta/events"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const event = json.events.find((row: { slug: string }) => row.slug === "mtr-public-list");
    expect(event.playerRowCount).toBe(2);
    expect(event.deckCount).toBe(1);
    expect(event.eventDate).toBe("2026-08-01");
    // The long-form fields belong to the detail shape only.
    expect(event.notes).toBeUndefined();
  });

  it("renders one event with its whole standings table", async () => {
    const eventId = await createEvent("mtr-public-event");
    await createPlayer(eventId, {
      playerName: "MTR Anon",
      rank: 2,
      wins: 4,
      losses: 2,
      draws: 0,
    });
    await createPlayer(eventId, {
      playerName: "MTR Unlisted",
      rank: 9,
      rankIsTier: true,
      list: null,
    });

    const res = await anonApp.fetch(req("GET", "/meta/events/mtr-public-event"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.event.id).toBe(eventId);
    expect(json.event.notes).toBe("MTR notes");
    expect(json.players).toHaveLength(2);
    expect(json.players[0].playerName).toBe("MTR Anon");
    expect(json.players[0].legend.name).toBe("MTR Legend");
    // The slug is what the standings line links to on /cards.
    expect(json.players[0].legend.slug).toBe("mtr-legend");
    expect([json.players[0].wins, json.players[0].losses, json.players[0].draws]).toEqual([
      4, 2, 0,
    ]);
    expect(json.players[0].shareToken).not.toBeNull();

    // Enough to render a standings line, not enough to click one.
    expect(json.players[1].playerName).toBe("MTR Unlisted");
    expect(json.players[1].listStatus).toBe("none");
    expect(json.players[1].deckId).toBeNull();
    expect(json.players[1].shareToken).toBeNull();
    expect(json.players[1].rankIsTier).toBe(true);
    expect(json.players[1].legend.name).toBe("MTR Legend");
  });

  it("prints the event's citations and no contributor line by default", async () => {
    const eventId = await createEvent("mtr-public-sources");
    // Citations are written on the admin surface and read on the public one.
    await ctx!.app.fetch(
      adminReq("POST", `/meta/events/${eventId}/sources`, {
        label: "uvsgames",
        sourceUrl: "https://example.invalid/uvs",
      }),
    );

    const res = await anonApp.fetch(req("GET", "/meta/events/mtr-public-sources"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.event.sources).toHaveLength(1);
    expect(json.event.sources[0].label).toBe("uvsgames");
    expect(json.event.sources[0].sourceUrl).toBe("https://example.invalid/uvs");
    // Nobody contributed by hand, and there is no top-level sourceUrl field.
    expect(json.event.contributors).toEqual([]);
    expect(json.event.sourceUrl).toBeUndefined();
  });

  it("404s an unknown event slug", async () => {
    const res = await anonApp.fetch(req("GET", "/meta/events/mtr-no-such-event"));
    expect(res.status).toBe(404);
  });

  it("lists only the entries with a list in the cross-event deck browser", async () => {
    const eventId = await createEvent("mtr-public-decks");
    const { shareToken } = await createPlayer(eventId, { playerName: "MTR Browser" });
    const { playerId } = await createPlayer(eventId, {
      playerName: "MTR Absent",
      rank: 5,
      list: null,
    });

    const res = await anonApp.fetch(req("GET", "/meta/decks"));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    const deck = json.decks.find((row: { shareToken: string }) => row.shareToken === shareToken);
    expect(deck.playerName).toBe("MTR Browser");
    expect(deck.legendName).toBe("MTR Legend");
    expect(deck.legendSlug).toBe("mtr-legend");
    expect(json.decks.some((row: { playerId: string }) => row.playerId === playerId)).toBe(false);
  });

  it("renders one archived deck with its standings panel", async () => {
    const eventId = await createEvent("mtr-public-deck");
    const { shareToken } = await createPlayer(eventId, {
      playerName: "MTR Detail",
      rank: 4,
      rankIsTier: true,
      wins: 3,
      losses: 3,
      draws: 0,
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
        tier: "local",
        country: null,
        playerCount: 32,
      },
      listStatus: "full",
      playerName: "MTR Detail",
      playerKey: null,
      rank: 4,
      rankIsTier: true,
      wins: 3,
      losses: 3,
      draws: 0,
      // Hand-created by this test, so nobody is credited for the list.
      contributors: [],
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

  it("renders a partial list's page like any other", async () => {
    const eventId = await createEvent("mtr-public-partial");
    const { shareToken } = await createPlayer(eventId, {
      playerName: "MTR Partial",
      list: listBody({ listStatus: "partial" }),
    });

    // The main deck is what the page shows, and a partial list has all of it.
    const res = await anonApp.fetch(req("GET", `/meta/decks/${shareToken}`));
    expect(res.status).toBe(200);
  });

  it("counts only the standings rows whose event falls inside the scope", async () => {
    // Every integration file seeds into the same archive, so the assertion is
    // on the movement this test causes.
    const before = await scopedCounts("2026-05-01", "2026-05-31");
    const inScope = await createEvent("mtr-counts-in", { eventDate: "2026-05-10" });
    const outOfScope = await createEvent("mtr-counts-out", { eventDate: "2026-02-10" });
    await createPlayer(inScope, { playerName: "MTR Counts A" });
    await createPlayer(inScope, { playerName: "MTR Counts B", rank: 2 });
    await createPlayer(outOfScope, { playerName: "MTR Counts C" });

    const after = await scopedCounts("2026-05-01", "2026-05-31");
    expect(after.totalPlayers).toBe(before.totalPlayers + 2);
    expect(after.decksWithMainDeck).toBe(before.decksWithMainDeck + 2);
  });

  it("reports two denominators, so a deckless entry deflates neither on its own", async () => {
    const before = await scopedCounts("2026-04-01", "2026-04-30");
    const eventId = await createEvent("mtr-counts-pyramid", { eventDate: "2026-04-10" });
    await createPlayer(eventId, { playerName: "MTR Full" });
    // A partial list's main deck is complete, so it belongs on the deck side
    // with the full one. Only the entry with no list at all drops out.
    await createPlayer(eventId, {
      playerName: "MTR Partial",
      rank: 2,
      list: listBody({ listStatus: "partial" }),
    });
    await createPlayer(eventId, { playerName: "MTR Deckless", rank: 3, list: null });

    const after = await scopedCounts("2026-04-01", "2026-04-30");
    expect(after.totalPlayers).toBe(before.totalPlayers + 3);
    expect(after.decksWithMainDeck).toBe(before.decksWithMainDeck + 2);
  });

  it("refuses an anonymous write to the admin surface", async () => {
    // No session at all, so the admin mount stops the request before the
    // role check ever runs.
    const res = await anonApp.fetch(adminReq("POST", "/meta/events", eventBody("mtr-anon-write")));
    expect(res.status).toBe(401);
  });
});
