import { afterAll, describe, expect, it } from "vitest";

import { adminReq, createTestContext, req, seedTestUser } from "../../test/integration-context.js";
import type { JsonBody } from "../../test/read-json.js";
import { readJson } from "../../test/read-json.js";

// Everything this file creates is prefixed mtc- / MTC. The user starts as a
// non-admin so the 403 case runs before promotion — the isAdmin cache only
// caches positive results, so a never-admin user always re-checks the DB.
//
// The describes run in file order and share state on purpose: the pipeline is
// a sequence (upload, review, accept, re-upload), and testing each step against
// a freshly re-seeded world would test something the product never does.

const USER_ID = crypto.randomUUID();
const ctx = createTestContext(USER_ID);

const PROVIDER = "mtc-provider";
/** The second source describing the same tournament. */
const PROVIDER_B = "mtc-provider-b";
const FORMAT = "freeform";

let legendCardId: string;
let championCardId: string;
let mainCardId: string;
let aliasCardId: string;

const createdDeckIds: string[] = [];
const createdMetaEventIds: string[] = [];

async function seedCard(name: string, normName: string, type: string): Promise<string> {
  const [card] = await ctx!.db
    .insertInto("cards")
    .values({ name, slug: normName, type, normName, keywords: [], tags: [] })
    .returning("id")
    .execute();
  return card.id;
}

function fullList() {
  return [
    { name: "MTC Legend", zone: "legend", quantity: 1 },
    { name: "MTC Main", zone: "main", quantity: 3 },
  ];
}

function player(externalId: string, overrides: Record<string, unknown> = {}) {
  return {
    externalId,
    playerName: "MTC Player",
    rank: 1,
    wins: 5,
    losses: 1,
    cards: fullList(),
    ...overrides,
  };
}

/** A player the source published a finish and a legend for, but no list. */
function standing(externalId: string, overrides: Record<string, unknown> = {}) {
  return player(externalId, { cards: null, legendName: "MTC Legend", ...overrides });
}

function event(externalId: string, overrides: Record<string, unknown> = {}) {
  return {
    externalId,
    name: `MTC ${externalId}`,
    eventDate: "2026-08-01",
    format: FORMAT,
    playerCount: 32,
    organizer: "MTC Organizer",
    sourceUrl: "https://example.invalid/mtc",
    notes: "MTC notes",
    players: [player(`${externalId}-p1`)],
    ...overrides,
  };
}

async function upload(events: unknown[]): Promise<JsonBody> {
  return uploadAs(PROVIDER, events);
}

async function uploadAs(provider: string, events: unknown[]): Promise<JsonBody> {
  const res = await ctx!.app.fetch(adminReq("POST", "/meta/upload", { provider, events }));
  expect(res.status).toBe(200);
  return readJson(res);
}

async function queue(): Promise<JsonBody[]> {
  const res = await ctx!.app.fetch(adminReq("GET", "/meta/candidates"));
  expect(res.status).toBe(200);
  const body = await readJson(res);
  return body.candidates;
}

async function queueRow(externalId: string): Promise<JsonBody> {
  const rows = await queue();
  const row = rows.find((r) => r.externalId === externalId);
  expect(row).toBeDefined();
  return row;
}

async function inQueue(externalId: string): Promise<boolean> {
  const rows = await queue();
  return rows.some((r) => r.externalId === externalId);
}

async function detail(id: string): Promise<JsonBody> {
  const res = await ctx!.app.fetch(adminReq("GET", `/meta/candidates/${id}`));
  expect(res.status).toBe(200);
  return readJson(res);
}

async function detailOf(externalId: string): Promise<JsonBody> {
  const row = await queueRow(externalId);
  return detail(row.id);
}

async function playersOf(externalId: string): Promise<JsonBody[]> {
  const full = await detailOf(externalId);
  return full.players;
}

async function onlyPlayerOf(externalId: string): Promise<JsonBody> {
  const players = await playersOf(externalId);
  expect(players).toHaveLength(1);
  return players[0];
}

async function playerCountOf(externalId: string): Promise<number> {
  const players = await playersOf(externalId);
  return players.length;
}

async function slugOf(metaEventId: string): Promise<string> {
  const row = await ctx!.db
    .selectFrom("metaEvents")
    .select("slug")
    .where("id", "=", metaEventId)
    .executeTakeFirstOrThrow();
  return row.slug;
}

async function sourcesOf(metaEventId: string): Promise<JsonBody[]> {
  const res = await ctx!.app.fetch(adminReq("GET", `/meta/events/${metaEventId}/sources`));
  expect(res.status).toBe(200);
  const body = await readJson(res);
  return body.sources;
}

async function post(path: string, body?: unknown, status = 200): Promise<JsonBody> {
  const res = await ctx!.app.fetch(adminReq("POST", path, body));
  expect(res.status).toBe(status);
  return status === 204 ? null : readJson(res);
}

function rememberDeck(deckId: string | null): void {
  if (deckId !== null) {
    createdDeckIds.push(deckId);
  }
}

function rememberEvent(accepted: JsonBody): string {
  createdMetaEventIds.push(accepted.metaEventId);
  for (const entry of accepted.acceptedPlayers ?? []) {
    rememberDeck(entry.deckId);
  }
  return accepted.metaEventId;
}

if (ctx) {
  const { db } = ctx;

  await seedTestUser(db, { id: USER_ID });
  legendCardId = await seedCard("MTC Legend", "mtc-legend", "legend");
  championCardId = await seedCard("MTC Champion", "mtc-champion", "champion");
  mainCardId = await seedCard("MTC Main", "mtc-main", "spell");
  aliasCardId = await seedCard("MTC Aliased", "mtc-aliased", "spell");

  afterAll(async () => {
    // Before the decks: `meta_event_players.deck_id` is ON DELETE RESTRICT, and
    // deleting the event is what cascades the rows holding those references.
    if (createdMetaEventIds.length > 0) {
      await db.deleteFrom("metaEvents").where("id", "in", createdMetaEventIds).execute();
    }
    await db
      .deleteFrom("candidateMetaEvents")
      .where("provider", "in", [PROVIDER, PROVIDER_B])
      .execute();
    await db
      .deleteFrom("ignoredCandidateMetaEvents")
      .where("provider", "in", [PROVIDER, PROVIDER_B])
      .execute();
    await db
      .deleteFrom("ignoredCandidateMetaPlayers")
      .where("provider", "in", [PROVIDER, PROVIDER_B])
      .execute();
    if (createdDeckIds.length > 0) {
      await db.deleteFrom("decks").where("id", "in", createdDeckIds).execute();
    }
    await db.deleteFrom("cardNameAliases").where("cardId", "=", aliasCardId).execute();
    await db
      .deleteFrom("cards")
      .where("id", "in", [legendCardId, championCardId, mainCardId, aliasCardId])
      .execute();
    // Takes the admins row and any deck this user owns with it.
    await db.deleteFrom("users").where("id", "=", USER_ID).execute();
  });
}

