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

function deck(externalId: string, overrides: Record<string, unknown> = {}) {
  return {
    externalId,
    playerName: "MTC Pilot",
    finishTier: 1,
    record: "5-1",
    cards: [
      { name: "MTC Legend", zone: "legend", quantity: 1 },
      { name: "MTC Main", zone: "main", quantity: 3 },
    ],
    ...overrides,
  };
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
    decks: [deck(`${externalId}-d1`)],
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

async function decksOf(externalId: string): Promise<JsonBody[]> {
  const full = await detailOf(externalId);
  return full.decks;
}

async function onlyDeckOf(externalId: string): Promise<JsonBody> {
  const decks = await decksOf(externalId);
  expect(decks).toHaveLength(1);
  return decks[0];
}

async function deckCountOf(externalId: string): Promise<number> {
  const decks = await decksOf(externalId);
  return decks.length;
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

if (ctx) {
  const { db } = ctx;

  await seedTestUser(db, { id: USER_ID });
  legendCardId = await seedCard("MTC Legend", "mtc-legend", "legend");
  mainCardId = await seedCard("MTC Main", "mtc-main", "spell");
  aliasCardId = await seedCard("MTC Aliased", "mtc-aliased", "spell");

  afterAll(async () => {
    await db
      .deleteFrom("candidateMetaEvents")
      .where("provider", "in", [PROVIDER, PROVIDER_B])
      .execute();
    await db
      .deleteFrom("ignoredCandidateMetaEvents")
      .where("provider", "in", [PROVIDER, PROVIDER_B])
      .execute();
    await db
      .deleteFrom("ignoredCandidateMetaDecks")
      .where("provider", "in", [PROVIDER, PROVIDER_B])
      .execute();
    if (createdDeckIds.length > 0) {
      await db.deleteFrom("decks").where("id", "in", createdDeckIds).execute();
    }
    if (createdMetaEventIds.length > 0) {
      await db.deleteFrom("metaEvents").where("id", "in", createdMetaEventIds).execute();
    }
    await db.deleteFrom("cardNameAliases").where("cardId", "=", aliasCardId).execute();
    await db
      .deleteFrom("cards")
      .where("id", "in", [legendCardId, mainCardId, aliasCardId])
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
    it("stages new events and their decks", async () => {
      const result = await upload([event("mtc-a"), event("mtc-b")]);
      expect(result.newEvents).toBe(2);
      expect(result.newDecks).toBe(2);
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
      const decks = await decksOf("mtc-a");
      const cards = decks[0].cards;
      const legend = cards.find((c: JsonBody) => c.name === "MTC Legend");
      const main = cards.find((c: JsonBody) => c.name === "MTC Main");
      expect(legend.cardId).toBe(legendCardId);
      expect(main.cardId).toBe(mainCardId);
    });

    it("is idempotent — re-uploading the same payload changes nothing", async () => {
      const result = await upload([event("mtc-a")]);
      expect(result.newEvents).toBe(0);
      expect(result.updatedEvents).toBe(0);
      expect(result.unchangedEvents).toBe(1);
      expect(result.unchangedDecks).toBe(1);
      expect(result.removedDecks).toBe(0);
    });

    it("replaces only the uploaded event, leaving other candidates untouched", async () => {
      const before = await queueRow("mtc-b");
      await upload([event("mtc-a", { name: "MTC renamed" })]);
      const after = await queueRow("mtc-b");
      expect(after).toEqual(before);
      const renamed = await queueRow("mtc-a");
      expect(renamed.name).toBe("MTC renamed");
    });

    it("deletes a deck the event's payload no longer lists", async () => {
      // Carries the rename forward: an upload replaces the whole event, so
      // dropping the name here would silently revert it.
      const name = "MTC renamed";
      await upload([event("mtc-a", { name, decks: [deck("mtc-a-d1"), deck("mtc-a-d2")] })]);
      const withTwo = await queueRow("mtc-a");
      expect(withTwo.deckCount).toBe(2);

      const result = await upload([event("mtc-a", { name, decks: [deck("mtc-a-d1")] })]);
      expect(result.removedDecks).toBe(1);
      expect(result.removedDeckDetails).toEqual([
        { eventExternalId: "mtc-a", externalId: "mtc-a-d2", playerName: "MTC Pilot" },
      ]);
      const withOne = await queueRow("mtc-a");
      expect(withOne.deckCount).toBe(1);
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

    it("reports an in-payload duplicate deck id within one event", async () => {
      const result = await upload([
        event("mtc-dupe", {
          name: "MTC first",
          decks: [deck("mtc-dupe-d1", { playerName: "MTC One" }), deck("mtc-dupe-d1")],
        }),
      ]);
      expect(result.errors[0]).toContain("Duplicate deck externalId");
      const decks = await decksOf("mtc-dupe");
      expect(decks).toHaveLength(1);
      expect(decks[0].playerName).toBe("MTC One");
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

    it("skips a deck whose card zone is not a real deck zone", async () => {
      const result = await upload([
        event("mtc-good", {
          decks: [
            deck("mtc-good-d1", { cards: [{ name: "MTC Main", zone: "attic", quantity: 1 }] }),
          ],
        }),
      ]);
      expect(result.errors[0]).toContain('unknown zone "attic"');
    });

    it("reads blank strings as absent rather than skipping the event", async () => {
      // Scrapers routinely emit "" for a field they found nothing for. The live
      // columns CHECK a minimum length, so "" has to become NULL at the wire.
      const result = await upload([
        event("mtc-blank", {
          organizer: "",
          sourceUrl: "   ",
          notes: "",
          decks: [deck("mtc-blank-d1", { record: "", name: "  " })],
        }),
      ]);
      expect(result.errors).toEqual([]);
      expect(result.newEvents).toBe(1);
      expect(result.newDecks).toBe(1);

      const full = await detailOf("mtc-blank");
      expect(full.organizer).toBeNull();
      expect(full.sourceUrl).toBeNull();
      expect(full.notes).toBeNull();
      expect(full.decks[0].record).toBeNull();
      expect(full.decks[0].name).toBeNull();
    });

    it("stages an unmatched card name and reports it", async () => {
      const result = await upload([
        event("mtc-unmatched", {
          decks: [
            deck("mtc-unmatched-d1", {
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
          deckExternalId: "mtc-unmatched-d1",
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

    it("resets when an upload changes a deck's card list", async () => {
      const before = await decksOf("mtc-b");
      await post(`/meta/candidate-decks/${before[0].id}/check`, { checked: true }, 204);
      const marked = await decksOf("mtc-b");
      expect(marked[0].checkedAt).not.toBeNull();

      await upload([
        event("mtc-b", {
          organizer: "MTC Someone Else",
          decks: [
            deck("mtc-b-d1", {
              cards: [
                { name: "MTC Legend", zone: "legend", quantity: 1 },
                { name: "MTC Main", zone: "main", quantity: 2 },
              ],
            }),
          ],
        }),
      ]);
      const after = await decksOf("mtc-b");
      expect(after[0].checkedAt).toBeNull();
    });

    it("survives an upload that only reorders a deck's card list", async () => {
      const legend = { name: "MTC Legend", zone: "legend", quantity: 1 };
      const main = { name: "MTC Main", zone: "main", quantity: 2 };
      const organizer = "MTC Someone Else";

      const marked = await decksOf("mtc-b");
      await post(`/meta/candidate-decks/${marked[0].id}/check`, { checked: true }, 204);
      const before = await decksOf("mtc-b");
      expect(before[0].checkedAt).not.toBeNull();

      // Same rows, opposite order. A source is free to reshuffle its list, and
      // that must not look like an edit and undo a completed review.
      const result = await upload([
        event("mtc-b", {
          organizer,
          decks: [deck("mtc-b-d1", { cards: [main, legend] })],
        }),
      ]);
      expect(result.unchangedDecks).toBe(1);
      expect(result.updatedDecks).toBe(0);

      const after = await decksOf("mtc-b");
      expect(after[0].checkedAt).toBe(before[0].checkedAt);
    });
  });

  describe("POST /admin/meta/candidates/rematch", () => {
    it("resolves a name once an alias exists for it", async () => {
      await upload([
        event("mtc-alias", {
          decks: [
            deck("mtc-alias-d1", {
              cards: [
                { name: "MTC Legend", zone: "legend", quantity: 1 },
                { name: "MTC Nickname", zone: "main", quantity: 2 },
              ],
            }),
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
      expect(result.resolved).toBeGreaterThanOrEqual(1);

      const resolved = await queueRow("mtc-alias");
      expect(resolved.unresolvedCardCount).toBe(0);
      const decks = await decksOf("mtc-alias");
      const nickname = decks[0].cards.find((c: JsonBody) => c.name === "MTC Nickname");
      expect(nickname.cardId).toBe(aliasCardId);
    });

    it("resolves an alias at upload time too, for every later push", async () => {
      await upload([
        event("mtc-alias2", {
          decks: [
            deck("mtc-alias2-d1", { cards: [{ name: "MTC Nickname", zone: "main", quantity: 1 }] }),
          ],
        }),
      ]);
      const row = await queueRow("mtc-alias2");
      expect(row.unresolvedCardCount).toBe(0);
    });
  });

  describe("accepting a candidate", () => {
    it("refuses a deck whose parent event is not accepted yet", async () => {
      const decks = await decksOf("mtc-a");
      const res = await app.fetch(adminReq("POST", `/meta/candidate-decks/${decks[0].id}/accept`));
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.message).toContain("Accept the event first");
    });

    it("creates the live event and cites the source that produced it", async () => {
      const row = await queueRow("mtc-a");
      const accepted = await post(`/meta/candidates/${row.id}/accept`);
      createdMetaEventIds.push(accepted.metaEventId);

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

    it("refuses a deck with an unmatched card name", async () => {
      const row = await queueRow("mtc-unmatched");
      const accepted = await post(`/meta/candidates/${row.id}/accept`);
      createdMetaEventIds.push(accepted.metaEventId);

      const decks = await decksOf("mtc-unmatched");
      const res = await app.fetch(adminReq("POST", `/meta/candidate-decks/${decks[0].id}/accept`));
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.message).toContain("MTC Ghost");
    });

    it("creates the live deck, names it after its legend, and links the candidate", async () => {
      const decks = await decksOf("mtc-a");
      const accepted = await post(`/meta/candidate-decks/${decks[0].id}/accept`);
      createdDeckIds.push(accepted.deckId);
      expect(accepted.created).toBe(true);

      const satellite = await db
        .selectFrom("metaDecks")
        .selectAll()
        .where("deckId", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.finishTier).toBe(1);

      // The source key lives on the candidate: `deck_id` is the only link.
      const candidate = await db
        .selectFrom("candidateMetaDecks")
        .select(["deckId", "externalId"])
        .where("id", "=", decks[0].id)
        .executeTakeFirstOrThrow();
      expect(candidate.deckId).toBe(accepted.deckId);
      expect(candidate.externalId).toBe("mtc-a-d1");

      const live = await db
        .selectFrom("decks")
        .selectAll()
        .where("id", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(live.userId).toBe("meta-archive");
      expect(live.isPublic).toBe(true);
      expect(live.shareToken).not.toBeNull();
      // No name in the payload, so it falls back to the legend plus the pilot.
      expect(live.name).toBe("MTC Legend (MTC Pilot)");

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
      expect(row.unacceptedDeckCount).toBe(0);

      const decks = await decksOf("mtc-a");
      expect(decks[0].state).toBe("inSync");
      expect(decks[0].deckId).not.toBeNull();
      expect(decks[0].shareToken).not.toBeNull();
      expect(decks[0].diff).toEqual({ fields: [], cards: { added: [], removed: [], changed: [] } });
    });

    it("shows a diff when a later upload disagrees with the live rows", async () => {
      await upload([
        event("mtc-a", {
          name: "MTC corrected",
          playerCount: 48,
          decks: [
            deck("mtc-a-d1", {
              finishTier: 2,
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
      expect(full.decks[0].state).toBe("changed");
      expect(full.decks[0].diff.fields).toEqual([{ field: "finishTier", from: 1, to: 2 }]);
      expect(full.decks[0].diff.cards.changed).toEqual([
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

      const decks = await decksOf("mtc-a");
      const acceptedDeck = await post(`/meta/candidate-decks/${decks[0].id}/accept`);
      expect(acceptedDeck.created).toBe(false);

      const satellite = await db
        .selectFrom("metaDecks")
        .selectAll()
        .where("deckId", "=", decks[0].deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.finishTier).toBe(2);

      const main = await db
        .selectFrom("deckCards")
        .selectAll()
        .where("deckId", "=", decks[0].deckId)
        .where("cardId", "=", mainCardId)
        .executeTakeFirstOrThrow();
      expect(main.quantity).toBe(2);
    });

    it("accepts an event together with its ready decks, reporting the rest", async () => {
      await upload([
        event("mtc-batch", {
          decks: [
            deck("mtc-batch-d1"),
            deck("mtc-batch-d2", {
              finishTier: 2,
              cards: [{ name: "MTC Ghost", zone: "main", quantity: 1 }],
            }),
          ],
        }),
      ]);
      const row = await queueRow("mtc-batch");
      const accepted = await post(`/meta/candidates/${row.id}/accept-with-decks`);
      createdMetaEventIds.push(accepted.metaEventId);
      for (const d of accepted.acceptedDecks) {
        createdDeckIds.push(d.deckId);
      }

      expect(accepted.created).toBe(true);
      expect(accepted.acceptedDecks).toHaveLength(1);
      expect(accepted.skippedDecks).toHaveLength(1);
      expect(accepted.skippedDecks[0].externalId).toBe("mtc-batch-d2");
      expect(accepted.skippedDecks[0].reason).toContain("MTC Ghost");
    });

    it("sums two rows that resolve to the same card and zone", async () => {
      // "MTC Nickname" is aliased onto the same card as "MTC Aliased", so the
      // deck lands two main-zone rows on one card id. deck_cards is unique on
      // (deck, card, zone), so accepting has to fold them rather than 500.
      const payload = [
        event("mtc-dup-cards", {
          decks: [
            deck("mtc-dup-cards-d1", {
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
      const accepted = await post(`/meta/candidates/${row.id}/accept-with-decks`);
      createdMetaEventIds.push(accepted.metaEventId);
      for (const d of accepted.acceptedDecks) {
        createdDeckIds.push(d.deckId);
      }
      expect(accepted.acceptedDecks).toHaveLength(1);
      expect(accepted.skippedDecks).toEqual([]);

      const cards = await db
        .selectFrom("deckCards")
        .selectAll()
        .where("deckId", "=", accepted.acceptedDecks[0].deckId)
        .where("cardId", "=", aliasCardId)
        .execute();
      expect(cards).toHaveLength(1);
      expect(cards[0].quantity).toBe(3);

      // The ingest side has to fold the same way, or the accepted deck would
      // read as changed against the row it just wrote.
      await upload(payload);
      const decks = await decksOf("mtc-dup-cards");
      expect(decks[0].state).toBe("inSync");
    });

    it("404s on an unknown candidate id", async () => {
      const res = await app.fetch(
        adminReq("POST", `/meta/candidates/${crypto.randomUUID()}/accept`),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("list status", () => {
    async function acceptEventOf(externalId: string): Promise<string> {
      const row = await queueRow(externalId);
      const accepted = await post(`/meta/candidates/${row.id}/accept`);
      createdMetaEventIds.push(accepted.metaEventId);
      return accepted.metaEventId;
    }

    it("refuses an archetype whose legend never resolved", async () => {
      await upload([
        event("mtc-no-legend", {
          decks: [
            deck("mtc-no-legend-d1", {
              listStatus: "archetype",
              // Resolvable, so the general card gate passes — but it says
              // nothing about which legend the pilot played.
              cards: [{ name: "MTC Main", zone: "main", quantity: 3 }],
            }),
          ],
        }),
      ]);
      await acceptEventOf("mtc-no-legend");

      const candidate = await onlyDeckOf("mtc-no-legend");
      expect(candidate.listStatus).toBe("archetype");
      expect(candidate.unresolvedNames).toEqual([]);

      const res = await app.fetch(adminReq("POST", `/meta/candidate-decks/${candidate.id}/accept`));
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.message).toContain("archetype needs its legend");
    });

    it("accepts an archetype into a live deck with no permalink", async () => {
      await upload([
        event("mtc-archetype", {
          decks: [
            deck("mtc-archetype-d1", {
              listStatus: "archetype",
              cards: [{ name: "MTC Legend", zone: "legend", quantity: 1 }],
            }),
          ],
        }),
      ]);
      await acceptEventOf("mtc-archetype");

      const candidate = await onlyDeckOf("mtc-archetype");
      const accepted = await post(`/meta/candidate-decks/${candidate.id}/accept`);
      createdDeckIds.push(accepted.deckId);

      const satellite = await db
        .selectFrom("metaDecks")
        .select("listStatus")
        .where("deckId", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.listStatus).toBe("archetype");

      const live = await db
        .selectFrom("decks")
        .select(["shareToken", "isPublic"])
        .where("id", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(live.shareToken).toBeNull();
      expect(live.isPublic).toBe(true);
    });

    it("re-queues the candidate when the source publishes the real list", async () => {
      // Same deck key, now with the whole list behind it.
      await upload([
        event("mtc-archetype", {
          decks: [deck("mtc-archetype-d1", { listStatus: "full" })],
        }),
      ]);

      const candidate = await onlyDeckOf("mtc-archetype");
      // The upgrade is a source change, so the review it already had is void.
      expect(candidate.checkedAt).toBeNull();
      expect(candidate.state).toBe("changed");
      expect(candidate.listStatus).toBe("full");
      expect(candidate.diff.fields).toEqual([
        { field: "listStatus", from: "archetype", to: "full" },
      ]);
      expect(candidate.diff.cards.added).toHaveLength(1);
    });

    it("fills in the list and mints the permalink when accepted again", async () => {
      const candidate = await onlyDeckOf("mtc-archetype");
      const accepted = await post(`/meta/candidate-decks/${candidate.id}/accept`);
      expect(accepted.created).toBe(false);

      const satellite = await db
        .selectFrom("metaDecks")
        .select("listStatus")
        .where("deckId", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.listStatus).toBe("full");

      const live = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(live.shareToken).not.toBeNull();

      const cards = await db
        .selectFrom("deckCards")
        .select("cardId")
        .where("deckId", "=", accepted.deckId)
        .execute();
      expect(cards).toHaveLength(2);

      // And it settles: the live row now says what the candidate says.
      await upload([
        event("mtc-archetype", {
          decks: [deck("mtc-archetype-d1", { listStatus: "full" })],
        }),
      ]);
      const settled = await onlyDeckOf("mtc-archetype");
      expect(settled.state).toBe("inSync");
      expect(settled.shareToken).toBe(live.shareToken);
    });

    it("defaults a status the source omits to a full list", async () => {
      await upload([event("mtc-default-status")]);
      const candidate = await onlyDeckOf("mtc-default-status");
      expect(candidate.listStatus).toBe("full");
    });

    it("accepts a partial list with a permalink, and no legend gate", async () => {
      // 'partial' claims a complete main deck, so it is a page-worthy deck and
      // the archetype's legend requirement does not apply to it.
      await upload([
        event("mtc-partial", {
          decks: [
            deck("mtc-partial-d1", {
              listStatus: "partial",
              cards: [{ name: "MTC Main", zone: "main", quantity: 3 }],
            }),
          ],
        }),
      ]);
      await acceptEventOf("mtc-partial");

      const candidate = await onlyDeckOf("mtc-partial");
      const accepted = await post(`/meta/candidate-decks/${candidate.id}/accept`);
      createdDeckIds.push(accepted.deckId);

      const satellite = await db
        .selectFrom("metaDecks")
        .select("listStatus")
        .where("deckId", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.listStatus).toBe("partial");

      const live = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", accepted.deckId)
        .executeTakeFirstOrThrow();
      expect(live.shareToken).not.toBeNull();
    });

    it("re-queues a partial list that the source later completed", async () => {
      // The quieter upgrade: the deck already had its page, and only the side
      // zones are arriving. It still has to reach the reviewer.
      await upload([
        event("mtc-partial", {
          decks: [
            deck("mtc-partial-d1", {
              cards: [
                { name: "MTC Main", zone: "main", quantity: 3 },
                { name: "MTC Legend", zone: "legend", quantity: 1 },
              ],
            }),
          ],
        }),
      ]);

      const candidate = await onlyDeckOf("mtc-partial");
      expect(candidate.checkedAt).toBeNull();
      expect(candidate.state).toBe("changed");
      expect(candidate.diff.fields).toEqual([{ field: "listStatus", from: "partial", to: "full" }]);
    });
  });

  describe("ignoring a candidate", () => {
    it("drops the candidate and skips the key on every later upload", async () => {
      const row = await queueRow("mtc-good");
      await post(`/meta/candidates/${row.id}/ignore`, undefined, 204);
      expect(await inQueue("mtc-good")).toBe(false);

      const result = await upload([event("mtc-good")]);
      expect(result.ignoredSkipped).toBe(1);
      expect(result.newEvents).toBe(0);
      expect(await inQueue("mtc-good")).toBe(false);
    });

    it("drops one deck of an event and skips only that key", async () => {
      const payload = [
        event("mtc-partial", { decks: [deck("mtc-partial-d1"), deck("mtc-partial-d2")] }),
      ];
      await upload(payload);
      const decks = await decksOf("mtc-partial");
      const target = decks.find((d: JsonBody) => d.externalId === "mtc-partial-d2");

      await post(`/meta/candidate-decks/${target.id}/ignore`, undefined, 204);
      const remaining = await decksOf("mtc-partial");
      expect(remaining).toHaveLength(1);

      const result = await upload(payload);
      expect(result.ignoredSkipped).toBe(1);
      const stillRemaining = await decksOf("mtc-partial");
      expect(stillRemaining).toHaveLength(1);
    });

    it("lists both ignore lists, deck keys scoped to their event", async () => {
      const res = await app.fetch(adminReq("GET", "/meta/ignored-candidates"));
      expect(res.status).toBe(200);
      const { events, decks } = await readJson(res);
      expect(events.some((e: JsonBody) => e.externalId === "mtc-good")).toBe(true);
      expect(
        decks.some(
          (d: JsonBody) => d.externalId === "mtc-partial-d2" && d.eventExternalId === "mtc-partial",
        ),
      ).toBe(true);
    });

    it("un-ignores, letting the key stage again", async () => {
      const res = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/events", {
          provider: PROVIDER,
          externalId: "mtc-good",
        }),
      );
      expect(res.status).toBe(204);

      const result = await upload([event("mtc-good")]);
      expect(result.ignoredSkipped).toBe(0);
      expect(result.newEvents).toBe(1);
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

  // Real sources number their lists per event, so deck "1" exists once per
  // event. Every key that outlives the candidate row — the ignore list, the
  // live deck's source columns — has to carry the event id with it.
  describe("deck external ids reused across events", () => {
    /** Both events, each carrying its own deck "1". */
    function twoEvents() {
      return [
        event("mtc-e1", { decks: [deck("1")] }),
        event("mtc-e2", { decks: [deck("1", { playerName: "MTC Second" })] }),
      ];
    }

    it("stages the same deck id under both events", async () => {
      const result = await upload(twoEvents());
      expect(result.newEvents).toBe(2);
      expect(result.newDecks).toBe(2);

      const first = await onlyDeckOf("mtc-e1");
      const second = await onlyDeckOf("mtc-e2");
      expect(first.playerName).toBe("MTC Pilot");
      expect(second.playerName).toBe("MTC Second");
    });

    it("accepts both into separate live decks", async () => {
      for (const externalId of ["mtc-e1", "mtc-e2"]) {
        const row = await queueRow(externalId);
        const accepted = await post(`/meta/candidates/${row.id}/accept-with-decks`);
        createdMetaEventIds.push(accepted.metaEventId);
        for (const d of accepted.acceptedDecks) {
          createdDeckIds.push(d.deckId);
        }
        expect(accepted.acceptedDecks).toHaveLength(1);
      }

      const one = await onlyDeckOf("mtc-e1");
      const two = await onlyDeckOf("mtc-e2");
      expect(one.deckId).not.toBe(two.deckId);

      // Each live deck is reachable only through the candidate that produced
      // it, and each candidate sits under its own event.
      const links = await db
        .selectFrom("candidateMetaDecks as cd")
        .innerJoin("candidateMetaEvents as ce", "ce.id", "cd.candidateEventId")
        .select(["ce.externalId as eventExternalId", "cd.deckId"])
        .where("cd.deckId", "in", [one.deckId, two.deckId])
        .execute();
      expect(links.map((row) => row.eventExternalId).toSorted()).toEqual(["mtc-e1", "mtc-e2"]);
    });

    it("re-links each deck to its own event's live row", async () => {
      await upload(twoEvents());
      const first = await onlyDeckOf("mtc-e1");
      const second = await onlyDeckOf("mtc-e2");
      expect(first.state).toBe("inSync");
      expect(second.state).toBe("inSync");
    });

    it("ignores deck 1 of one event without touching deck 1 of the other", async () => {
      const target = await onlyDeckOf("mtc-e1");
      await post(`/meta/candidate-decks/${target.id}/ignore`, undefined, 204);
      expect(await deckCountOf("mtc-e1")).toBe(0);
      expect(await deckCountOf("mtc-e2")).toBe(1);

      const result = await upload(twoEvents());
      expect(result.ignoredSkipped).toBe(1);
      expect(await deckCountOf("mtc-e1")).toBe(0);
      expect(await deckCountOf("mtc-e2")).toBe(1);
    });

    it("un-ignores with the event-scoped key and re-links the live deck", async () => {
      const res = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/decks", {
          provider: PROVIDER,
          eventExternalId: "mtc-e1",
          externalId: "1",
        }),
      );
      expect(res.status).toBe(204);

      await upload(twoEvents());
      const restaged = await onlyDeckOf("mtc-e1");
      expect(restaged.state).toBe("inSync");
    });

    it("404s when un-ignoring the deck id under the wrong event", async () => {
      const target = await onlyDeckOf("mtc-e2");
      await post(`/meta/candidate-decks/${target.id}/ignore`, undefined, 204);

      const wrong = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/decks", {
          provider: PROVIDER,
          eventExternalId: "mtc-e1",
          externalId: "1",
        }),
      );
      expect(wrong.status).toBe(404);

      const right = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/decks", {
          provider: PROVIDER,
          eventExternalId: "mtc-e2",
          externalId: "1",
        }),
      );
      expect(right.status).toBe(204);
      await upload(twoEvents());
      expect(await deckCountOf("mtc-e2")).toBe(1);
    });
  });

  describe("a live deck re-filed under another event", () => {
    it("reads as changed and names both events in the diff", async () => {
      const moving = await onlyDeckOf("mtc-e1");
      const otherEvent = await queueRow("mtc-e2");

      // An admin re-files the archived deck by hand. Accepting the candidate
      // would move it back, so the queue has to say so instead of settling.
      const res = await app.fetch(
        adminReq("PATCH", `/meta/decks/${moving.deckId}`, { eventId: otherEvent.metaEventId }),
      );
      expect(res.status).toBe(204);

      const moved = await onlyDeckOf("mtc-e1");
      expect(moved.state).toBe("changed");
      expect(moved.diff.fields).toContainEqual({
        field: "event",
        from: "MTC mtc-e2",
        to: "MTC mtc-e1",
      });
    });

    it("does not settle it on the next upload", async () => {
      await upload([event("mtc-e1", { decks: [deck("1")] })]);
      const still = await onlyDeckOf("mtc-e1");
      expect(still.state).toBe("changed");
    });

    it("moves it back on accept", async () => {
      const target = await onlyDeckOf("mtc-e1");
      const accepted = await post(`/meta/candidate-decks/${target.id}/accept`);
      expect(accepted.created).toBe(false);

      const settled = await onlyDeckOf("mtc-e1");
      expect(settled.state).toBe("inSync");
    });
  });

  // Two sources describing one tournament have to land on one live event: the
  // second one links rather than accepting into an event of its own.
  describe("a second source on one event", () => {
    let liveEventId: string;
    let secondCandidateId: string;

    it("accepts the first source into a live event", async () => {
      await upload([event("mtc-ms", { name: "MTC Multi Source", decks: [deck("mtc-ms-d1")] })]);
      const row = await queueRow("mtc-ms");
      const accepted = await post(`/meta/candidates/${row.id}/accept-with-decks`);
      liveEventId = accepted.metaEventId;
      createdMetaEventIds.push(liveEventId);
      for (const d of accepted.acceptedDecks) {
        createdDeckIds.push(d.deckId);
      }
      expect(accepted.created).toBe(true);
    });

    it("suggests that live event for the second source's candidate", async () => {
      await uploadAs(PROVIDER_B, [
        event("mtc-ms-b", {
          // The same tournament under the other site's spelling, which is the
          // case the suggestion has to survive.
          name: "MTC Multi Source Berlin",
          decks: [deck("mtc-ms-b-d1")],
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

    it("refuses to link the same candidate twice", async () => {
      const res = await app.fetch(
        adminReq("POST", `/meta/candidates/${secondCandidateId}/link`, {
          metaEventId: liveEventId,
        }),
      );
      expect(res.status).toBe(409);
    });

    it("returns both sources on the detail, each with its own decks", async () => {
      const full = await detail(secondCandidateId);
      expect(full.sources.map((source: JsonBody) => source.provider).toSorted()).toEqual([
        PROVIDER,
        PROVIDER_B,
      ]);
      const own = full.sources.find((source: JsonBody) => source.provider === PROVIDER_B);
      expect(own.decks).toHaveLength(1);
      expect(own.name).toBe("MTC Multi Source Berlin");
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
    let candidateDeckId: string;
    let acceptedDeckId: string;

    it("accepts an event for the submission to target", async () => {
      await upload([event("mtc-sub", { name: "MTC Submission Target", decks: [] })]);
      const row = await queueRow("mtc-sub");
      const accepted = await post(`/meta/candidates/${row.id}/accept`);
      liveEventId = accepted.metaEventId;
      createdMetaEventIds.push(liveEventId);
    });

    it("stages the submission and its ledger row", async () => {
      const res = await app.fetch(
        req("POST", "/meta/submissions", {
          metaEventId: liveEventId,
          playerName: "MTC Contributor Pilot",
          finishTier: 2,
          record: "4-2",
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
        .selectFrom("metaDeckSubmissions")
        .selectAll()
        .where("id", "=", submissionId)
        .executeTakeFirstOrThrow();
      expect(ledger.status).toBe("pending");
      expect(ledger.metaEventId).toBe(liveEventId);
      expect(ledger.eventName).toBe("MTC Submission Target");
    });

    it("shows up on the reviewing admin's detail as a directly-submitted deck", async () => {
      const full = await detailOf("mtc-sub");
      expect(full.submittedDecks).toHaveLength(1);
      candidateDeckId = full.submittedDecks[0].id;
      expect(full.submittedDecks[0].submittedByUserId).toBe(USER_ID);
      expect(full.submittedDecks[0].submissionNote).toBe("Copied from the stream overlay.");
      // A submission hangs off the live event, not off any source column.
      expect(full.decks).toHaveLength(0);
    });

    it("lists it in the contributor's own history", async () => {
      const res = await app.fetch(req("GET", "/meta/submissions"));
      expect(res.status).toBe(200);
      const body = await readJson(res);
      const mine = body.items.find((item: JsonBody) => item.id === submissionId);
      expect(mine.status).toBe("pending");
      expect(mine.playerName).toBe("MTC Contributor Pilot");
    });

    it("refuses to ignore it, because a submission has no source event to key on", async () => {
      const res = await app.fetch(
        adminReq("POST", `/meta/candidate-decks/${candidateDeckId}/ignore`),
      );
      expect(res.status).toBe(400);
    });

    it("credits the contributor and resolves the ledger when an admin accepts it", async () => {
      const accepted = await post(`/meta/candidate-decks/${candidateDeckId}/accept`);
      acceptedDeckId = accepted.deckId;
      createdDeckIds.push(acceptedDeckId);
      expect(accepted.created).toBe(true);

      const credits = await db
        .selectFrom("metaCredits")
        .selectAll()
        .where("metaEventId", "=", liveEventId)
        .execute();
      expect(credits).toHaveLength(1);
      expect(credits[0].userId).toBe(USER_ID);
      expect(credits[0].deckId).toBe(acceptedDeckId);

      const ledger = await db
        .selectFrom("metaDeckSubmissions")
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
    });

    it("resolves a second copy of the same list as already_correct", async () => {
      const sent = await app.fetch(
        req("POST", "/meta/submissions", {
          metaEventId: liveEventId,
          playerName: "MTC Contributor Pilot",
          finishTier: 2,
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
        .selectFrom("metaDeckSubmissions")
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
        .selectFrom("metaDeckSubmissions")
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

    it("hands the reviewing admin the ledger row behind a staged deck", async () => {
      const res = await app.fetch(
        adminReq("GET", `/meta/submissions/by-candidate-deck/${candidateDeckId}`),
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.submission.id).toBe(submissionId);
      expect(body.submission.status).toBe("accepted");
    });

    it("takes the credit back when the contributor's candidate is unlinked", async () => {
      await post(`/meta/candidate-decks/${candidateDeckId}/unlink`);
      const credits = await db
        .selectFrom("metaCredits")
        .selectAll()
        .where("metaEventId", "=", liveEventId)
        .execute();
      expect(credits).toEqual([]);
    });
  });
  // An ignore deletes the candidate rows, so the source key cannot live only
  // there: un-ignoring the key and re-uploading has to find the rows this source
  // already produced, or the archive gains a second copy of the same deck.
  describe("un-ignoring a key that was already accepted", () => {
    let liveEventId: string;
    let liveDeckId: string;

    it("accepts the event and its deck into live rows", async () => {
      await upload([event("mtc-reignore")]);
      const row = await queueRow("mtc-reignore");
      const accepted = await post(`/meta/candidates/${row.id}/accept-with-decks`);
      liveEventId = accepted.metaEventId;
      liveDeckId = accepted.acceptedDecks[0].deckId;
      createdMetaEventIds.push(liveEventId);
      createdDeckIds.push(liveDeckId);
      expect(accepted.acceptedDecks).toHaveLength(1);
    });

    it("ignores the whole event, dropping the candidate rows", async () => {
      const row = await queueRow("mtc-reignore");
      await post(`/meta/candidates/${row.id}/ignore`, undefined, 204);
      expect(await inQueue("mtc-reignore")).toBe(false);
    });

    it("re-links both live rows on the upload after un-ignoring", async () => {
      const res = await app.fetch(
        adminReq("DELETE", "/meta/ignored-candidates/events", {
          provider: PROVIDER,
          externalId: "mtc-reignore",
        }),
      );
      expect(res.status).toBe(204);

      await upload([event("mtc-reignore")]);
      const restaged = await queueRow("mtc-reignore");
      const restagedDeck = await onlyDeckOf("mtc-reignore");
      // The citation and the deck source key both outlived the candidate rows,
      // so the restaged ones point back at what this source already produced.
      expect(restaged.metaEventId).toBe(liveEventId);
      expect(restagedDeck.deckId).toBe(liveDeckId);
    });

    it("archives no second copy when it is accepted again", async () => {
      const target = await onlyDeckOf("mtc-reignore");
      const accepted = await post(`/meta/candidate-decks/${target.id}/accept`);
      expect(accepted).toEqual({ deckId: liveDeckId, created: false });

      const decks = await db
        .selectFrom("metaDecks")
        .select("deckId")
        .where("metaEventId", "=", liveEventId)
        .execute();
      expect(decks.map((row) => row.deckId)).toEqual([liveDeckId]);
    });
  });
});