describe.skipIf(!ctx)("Meta candidate ingest (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { app, db } = ctx!;

  describe("admin-only access control (non-admin)", () => {
    it("refuses the upload", async () => {
      const res = await app.fetch(
        adminReq("POST", "/meta/upload", { provider: PROVIDER, events: [event("mtc-forbidden")] }),
      );
      expect(res.status).toBe(403);
    });

    it("refuses the candidate queue", async () => {
      const res = await app.fetch(adminReq("GET", "/meta/candidates"));
      expect(res.status).toBe(403);
    });
  });

  describe("promote user to admin", () => {
    it("inserts the user into admins", async () => {
      await db.insertInto("admins").values({ userId: USER_ID }).execute();
    });
  });

  describe("POST /admin/meta/upload", () => {
    it("stages new events and their standings rows", async () => {
      const result = await upload([event("mtc-a"), event("mtc-b")]);
      expect(result.newEvents).toBe(2);
      expect(result.newPlayers).toBe(2);
      expect(result.updatedEvents).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.newEventDetails).toEqual([
        { externalId: "mtc-a", name: "MTC mtc-a" },
        { externalId: "mtc-b", name: "MTC mtc-b" },
      ]);
    });

    it("resolves card names against the live catalog", async () => {
      const row = await queueRow("mtc-a");
      expect(row.unresolvedCardCount).toBe(0);
      const players = await playersOf("mtc-a");
      const cards = players[0].cards;
      const legend = cards.find((c: JsonBody) => c.name === "MTC Legend");
      const main = cards.find((c: JsonBody) => c.name === "MTC Main");
      expect(legend.cardId).toBe(legendCardId);
      expect(main.cardId).toBe(mainCardId);
    });

    it("resolves the legend and champion a standings-only entry names", async () => {
      await upload([
        event("mtc-legend-only", {
          players: [standing("mtc-legend-only-p1", { championName: "MTC Champion" })],
        }),
      ]);
      const candidate = await onlyPlayerOf("mtc-legend-only");
      expect(candidate.cards).toBeNull();
      expect(candidate.listStatus).toBe("none");
      expect(candidate.legendName).toBe("MTC Legend");
      expect(candidate.legendCardId).toBe(legendCardId);
      expect(candidate.championName).toBe("MTC Champion");
      expect(candidate.championCardId).toBe(championCardId);
    });

    it("stages the standings detail behind a rank", async () => {
      await upload([
        event("mtc-standings-detail", {
          players: [
            standing("mtc-standings-detail-p1", {
              matchPoints: 21,
              opponentMatchWinPct: 0.65382653,
              gameWinPct: 0.77777778,
              opponentGameWinPct: 0.64397379,
              entryStatus: "dropped",
            }),
          ],
        }),
      ]);

      const candidate = await onlyPlayerOf("mtc-standings-detail");
      expect(candidate.matchPoints).toBe(21);
      expect(candidate.opponentMatchWinPct).toBe(0.65382653);
      expect(candidate.gameWinPct).toBe(0.77777778);
      expect(candidate.opponentGameWinPct).toBe(0.64397379);
      expect(candidate.entryStatus).toBe("dropped");
    });

    it("skips a player whose standings detail is out of range", async () => {
      const result = await upload([
        event("mtc-bad-detail", {
          players: [
            standing("mtc-bad-detail-p1", { gameWinPct: 1.5 }),
            standing("mtc-bad-detail-p2", { rank: 2, entryStatus: "vanished" }),
          ],
        }),
      ]);

      expect(result.newPlayers).toBe(0);
      expect(result.errors.some((line: string) => line.includes("gameWinPct"))).toBe(true);
      expect(result.errors.some((line: string) => line.includes("entryStatus"))).toBe(true);
    });

    it("drops an event whose tier, country or location the columns would refuse", async () => {
      const result = await upload([
        event("mtc-bad-tier", { tier: "legendary" }),
        event("mtc-bad-country", { country: "Valoran" }),
        event("mtc-long-location", { location: "N".repeat(501) }),
      ]);

      expect(result.newEvents).toBe(0);
      expect(result.errors.some((line: string) => line.includes("mtc-bad-tier"))).toBe(true);
      expect(result.errors.some((line: string) => line.includes("mtc-bad-country"))).toBe(true);
      expect(result.errors.some((line: string) => line.includes("mtc-long-location"))).toBe(true);
      expect(await inQueue("mtc-bad-tier")).toBe(false);
      expect(await inQueue("mtc-bad-country")).toBe(false);
      expect(await inQueue("mtc-long-location")).toBe(false);
    });

    it("is idempotent — re-uploading the same payload changes nothing", async () => {
      const result = await upload([event("mtc-a")]);
      expect(result.newEvents).toBe(0);
      expect(result.updatedEvents).toBe(0);
      expect(result.unchangedEvents).toBe(1);
      expect(result.unchangedPlayers).toBe(1);
      expect(result.removedPlayers).toBe(0);
    });

    it("replaces only the uploaded event, leaving other candidates untouched", async () => {
      const before = await queueRow("mtc-b");
      await upload([event("mtc-a", { name: "MTC renamed" })]);
      const after = await queueRow("mtc-b");
      expect(after).toEqual(before);
      const renamed = await queueRow("mtc-a");
      expect(renamed.name).toBe("MTC renamed");
    });

    it("deletes a standings row the event's payload no longer lists", async () => {
      // Carries the rename forward: an upload replaces the whole event, so
      // dropping the name here would silently revert it.
      const name = "MTC renamed";
      await upload([
        event("mtc-a", { name, players: [player("mtc-a-p1"), player("mtc-a-p2", { rank: 2 })] }),
      ]);
      const withTwo = await queueRow("mtc-a");
      expect(withTwo.playerRowCount).toBe(2);

      const result = await upload([event("mtc-a", { name, players: [player("mtc-a-p1")] })]);
      expect(result.removedPlayers).toBe(1);
      expect(result.removedPlayerDetails).toEqual([
        { eventExternalId: "mtc-a", externalId: "mtc-a-p2", playerName: "MTC Player" },
      ]);
      const withOne = await queueRow("mtc-a");
      expect(withOne.playerRowCount).toBe(1);
    });

    it("reports in-payload duplicate external ids and keeps the first", async () => {
      const result = await upload([
        event("mtc-dupe", { name: "MTC first" }),
        event("mtc-dupe", { name: "MTC second" }),
      ]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Duplicate event externalId");
      const row = await queueRow("mtc-dupe");
      expect(row.name).toBe("MTC first");
    });

    it("reports an in-payload duplicate player id within one event", async () => {
      const result = await upload([
        event("mtc-dupe", {
          name: "MTC first",
          players: [player("mtc-dupe-p1", { playerName: "MTC One" }), player("mtc-dupe-p1")],
        }),
      ]);
      expect(result.errors[0]).toContain("Duplicate player externalId");
      const players = await playersOf("mtc-dupe");
      expect(players).toHaveLength(1);
      expect(players[0].playerName).toBe("MTC One");
    });

    it("skips a bad item and stages the rest of the batch", async () => {
      const result = await upload([
        event("mtc-bad", { eventDate: "not-a-date" }),
        event("mtc-good"),
      ]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("is not a YYYY-MM-DD date");
      expect(result.newEvents).toBe(1);
      expect(await inQueue("mtc-bad")).toBe(false);
      expect(await inQueue("mtc-good")).toBe(true);
    });

    it("skips an entry whose card zone is not a real deck zone", async () => {
      const result = await upload([
        event("mtc-good", {
          players: [
            player("mtc-good-p1", { cards: [{ name: "MTC Main", zone: "attic", quantity: 1 }] }),
          ],
        }),
      ]);
      expect(result.errors[0]).toContain('unknown zone "attic"');
    });

    it("refuses a payload whose listStatus contradicts its cards", async () => {
      const claimsList = await app.fetch(
        adminReq("POST", "/meta/upload", {
          provider: PROVIDER,
          events: [
            event("mtc-contradiction", {
              players: [standing("mtc-contradiction-p1", { listStatus: "full" })],
            }),
          ],
        }),
      );
      expect(claimsList.status).toBe(400);

      const deniesList = await app.fetch(
        adminReq("POST", "/meta/upload", {
          provider: PROVIDER,
          events: [
            event("mtc-contradiction", {
              players: [player("mtc-contradiction-p1", { listStatus: "none" })],
            }),
          ],
        }),
      );
      expect(deniesList.status).toBe(400);
      expect(await inQueue("mtc-contradiction")).toBe(false);
    });

    it("reads blank strings as absent rather than skipping the event", async () => {
      // Scrapers routinely emit "" for a field they found nothing for. The live
      // columns CHECK a minimum length, so "" has to become NULL at the wire.
      const result = await upload([
        event("mtc-blank", {
          organizer: "",
          sourceUrl: "   ",
          notes: "",
          players: [player("mtc-blank-p1", { cards: null, legendName: "   ", championName: "" })],
        }),
      ]);
      expect(result.errors).toEqual([]);
      expect(result.newEvents).toBe(1);
      expect(result.newPlayers).toBe(1);

      const full = await detailOf("mtc-blank");
      expect(full.organizer).toBeNull();
      expect(full.sourceUrl).toBeNull();
      expect(full.notes).toBeNull();
      expect(full.players[0].legendName).toBeNull();
      expect(full.players[0].championName).toBeNull();
      expect(full.players[0].listStatus).toBe("none");
    });

    it("stages an unmatched card name and reports it", async () => {
      const result = await upload([
        event("mtc-unmatched", {
          players: [
            player("mtc-unmatched-p1", {
              cards: [
                { name: "MTC Legend", zone: "legend", quantity: 1 },
                { name: "MTC Ghost", zone: "main", quantity: 2 },
              ],
            }),
          ],
        }),
      ]);
      expect(result.unresolvedCards).toEqual([
        {
          eventExternalId: "mtc-unmatched",
          playerExternalId: "mtc-unmatched-p1",
          names: ["MTC Ghost"],
        },
      ]);
      const row = await queueRow("mtc-unmatched");
      expect(row.unresolvedCardCount).toBe(1);
    });
  });

  describe("checked_at", () => {
    it("marks a candidate reviewed and unmarks it", async () => {
      const row = await queueRow("mtc-b");
      await post(`/meta/candidates/${row.id}/check`, { checked: true }, 204);
      const checked = await queueRow("mtc-b");
      expect(checked.checkedAt).not.toBeNull();

      await post(`/meta/candidates/${row.id}/check`, { checked: false }, 204);
      const unchecked = await queueRow("mtc-b");
      expect(unchecked.checkedAt).toBeNull();
    });

    it("survives an upload that changes nothing", async () => {
      const row = await queueRow("mtc-b");
      await post(`/meta/candidates/${row.id}/check`, { checked: true }, 204);
      const before = await queueRow("mtc-b");

      await upload([event("mtc-b")]);
      const after = await queueRow("mtc-b");
      expect(after.checkedAt).toBe(before.checkedAt);
    });

    it("resets when an upload changes the event", async () => {
      await upload([event("mtc-b", { organizer: "MTC Someone Else" })]);
      const row = await queueRow("mtc-b");
      expect(row.checkedAt).toBeNull();
    });

    it("resets when an upload changes an entry's record", async () => {
      const before = await playersOf("mtc-b");
      await post(`/meta/candidate-players/${before[0].id}/check`, { checked: true }, 204);

      await upload([
        event("mtc-b", {
          organizer: "MTC Someone Else",
          players: [player("mtc-b-p1", { wins: 4, losses: 2, draws: 1 })],
        }),
      ]);
      const after = await playersOf("mtc-b");
      expect(after[0].checkedAt).toBeNull();
      expect(after[0].wins).toBe(4);
      expect(after[0].losses).toBe(2);
      expect(after[0].draws).toBe(1);
    });

    it("resets when an upload changes an entry's card list", async () => {
      const before = await playersOf("mtc-b");
      await post(`/meta/candidate-players/${before[0].id}/check`, { checked: true }, 204);
      const marked = await playersOf("mtc-b");
      expect(marked[0].checkedAt).not.toBeNull();

      await upload([
        event("mtc-b", {
          organizer: "MTC Someone Else",
          players: [
            player("mtc-b-p1", {
              wins: 4,
              losses: 2,
              draws: 1,
              cards: [
                { name: "MTC Legend", zone: "legend", quantity: 1 },
                { name: "MTC Main", zone: "main", quantity: 2 },
              ],
            }),
          ],
        }),
      ]);
      const after = await playersOf("mtc-b");
      expect(after[0].checkedAt).toBeNull();
    });

    it("survives an upload that only reorders an entry's card list", async () => {
      const legend = { name: "MTC Legend", zone: "legend", quantity: 1 };
      const main = { name: "MTC Main", zone: "main", quantity: 2 };
      const organizer = "MTC Someone Else";

      const marked = await playersOf("mtc-b");
      await post(`/meta/candidate-players/${marked[0].id}/check`, { checked: true }, 204);
      const before = await playersOf("mtc-b");
      expect(before[0].checkedAt).not.toBeNull();

      // Same rows, opposite order. A source is free to reshuffle its list, and
      // that must not look like an edit and undo a completed review.
      const result = await upload([
        event("mtc-b", {
          organizer,
          players: [player("mtc-b-p1", { wins: 4, losses: 2, draws: 1, cards: [main, legend] })],
        }),
      ]);
      expect(result.unchangedPlayers).toBe(1);
      expect(result.updatedPlayers).toBe(0);

      const after = await playersOf("mtc-b");
      expect(after[0].checkedAt).toBe(before[0].checkedAt);
    });
  });

  describe("POST /admin/meta/candidates/rematch", () => {
    it("resolves a card name and a legend name once an alias exists", async () => {
      await upload([
        event("mtc-alias", {
          players: [
            player("mtc-alias-p1", {
              cards: [
                { name: "MTC Legend", zone: "legend", quantity: 1 },
                { name: "MTC Nickname", zone: "main", quantity: 2 },
              ],
            }),
            standing("mtc-alias-p2", { rank: 2, legendName: "MTC Nickname" }),
          ],
        }),
      ]);
      const unresolved = await queueRow("mtc-alias");
      expect(unresolved.unresolvedCardCount).toBe(1);

      await db
        .insertInto("cardNameAliases")
        .values({ normName: "mtcnickname", cardId: aliasCardId })
        .execute();

      const result = await post("/meta/candidates/rematch");
      expect(result.resolved).toBeGreaterThanOrEqual(2);

      const resolved = await queueRow("mtc-alias");
      expect(resolved.unresolvedCardCount).toBe(0);
      const players = await playersOf("mtc-alias");
      const nickname = players[0].cards.find((c: JsonBody) => c.name === "MTC Nickname");
      expect(nickname.cardId).toBe(aliasCardId);
      expect(players[1].legendCardId).toBe(aliasCardId);
    });

    it("resolves an alias at upload time too, for every later push", async () => {
      await upload([
        event("mtc-alias2", {
          players: [
            player("mtc-alias2-p1", {
              cards: [{ name: "MTC Nickname", zone: "main", quantity: 1 }],
            }),
          ],
        }),
      ]);
      const row = await queueRow("mtc-alias2");
      expect(row.unresolvedCardCount).toBe(0);
    });
  });

  describe("accepting a candidate", () => {
    it("refuses a standings row whose parent event is not accepted yet", async () => {
      const players = await playersOf("mtc-a");
      const res = await app.fetch(
        adminReq("POST", `/meta/candidate-players/${players[0].id}/accept`),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.message).toContain("Accept the event first");
    });

    it("creates the live event and cites the source that produced it", async () => {
      const row = await queueRow("mtc-a");
      const accepted = await post(`/meta/candidates/${row.id}/accept`);
      rememberEvent(accepted);

      expect(accepted.created).toBe(true);
      expect(accepted.slug).toBe("mtc-renamed-2026");

      const live = await db
        .selectFrom("metaEvents")
        .selectAll()
        .where("id", "=", accepted.metaEventId)
        .executeTakeFirstOrThrow();
      expect(live.name).toBe("MTC renamed");
      expect(live.organizer).toBe("MTC Organizer");

      // The live row carries no source key; the credit is a citation, and the
      // link is the candidate's own FK.
      const citations = await sourcesOf(accepted.metaEventId);
      expect(citations).toHaveLength(1);
      expect(citations[0].provider).toBe(PROVIDER);
      expect(citations[0].externalId).toBe("mtc-a");
    });

    it("links the candidate and marks it reviewed", async () => {
      const row = await queueRow("mtc-a");
      expect(row.state).toBe("inSync");
      expect(row.metaEventId).not.toBeNull();
      expect(row.metaEventSlug).toBe("mtc-renamed-2026");
      expect(row.checkedAt).not.toBeNull();
    });

    it("refuses a list with an unmatched card name", async () => {
      const row = await queueRow("mtc-unmatched");
      const accepted = await post(`/meta/candidates/${row.id}/accept`);
      rememberEvent(accepted);

      const players = await playersOf("mtc-unmatched");
      const res = await app.fetch(
        adminReq("POST", `/meta/candidate-players/${players[0].id}/accept`),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.message).toContain("MTC Ghost");
    });

    it("creates the live standings row and its deck, named after the legend", async () => {
      const players = await playersOf("mtc-a");
      const accepted = await post(`/meta/candidate-players/${players[0].id}/accept`);
      rememberDeck(accepted.deckId);
      expect(accepted.created).toBe(true);

      const live = await db
        .selectFrom("metaEventPlayers")
        .selectAll()
        .where("id", "=", accepted.metaEventPlayerId)
        .executeTakeFirstOrThrow();
      expect(live.rank).toBe(1);
      expect(live.rankIsTier).toBe(false);
      expect(live.playerName).toBe("MTC Player");
      expect(live.wins).toBe(5);
      expect(live.losses).toBe(1);
      expect(live.draws).toBeNull();
      expect(live.legendCardId).toBe(legendCardId);
      expect(live.listStatus).toBe("full");
      expect(live.deckId).toBe(accepted.deckId);

      // The source key lives on the candidate: the live link is the only edge.
      const candidate = await db
        .selectFrom("candidateMetaPlayers")
        .select(["metaEventPlayerId", "externalId"])
        .where("id", "=", players[0].id)
        .executeTakeFirstOrThrow();
      expect(candidate.metaEventPlayerId).toBe(accepted.metaEventPlayerId);
      expect(candidate.externalId).toBe("mtc-a-p1");

      const deck = await db
        .selectFrom("decks")
        .selectAll()
        .where("id", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(deck.userId).toBe("meta-archive");
      expect(deck.isPublic).toBe(true);
      expect(deck.shareToken).not.toBeNull();
      // No name in the payload, so it falls back to the legend plus the player.
      expect(deck.name).toBe("MTC Legend (MTC Player)");

      const cards = await db
        .selectFrom("deckCards")
        .selectAll()
        .where("deckId", "=", accepted.deckId)
        .execute();
      expect(cards).toHaveLength(2);
    });

    it("re-links and settles the candidate on the next upload", async () => {
      const result = await upload([event("mtc-a", { name: "MTC renamed" })]);
      expect(result.unchangedEvents).toBe(1);

      const row = await queueRow("mtc-a");
      expect(row.state).toBe("inSync");
      expect(row.unacceptedPlayerCount).toBe(0);

      const players = await playersOf("mtc-a");
      expect(players[0].state).toBe("inSync");
      expect(players[0].metaEventPlayerId).not.toBeNull();
      expect(players[0].deckId).not.toBeNull();
      expect(players[0].shareToken).not.toBeNull();
      expect(players[0].diff).toEqual({
        fields: [],
        cards: { added: [], removed: [], changed: [] },
      });
    });

    it("shows a diff when a later upload disagrees with the live rows", async () => {
      await upload([
        event("mtc-a", {
          name: "MTC corrected",
          playerCount: 48,
          players: [
            player("mtc-a-p1", {
              rank: 2,
              cards: [
                { name: "MTC Legend", zone: "legend", quantity: 1 },
                { name: "MTC Main", zone: "main", quantity: 2 },
              ],
            }),
          ],
        }),
      ]);

      const row = await queueRow("mtc-a");
      expect(row.state).toBe("changed");
      expect(row.checkedAt).toBeNull();

      const full = await detail(row.id);
      expect(full.diff).toEqual([
        { field: "name", from: "MTC renamed", to: "MTC corrected" },
        { field: "playerCount", from: 32, to: 48 },
      ]);
      expect(full.players[0].state).toBe("changed");
      expect(full.players[0].diff.fields).toEqual([{ field: "rank", from: 1, to: 2 }]);
      expect(full.players[0].diff.cards.changed).toEqual([
        { cardId: mainCardId, zone: "main", from: 3, to: 2, name: "MTC Main" },
      ]);
    });

    it("applies the diff to the live rows when accepted again", async () => {
      const row = await queueRow("mtc-a");
      const accepted = await post(`/meta/candidates/${row.id}/accept`);
      expect(accepted.created).toBe(false);

      const live = await db
        .selectFrom("metaEvents")
        .selectAll()
        .where("id", "=", row.metaEventId)
        .executeTakeFirstOrThrow();
      expect(live.name).toBe("MTC corrected");
      expect(live.playerCount).toBe(48);
      // The slug is minted once and never re-derived from a renamed event.
      expect(live.slug).toBe("mtc-renamed-2026");

      const players = await playersOf("mtc-a");
      const acceptedPlayer = await post(`/meta/candidate-players/${players[0].id}/accept`);
      expect(acceptedPlayer.created).toBe(false);

      const livePlayer = await db
        .selectFrom("metaEventPlayers")
        .selectAll()
        .where("id", "=", players[0].metaEventPlayerId)
        .executeTakeFirstOrThrow();
      expect(livePlayer.rank).toBe(2);

      const main = await db
        .selectFrom("deckCards")
        .selectAll()
        .where("deckId", "=", players[0].deckId)
        .where("cardId", "=", mainCardId)
        .executeTakeFirstOrThrow();
      expect(main.quantity).toBe(2);
    });

    it("accepts an event together with its ready entries, reporting the rest", async () => {
      await upload([
        event("mtc-batch", {
          players: [
            player("mtc-batch-p1"),
            player("mtc-batch-p2", {
              rank: 2,
              cards: [{ name: "MTC Ghost", zone: "main", quantity: 1 }],
            }),
          ],
        }),
      ]);
      const row = await queueRow("mtc-batch");
      const accepted = await post(`/meta/candidates/${row.id}/accept-with-players`);
      rememberEvent(accepted);

      expect(accepted.created).toBe(true);
      expect(accepted.acceptedPlayers).toHaveLength(1);
      expect(accepted.skippedPlayers).toHaveLength(1);
      expect(accepted.skippedPlayers[0].externalId).toBe("mtc-batch-p2");
      expect(accepted.skippedPlayers[0].reason).toContain("MTC Ghost");
    });

    it("sums two rows that resolve to the same card and zone", async () => {
      // "MTC Nickname" is aliased onto the same card as "MTC Aliased", so the
      // list lands two main-zone rows on one card id. deck_cards is unique on
      // (deck, card, zone), so accepting has to fold them rather than 500.
      const payload = [
        event("mtc-dup-cards", {
          players: [
            player("mtc-dup-cards-p1", {
              cards: [
                { name: "MTC Legend", zone: "legend", quantity: 1 },
                { name: "MTC Aliased", zone: "main", quantity: 2 },
                { name: "MTC Nickname", zone: "main", quantity: 1 },
              ],
            }),
          ],
        }),
      ];
      await upload(payload);

      const row = await queueRow("mtc-dup-cards");
      const accepted = await post(`/meta/candidates/${row.id}/accept-with-players`);
      rememberEvent(accepted);
      expect(accepted.acceptedPlayers).toHaveLength(1);
      expect(accepted.skippedPlayers).toEqual([]);

      const cards = await db
        .selectFrom("deckCards")
        .selectAll()
        .where("deckId", "=", accepted.acceptedPlayers[0].deckId)
        .where("cardId", "=", aliasCardId)
        .execute();
      expect(cards).toHaveLength(1);
      expect(cards[0].quantity).toBe(3);

      // The ingest side has to fold the same way, or the accepted list would
      // read as changed against the row it just wrote.
      await upload(payload);
      const players = await playersOf("mtc-dup-cards");
      expect(players[0].state).toBe("inSync");
    });

    it("404s on an unknown candidate id", async () => {
      const res = await app.fetch(
        adminReq("POST", `/meta/candidates/${crypto.randomUUID()}/accept`),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("standings without a decklist", () => {
    it("accepts a standings-only entry into a deckless live row", async () => {
      await upload([
        event("mtc-standings", {
          players: [
            standing("mtc-standings-p1", { championName: "MTC Champion" }),
            standing("mtc-standings-p2", { rank: 2, legendName: "MTC Ghost Legend" }),
          ],
        }),
      ]);

      const row = await queueRow("mtc-standings");
      const accepted = await post(`/meta/candidates/${row.id}/accept-with-players`);
      rememberEvent(accepted);

      expect(accepted.acceptedPlayers).toHaveLength(1);
      expect(accepted.acceptedPlayers[0].deckId).toBeNull();
      expect(accepted.skippedPlayers).toHaveLength(1);
      expect(accepted.skippedPlayers[0].externalId).toBe("mtc-standings-p2");
      expect(accepted.skippedPlayers[0].reason).toContain("MTC Ghost Legend");

      const live = await db
        .selectFrom("metaEventPlayers")
        .selectAll()
        .where("id", "=", accepted.acceptedPlayers[0].metaEventPlayerId)
        .executeTakeFirstOrThrow();
      expect(live.listStatus).toBe("none");
      expect(live.deckId).toBeNull();
      expect(live.legendCardId).toBe(legendCardId);
      expect(live.championCardId).toBe(championCardId);
      expect(live.wins).toBe(5);
      expect(live.losses).toBe(1);
    });

    it("files an unresolved legend only when the admin allows it", async () => {
      const players = await playersOf("mtc-standings");
      const blocked = players.find((p: JsonBody) => p.externalId === "mtc-standings-p2");

      const refused = await app.fetch(
        adminReq("POST", `/meta/candidate-players/${blocked.id}/accept`),
      );
      expect(refused.status).toBe(400);
      const body = await readJson(refused);
      expect(body.message).toContain("MTC Ghost Legend");

      const accepted = await post(`/meta/candidate-players/${blocked.id}/accept`, {
        allowUnresolvedLegend: true,
      });
      expect(accepted.created).toBe(true);
      expect(accepted.deckId).toBeNull();

      const live = await db
        .selectFrom("metaEventPlayers")
        .selectAll()
        .where("id", "=", accepted.metaEventPlayerId)
        .executeTakeFirstOrThrow();
      expect(live.legendCardId).toBeNull();
      expect(live.playerName).toBe("MTC Player");
      expect(live.rank).toBe(2);
    });

    it("re-queues the entry when the source later publishes its list", async () => {
      await upload([
        event("mtc-standings", {
          players: [
            player("mtc-standings-p1", { championName: "MTC Champion" }),
            standing("mtc-standings-p2", { rank: 2, legendName: "MTC Ghost Legend" }),
          ],
        }),
      ]);

      const players = await playersOf("mtc-standings");
      const upgraded = players.find((p: JsonBody) => p.externalId === "mtc-standings-p1");
      expect(upgraded.checkedAt).toBeNull();
      expect(upgraded.state).toBe("changed");
      expect(upgraded.listStatus).toBe("full");
      expect(upgraded.diff.fields).toContainEqual({
        field: "listStatus",
        from: "none",
        to: "full",
      });
      expect(upgraded.diff.cards.added).toHaveLength(2);
    });

    it("mints the deck and its permalink when accepted again", async () => {
      const players = await playersOf("mtc-standings");
      const upgraded = players.find((p: JsonBody) => p.externalId === "mtc-standings-p1");
      const accepted = await post(`/meta/candidate-players/${upgraded.id}/accept`);
      rememberDeck(accepted.deckId);
      expect(accepted.created).toBe(false);
      expect(accepted.metaEventPlayerId).toBe(upgraded.metaEventPlayerId);

      const live = await db
        .selectFrom("metaEventPlayers")
        .selectAll()
        .where("id", "=", accepted.metaEventPlayerId)
        .executeTakeFirstOrThrow();
      expect(live.listStatus).toBe("full");
      expect(live.deckId).toBe(accepted.deckId);

      const deck = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(deck.shareToken).not.toBeNull();

      const cards = await db
        .selectFrom("deckCards")
        .select("cardId")
        .where("deckId", "=", accepted.deckId)
        .execute();
      expect(cards).toHaveLength(2);
    });

    it("settles once the live row carries the list", async () => {
      await upload([
        event("mtc-standings", {
          players: [
            player("mtc-standings-p1", { championName: "MTC Champion" }),
            standing("mtc-standings-p2", { rank: 2, legendName: "MTC Ghost Legend" }),
          ],
        }),
      ]);
      const players = await playersOf("mtc-standings");
      const settled = players.find((p: JsonBody) => p.externalId === "mtc-standings-p1");
      expect(settled.state).toBe("inSync");
      expect(settled.shareToken).not.toBeNull();
    });
  });

  describe("list status", () => {
    async function acceptEventOf(externalId: string): Promise<string> {
      const row = await queueRow(externalId);
      return rememberEvent(await post(`/meta/candidates/${row.id}/accept`));
    }

    it("defaults a status the source omits to a full list", async () => {
      await upload([event("mtc-default-status")]);
      const candidate = await onlyPlayerOf("mtc-default-status");
      expect(candidate.listStatus).toBe("full");
    });

    it("reads an entry with no cards as standings only", async () => {
      await upload([event("mtc-no-list", { players: [standing("mtc-no-list-p1")] })]);
      const candidate = await onlyPlayerOf("mtc-no-list");
      expect(candidate.listStatus).toBe("none");
      expect(candidate.cards).toBeNull();
      expect(candidate.unresolvedNames).toEqual([]);
    });

    it("accepts a partial list with a permalink, and no legend gate", async () => {
      // 'partial' claims a complete main deck, so it is a page-worthy deck and
      // the deckless entry's legend requirement does not apply to it.
      await upload([
        event("mtc-partial", {
          players: [
            player("mtc-partial-p1", {
              listStatus: "partial",
              cards: [{ name: "MTC Main", zone: "main", quantity: 3 }],
            }),
          ],
        }),
      ]);
      await acceptEventOf("mtc-partial");

      const candidate = await onlyPlayerOf("mtc-partial");
      const accepted = await post(`/meta/candidate-players/${candidate.id}/accept`);
      rememberDeck(accepted.deckId);

      const live = await db
        .selectFrom("metaEventPlayers")
        .select("listStatus")
        .where("id", "=", accepted.metaEventPlayerId)
        .executeTakeFirstOrThrow();
      expect(live.listStatus).toBe("partial");

      const deck = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(deck.shareToken).not.toBeNull();
    });

    it("re-queues a partial list that the source later completed", async () => {
      // The quieter upgrade: the deck already had its page, and only the side
      // zones are arriving. It still has to reach the reviewer.
      await upload([
        event("mtc-partial", {
          players: [
            player("mtc-partial-p1", {
              cards: [
                { name: "MTC Main", zone: "main", quantity: 3 },
                { name: "MTC Legend", zone: "legend", quantity: 1 },
              ],
            }),
          ],
        }),
      ]);

      const candidate = await onlyPlayerOf("mtc-partial");
      expect(candidate.checkedAt).toBeNull();
      expect(candidate.state).toBe("changed");
      expect(candidate.diff.fields).toContainEqual({
        field: "listStatus",
        from: "partial",
        to: "full",
      });
    });
  });

  describe("ignoring a candidate", () => {
    it("hides the event from the queue but keeps its candidate row", async () => {
      const row = await queueRow("mtc-good");
      await post(`/meta/candidates/${row.id}/ignore`, undefined, 204);
      expect(await inQueue("mtc-good")).toBe(false);

      const stored = await db
        .selectFrom("candidateMetaEvents")
        .select("id")
        .where("id", "=", row.id)
        .executeTakeFirst();
      expect(stored?.id).toBe(row.id);
    });

    it("skips the key on every later upload", async () => {
      const result = await upload([event("mtc-good")]);
      expect(result.ignoredSkipped).toBe(1);
      expect(result.newEvents).toBe(0);
      expect(await inQueue("mtc-good")).toBe(false);
    });

    it("hides one entry of an event and skips only that key", async () => {
      const payload = [
        event("mtc-partial", {
          players: [player("mtc-partial-p1"), player("mtc-partial-p2", { rank: 2 })],
        }),
      ];
      await upload(payload);
      const players = await playersOf("mtc-partial");
      const target = players.find((p: JsonBody) => p.externalId === "mtc-partial-p2");

      await post(`/meta/candidate-players/${target.id}/ignore`, undefined, 204);
      expect(await playerCountOf("mtc-partial")).toBe(1);

      const result = await upload(payload);
      expect(result.ignoredSkipped).toBe(1);
      expect(result.removedPlayers).toBe(0);
      expect(await playerCountOf("mtc-partial")).toBe(1);

      const stored = await db
        .selectFrom("candidateMetaPlayers")
        .select("id")
        .where("id", "=", target.id)
        .executeTakeFirst();
      expect(stored?.id).toBe(target.id);
    });

    it("lists both ignore lists, entry keys scoped to their event", async () => {
      const res = await app.fetch(adminReq("GET", "/meta/ignored-candidates"));
      expect(res.status).toBe(200);
      const { events, players } = await readJson(res);
      expect(events.some((e: JsonBody) => e.externalId === "mtc-good")).toBe(true);
      expect(
        players.some(
          (p: JsonBody) => p.externalId === "mtc-partial-p2" && p.eventExternalId === "mtc-partial",
        ),
      ).toBe(true);
    });

    it("un-ignores the key without staging a second row", async () => {
      const res = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/events", {
          provider: PROVIDER,
          externalId: "mtc-good",
        }),
      );
      expect(res.status).toBe(204);

      const result = await upload([event("mtc-good")]);
      expect(result.ignoredSkipped).toBe(0);
      expect(result.newEvents).toBe(0);
      expect(result.unchangedEvents).toBe(1);
      expect(await inQueue("mtc-good")).toBe(true);
    });

    it("404s when un-ignoring a key that was never ignored", async () => {
      const res = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/events", {
          provider: PROVIDER,
          externalId: "mtc-never",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  // Real sources number their entries per event, so entry "1" exists once per
  // event. Every key that spans events — the ignore list above all — has to
  // carry the event id with it.
  describe("entry external ids reused across events", () => {
    /** Both events, each carrying its own entry "1". */
    function twoEvents() {
      return [
        event("mtc-e1", { players: [player("1")] }),
        event("mtc-e2", { players: [player("1", { playerName: "MTC Second" })] }),
      ];
    }

    it("stages the same entry id under both events", async () => {
      const result = await upload(twoEvents());
      expect(result.newEvents).toBe(2);
      expect(result.newPlayers).toBe(2);

      const first = await onlyPlayerOf("mtc-e1");
      const second = await onlyPlayerOf("mtc-e2");
      expect(first.playerName).toBe("MTC Player");
      expect(second.playerName).toBe("MTC Second");
    });

    it("accepts both into separate live standings rows", async () => {
      for (const externalId of ["mtc-e1", "mtc-e2"]) {
        const row = await queueRow(externalId);
        const accepted = await post(`/meta/candidates/${row.id}/accept-with-players`);
        rememberEvent(accepted);
        expect(accepted.acceptedPlayers).toHaveLength(1);
      }

      const one = await onlyPlayerOf("mtc-e1");
      const two = await onlyPlayerOf("mtc-e2");
      expect(one.metaEventPlayerId).not.toBe(two.metaEventPlayerId);
      expect(one.deckId).not.toBe(two.deckId);

      // Each live row is reachable only through the candidate that produced it,
      // and each candidate sits under its own event.
      const links = await db
        .selectFrom("candidateMetaPlayers as cp")
        .innerJoin("candidateMetaEvents as ce", "ce.id", "cp.candidateEventId")
        .select(["ce.externalId as eventExternalId", "cp.metaEventPlayerId"])
        .where("cp.metaEventPlayerId", "in", [one.metaEventPlayerId, two.metaEventPlayerId])
        .execute();
      expect(links.map((row) => row.eventExternalId).toSorted()).toEqual(["mtc-e1", "mtc-e2"]);
    });

    it("re-links each entry to its own event's live row", async () => {
      await upload(twoEvents());
      const first = await onlyPlayerOf("mtc-e1");
      const second = await onlyPlayerOf("mtc-e2");
      expect(first.state).toBe("inSync");
      expect(second.state).toBe("inSync");
    });

    it("hides entry 1 of one event without touching entry 1 of the other", async () => {
      const target = await onlyPlayerOf("mtc-e1");
      await post(`/meta/candidate-players/${target.id}/ignore`, undefined, 204);
      expect(await playerCountOf("mtc-e1")).toBe(0);
      expect(await playerCountOf("mtc-e2")).toBe(1);

      const result = await upload(twoEvents());
      expect(result.ignoredSkipped).toBe(1);
      expect(await playerCountOf("mtc-e1")).toBe(0);
      expect(await playerCountOf("mtc-e2")).toBe(1);
    });

    it("un-ignores with the event-scoped key, link and all", async () => {
      const res = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/players", {
          provider: PROVIDER,
          eventExternalId: "mtc-e1",
          externalId: "1",
        }),
      );
      expect(res.status).toBe(204);

      const restaged = await onlyPlayerOf("mtc-e1");
      expect(restaged.state).toBe("inSync");
      expect(restaged.metaEventPlayerId).not.toBeNull();
      expect(restaged.deckId).not.toBeNull();
    });

    it("404s when un-ignoring the entry id under the wrong event", async () => {
      const target = await onlyPlayerOf("mtc-e2");
      await post(`/meta/candidate-players/${target.id}/ignore`, undefined, 204);

      const wrong = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/players", {
          provider: PROVIDER,
          eventExternalId: "mtc-e1",
          externalId: "1",
        }),
      );
      expect(wrong.status).toBe(404);

      const right = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/players", {
          provider: PROVIDER,
          eventExternalId: "mtc-e2",
          externalId: "1",
        }),
      );
      expect(right.status).toBe(204);
      expect(await playerCountOf("mtc-e2")).toBe(1);
    });
  });

  describe("a live standings row re-filed under another event", () => {
    it("reads as changed and names both events in the diff", async () => {
      const moving = await onlyPlayerOf("mtc-e1");
      const otherEvent = await queueRow("mtc-e2");

      // An admin re-files the row by hand. Accepting the candidate would move
      // it back, so the queue has to say so instead of settling.
      const res = await app.fetch(
        adminReq("PATCH", `/meta/players/${moving.metaEventPlayerId}`, {
          eventId: otherEvent.metaEventId,
        }),
      );
      expect(res.status).toBe(204);

      const moved = await onlyPlayerOf("mtc-e1");
      expect(moved.state).toBe("changed");
      expect(moved.diff.fields).toContainEqual({
        field: "event",
        from: "MTC mtc-e2",
        to: "MTC mtc-e1",
      });
    });

    it("does not settle it on the next upload", async () => {
      await upload([event("mtc-e1", { players: [player("1")] })]);
      const still = await onlyPlayerOf("mtc-e1");
      expect(still.state).toBe("changed");
    });

    it("moves it back on accept", async () => {
      const target = await onlyPlayerOf("mtc-e1");
      const accepted = await post(`/meta/candidate-players/${target.id}/accept`);
      expect(accepted.created).toBe(false);

      const settled = await onlyPlayerOf("mtc-e1");
      expect(settled.state).toBe("inSync");
    });
  });

  // Two sources describing one tournament have to land on one live event: the
  // second one links rather than accepting into an event of its own.
  describe("a second source on one event", () => {
    let liveEventId: string;
    let liveEventPlayerId: string;
    let liveDeckId: string;
    let secondCandidateId: string;
    let secondPlayerId: string;

    it("accepts the first source into a live event", async () => {
      await upload([event("mtc-ms", { name: "MTC Multi Source", players: [player("mtc-ms-p1")] })]);
      const row = await queueRow("mtc-ms");
      const accepted = await post(`/meta/candidates/${row.id}/accept-with-players`);
      liveEventId = rememberEvent(accepted);
      liveEventPlayerId = accepted.acceptedPlayers[0].metaEventPlayerId;
      liveDeckId = accepted.acceptedPlayers[0].deckId;
      expect(accepted.created).toBe(true);
    });

    it("suggests that live event for the second source's candidate", async () => {
      await uploadAs(PROVIDER_B, [
        event("mtc-ms-b", {
          // The same tournament under the other site's spelling, which is the
          // case the suggestion has to survive.
          name: "MTC Multi Source Berlin",
          players: [
            player("mtc-ms-b-p1", {
              rank: 2,
              cards: [
                { name: "MTC Legend", zone: "legend", quantity: 1 },
                { name: "MTC Main", zone: "main", quantity: 2 },
              ],
            }),
          ],
        }),
      ]);
      const row = await queueRow("mtc-ms-b");
      secondCandidateId = row.id;
      expect(row.metaEventId).toBeNull();

      const res = await app.fetch(
        adminReq("GET", `/meta/candidates/${secondCandidateId}/match-suggestions`),
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.suggestions.map((s: JsonBody) => s.metaEventId)).toContain(liveEventId);
    });

    it("counts no linked sources while the second candidate is unlinked", async () => {
      const unlinked = await queueRow("mtc-ms-b");
      const linked = await queueRow("mtc-ms");
      expect(unlinked.linkedSourceCount).toBe(0);
      expect(linked.linkedSourceCount).toBe(1);
    });

    it("links it to that event without creating a second one", async () => {
      const before = await db
        .selectFrom("metaEvents")
        .select("id")
        .where("name", "like", "MTC Multi Source%")
        .execute();
      expect(before).toHaveLength(1);

      const linked = await post(`/meta/candidates/${secondCandidateId}/link`, {
        metaEventId: liveEventId,
      });
      expect(linked.metaEventId).toBe(liveEventId);

      const after = await db
        .selectFrom("metaEvents")
        .select("id")
        .where("name", "like", "MTC Multi Source%")
        .execute();
      expect(after).toHaveLength(1);
    });

    it("cites both sources on the one event", async () => {
      const citations = await sourcesOf(liveEventId);
      expect(citations.map((c: JsonBody) => c.provider).toSorted()).toEqual([PROVIDER, PROVIDER_B]);
    });

    it("counts both candidates on each of their queue rows", async () => {
      const first = await queueRow("mtc-ms");
      const second = await queueRow("mtc-ms-b");
      expect(first.linkedSourceCount).toBe(2);
      expect(second.linkedSourceCount).toBe(2);
    });

    it("names both candidates as the live event's sources in the admin list", async () => {
      const res = await app.fetch(adminReq("GET", "/meta/events"));
      expect(res.status).toBe(200);
      const body = await readJson(res);
      const live = body.events.find((e: JsonBody) => e.id === liveEventId);
      expect(live.sources.map((source: JsonBody) => source.provider).toSorted()).toEqual([
        PROVIDER,
        PROVIDER_B,
      ]);
      expect(
        live.sources.find((source: JsonBody) => source.provider === PROVIDER_B).candidateEventId,
      ).toBe(secondCandidateId);
    });

    it("refuses to link the same candidate twice", async () => {
      const res = await app.fetch(
        adminReq("POST", `/meta/candidates/${secondCandidateId}/link`, {
          metaEventId: liveEventId,
        }),
      );
      expect(res.status).toBe(409);
    });

    it("returns both sources on the detail, each with its own standings", async () => {
      const full = await detail(secondCandidateId);
      expect(full.sources.map((source: JsonBody) => source.provider).toSorted()).toEqual([
        PROVIDER,
        PROVIDER_B,
      ]);
      const own = full.sources.find((source: JsonBody) => source.provider === PROVIDER_B);
      expect(own.players).toHaveLength(1);
      expect(own.name).toBe("MTC Multi Source Berlin");
      secondPlayerId = own.players[0].id;
    });

    it("suggests the live standings row for the second source's entry", async () => {
      const res = await app.fetch(
        adminReq("GET", `/meta/candidate-players/${secondPlayerId}/match-suggestions`),
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.suggestions.map((s: JsonBody) => s.metaEventPlayerId)).toContain(
        liveEventPlayerId,
      );
    });

    it("links the entry and takes one of its fields", async () => {
      const linked = await post(`/meta/candidate-players/${secondPlayerId}/link`, {
        metaEventPlayerId: liveEventPlayerId,
      });
      expect(linked.metaEventPlayerId).toBe(liveEventPlayerId);
      expect(linked.deckId).toBe(liveDeckId);

      const result = await post(`/meta/candidate-players/${secondPlayerId}/accept-field`, {
        field: "rank",
      });
      expect(result.metaEventPlayerId).toBe(liveEventPlayerId);

      const live = await db
        .selectFrom("metaEventPlayers")
        .selectAll()
        .where("id", "=", liveEventPlayerId)
        .executeTakeFirstOrThrow();
      expect(live.rank).toBe(2);
      // The field accept writes exactly the column it names.
      expect(live.playerName).toBe("MTC Player");
      expect(live.wins).toBe(5);
    });

    it("takes that source's list into the deck the first one created", async () => {
      const result = await post(`/meta/candidate-players/${secondPlayerId}/accept-list`);
      expect(result).toEqual({ metaEventPlayerId: liveEventPlayerId, deckId: liveDeckId });

      const main = await db
        .selectFrom("deckCards")
        .selectAll()
        .where("deckId", "=", liveDeckId)
        .where("cardId", "=", mainCardId)
        .executeTakeFirstOrThrow();
      expect(main.quantity).toBe(2);
    });

    it("takes one field from the second source and leaves every other column alone", async () => {
      const before = await db
        .selectFrom("metaEvents")
        .selectAll()
        .where("id", "=", liveEventId)
        .executeTakeFirstOrThrow();
      expect(before.name).toBe("MTC Multi Source");

      const result = await post(`/meta/candidates/${secondCandidateId}/accept-field`, {
        field: "name",
      });
      expect(result.metaEventId).toBe(liveEventId);

      const after = await db
        .selectFrom("metaEvents")
        .selectAll()
        .where("id", "=", liveEventId)
        .executeTakeFirstOrThrow();
      expect(after.name).toBe("MTC Multi Source Berlin");
      // Everything the field accept did not name is untouched — including the
      // slug, which is minted once and never renamed.
      expect(after.slug).toBe(before.slug);
      expect(after.organizer).toBe(before.organizer);
      expect(after.playerCount).toBe(before.playerCount);
      expect(after.eventDate).toBe(before.eventDate);
      expect(after.notes).toBe(before.notes);
    });

    it("refuses a whole-entity accept that would overwrite the other source", async () => {
      const res = await app.fetch(adminReq("POST", `/meta/candidates/${secondCandidateId}/accept`));
      expect(res.status).toBe(409);
      const body = await readJson(res);
      // A code of its own, so the client can prompt "overwrite?" instead of
      // showing a dead-end failure.
      expect(body.code).toBe("OVERWRITE_NOT_CONFIRMED");
      expect(body.message).toContain(PROVIDER);
    });

    it("refuses the first source's whole-entity accept just the same", async () => {
      const first = await queueRow("mtc-ms");
      const res = await app.fetch(adminReq("POST", `/meta/candidates/${first.id}/accept`));
      expect(res.status).toBe(409);
      const body = await readJson(res);
      expect(body.message).toContain(PROVIDER_B);
    });

    it("takes everything from one source once the overwrite is confirmed", async () => {
      const accepted = await post(`/meta/candidates/${secondCandidateId}/accept`, {
        overwriteAll: true,
      });
      expect(accepted.created).toBe(false);
      expect(accepted.metaEventId).toBe(liveEventId);

      const live = await db
        .selectFrom("metaEvents")
        .selectAll()
        .where("id", "=", liveEventId)
        .executeTakeFirstOrThrow();
      expect(live.name).toBe("MTC Multi Source Berlin");
    });

    it("unlinks the second source, removing its citation and keeping its values", async () => {
      const unlinked = await post(`/meta/candidates/${secondCandidateId}/unlink`);
      expect(unlinked.metaEventId).toBeNull();

      const citations = await sourcesOf(liveEventId);
      expect(citations.map((c: JsonBody) => c.provider)).toEqual([PROVIDER]);

      const live = await db
        .selectFrom("metaEvents")
        .selectAll()
        .where("id", "=", liveEventId)
        .executeTakeFirstOrThrow();
      expect(live.name).toBe("MTC Multi Source Berlin");
    });
  });

  describe("a signed-in user's decklist submission", () => {
    let liveEventId: string;
    let submissionId: string;
    let candidatePlayerId: string;
    let acceptedPlayerId: string;
    let acceptedDeckId: string;

    it("accepts an event for the submission to target", async () => {
      await upload([event("mtc-sub", { name: "MTC Submission Target", players: [] })]);
      const row = await queueRow("mtc-sub");
      liveEventId = rememberEvent(await post(`/meta/candidates/${row.id}/accept`));
    });

    it("stages the submission and its ledger row", async () => {
      const res = await app.fetch(
        req("POST", "/meta/submissions", {
          metaEventId: liveEventId,
          playerName: "MTC Contributor Player",
          rank: 2,
          wins: 4,
          losses: 2,
          cards: [
            { name: "MTC Legend", zone: "legend", quantity: 1 },
            { name: "MTC Main", zone: "main", quantity: 3 },
          ],
          note: "Copied from the stream overlay.",
        }),
      );
      expect(res.status).toBe(201);
      const body = await readJson(res);
      submissionId = body.id;
      expect(body.unresolvedNames).toEqual([]);

      const ledger = await db
        .selectFrom("metaSubmissions")
        .selectAll()
        .where("id", "=", submissionId)
        .executeTakeFirstOrThrow();
      expect(ledger.status).toBe("pending");
      expect(ledger.metaEventId).toBe(liveEventId);
      expect(ledger.eventName).toBe("MTC Submission Target");
    });

    it("shows up on the reviewing admin's detail as a directly-submitted entry", async () => {
      const full = await detailOf("mtc-sub");
      expect(full.submittedPlayers).toHaveLength(1);
      candidatePlayerId = full.submittedPlayers[0].id;
      expect(full.submittedPlayers[0].submittedByUserId).toBe(USER_ID);
      expect(full.submittedPlayers[0].submissionNote).toBe("Copied from the stream overlay.");
      // A submission hangs off the live event, not off any source column.
      expect(full.players).toHaveLength(0);
    });

    it("lists it in the contributor's own history", async () => {
      const res = await app.fetch(req("GET", "/meta/submissions"));
      expect(res.status).toBe(200);
      const body = await readJson(res);
      const mine = body.items.find((item: JsonBody) => item.id === submissionId);
      expect(mine.status).toBe("pending");
      expect(mine.playerName).toBe("MTC Contributor Player");
    });

    it("refuses to ignore it, because a submission has no source event to key on", async () => {
      const res = await app.fetch(
        adminReq("POST", `/meta/candidate-players/${candidatePlayerId}/ignore`),
      );
      expect(res.status).toBe(400);
    });

    it("credits the contributor and resolves the ledger when an admin accepts it", async () => {
      const accepted = await post(`/meta/candidate-players/${candidatePlayerId}/accept`);
      acceptedPlayerId = accepted.metaEventPlayerId;
      acceptedDeckId = accepted.deckId;
      rememberDeck(acceptedDeckId);
      expect(accepted.created).toBe(true);

      const credits = await db
        .selectFrom("metaCredits")
        .selectAll()
        .where("metaEventId", "=", liveEventId)
        .execute();
      expect(credits).toHaveLength(1);
      expect(credits[0].userId).toBe(USER_ID);
      expect(credits[0].metaEventPlayerId).toBe(acceptedPlayerId);

      const ledger = await db
        .selectFrom("metaSubmissions")
        .selectAll()
        .where("id", "=", submissionId)
        .executeTakeFirstOrThrow();
      expect(ledger.status).toBe("accepted");
      expect(ledger.acceptedDeckId).toBe(acceptedDeckId);
      expect(ledger.resolvedByUserId).toBe(USER_ID);
      expect(ledger.resolvedAt).not.toBeNull();
    });

    it("keeps the contributor off the public page until they opt in", async () => {
      const hidden = await app.fetch(req("GET", `/meta/events/${await slugOf(liveEventId)}`));
      expect(hidden.status).toBe(200);
      const hiddenBody = await readJson(hidden);
      expect(hiddenBody.event.contributors).toEqual([]);

      const patched = await app.fetch(
        req("PATCH", "/meta/credit-visibility", { visibility: "name" }),
      );
      expect(patched.status).toBe(200);

      const shown = await app.fetch(req("GET", `/meta/events/${await slugOf(liveEventId)}`));
      const shownBody = await readJson(shown);
      expect(shownBody.event.contributors).toHaveLength(1);
      expect(shownBody.event.sources.map((s: JsonBody) => s.provider)).toEqual([PROVIDER]);
      expect(shownBody.players.map((p: JsonBody) => p.id)).toEqual([acceptedPlayerId]);
    });

    it("resolves a second copy of the same list as already_correct", async () => {
      const sent = await app.fetch(
        req("POST", "/meta/submissions", {
          metaEventId: liveEventId,
          playerName: "MTC Contributor Player",
          rank: 2,
          cards: [
            { name: "MTC Legend", zone: "legend", quantity: 1 },
            { name: "MTC Main", zone: "main", quantity: 3 },
          ],
        }),
      );
      expect(sent.status).toBe(201);
      const duplicate = await readJson(sent);
      const duplicateId = duplicate.id;

      const resolved = await app.fetch(
        adminReq("POST", `/meta/submissions/${duplicateId}/resolve`, {
          status: "already_correct",
          reason: "already_correct",
          note: "We already have this list from the event's own source.",
        }),
      );
      expect(resolved.status).toBe(204);

      const ledger = await db
        .selectFrom("metaSubmissions")
        .selectAll()
        .where("id", "=", duplicateId)
        .executeTakeFirstOrThrow();
      expect(ledger.status).toBe("already_correct");
      expect(ledger.resolutionReason).toBe("already_correct");
      expect(ledger.resolutionNote).toBe("We already have this list from the event's own source.");
      expect(ledger.resolvedByUserId).toBe(USER_ID);
      expect(ledger.resolvedAt).not.toBeNull();

      // Staging survives, which is what lets a misclick be undone.
      const reopened = await app.fetch(adminReq("POST", `/meta/submissions/${duplicateId}/reopen`));
      expect(reopened.status).toBe(204);
      const back = await db
        .selectFrom("metaSubmissions")
        .selectAll()
        .where("id", "=", duplicateId)
        .executeTakeFirstOrThrow();
      expect(back.status).toBe("pending");
      expect(back.resolvedAt).toBeNull();
      // The admin's message is kept: a reopened submission is one being looked
      // at again, not one nothing was ever said about.
      expect(back.resolutionNote).toBe("We already have this list from the event's own source.");
    });

    it("refuses to resolve the accepted submission over its own credit", async () => {
      const res = await app.fetch(
        adminReq("POST", `/meta/submissions/${submissionId}/resolve`, { status: "rejected" }),
      );
      expect(res.status).toBe(409);
    });

    it("hands the reviewing admin the ledger row behind a staged entry", async () => {
      const res = await app.fetch(
        adminReq("GET", `/meta/submissions/by-candidate-player/${candidatePlayerId}`),
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.submission.id).toBe(submissionId);
      expect(body.submission.status).toBe("accepted");
    });

    it("takes the credit back when the contributor's candidate is unlinked", async () => {
      await post(`/meta/candidate-players/${candidatePlayerId}/unlink`);
      const credits = await db
        .selectFrom("metaCredits")
        .selectAll()
        .where("metaEventId", "=", liveEventId)
        .execute();
      expect(credits).toEqual([]);
    });
  });

  // An ignore keeps the candidate rows and their live links, which is what makes
  // ignore, un-ignore, re-upload resolve back to the rows this source already
  // produced instead of archiving a second copy of everything.
  describe("un-ignoring a key that was already accepted", () => {
    let liveEventId: string;
    let liveEventPlayerId: string;
    let liveDeckId: string;
    let candidateEventId: string;

    it("accepts the event and its entry into live rows", async () => {
      await upload([event("mtc-reignore")]);
      const row = await queueRow("mtc-reignore");
      candidateEventId = row.id;
      const accepted = await post(`/meta/candidates/${row.id}/accept-with-players`);
      liveEventId = rememberEvent(accepted);
      liveEventPlayerId = accepted.acceptedPlayers[0].metaEventPlayerId;
      liveDeckId = accepted.acceptedPlayers[0].deckId;
      expect(accepted.acceptedPlayers).toHaveLength(1);
    });

    it("ignores the whole event, keeping its candidate rows and their links", async () => {
      await post(`/meta/candidates/${candidateEventId}/ignore`, undefined, 204);
      expect(await inQueue("mtc-reignore")).toBe(false);

      const stored = await db
        .selectFrom("candidateMetaEvents")
        .selectAll()
        .where("id", "=", candidateEventId)
        .executeTakeFirstOrThrow();
      expect(stored.metaEventId).toBe(liveEventId);

      const entry = await db
        .selectFrom("candidateMetaPlayers")
        .selectAll()
        .where("candidateEventId", "=", candidateEventId)
        .executeTakeFirstOrThrow();
      expect(entry.metaEventPlayerId).toBe(liveEventPlayerId);
    });

    it("updates nothing while the key is ignored", async () => {
      const result = await upload([event("mtc-reignore", { name: "MTC ignored rename" })]);
      expect(result.ignoredSkipped).toBe(1);
      expect(result.newEvents).toBe(0);
      expect(result.updatedEvents).toBe(0);

      const rows = await db
        .selectFrom("candidateMetaEvents")
        .select("name")
        .where("provider", "=", PROVIDER)
        .where("externalId", "=", "mtc-reignore")
        .execute();
      expect(rows).toEqual([{ name: "MTC mtc-reignore" }]);
    });

    it("reappears with its links intact once un-ignored", async () => {
      const res = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/events", {
          provider: PROVIDER,
          externalId: "mtc-reignore",
        }),
      );
      expect(res.status).toBe(204);

      const restaged = await queueRow("mtc-reignore");
      const entry = await onlyPlayerOf("mtc-reignore");
      expect(restaged.metaEventId).toBe(liveEventId);
      expect(entry.metaEventPlayerId).toBe(liveEventPlayerId);
      expect(entry.deckId).toBe(liveDeckId);
    });

    it("archives no second copy when it is re-uploaded and accepted again", async () => {
      const result = await upload([event("mtc-reignore")]);
      expect(result.newEvents).toBe(0);
      expect(result.newPlayers).toBe(0);

      const target = await onlyPlayerOf("mtc-reignore");
      const accepted = await post(`/meta/candidate-players/${target.id}/accept`);
      expect(accepted).toEqual({
        metaEventPlayerId: liveEventPlayerId,
        deckId: liveDeckId,
        created: false,
      });

      const players = await db
        .selectFrom("metaEventPlayers")
        .select("id")
        .where("metaEventId", "=", liveEventId)
        .execute();
      expect(players.map((row) => row.id)).toEqual([liveEventPlayerId]);
    });
  });
});
