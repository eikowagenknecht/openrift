import type { MetaCreditVisibility, MetaListStatus } from "@openrift/shared/types";
import { afterAll, describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { META_ARCHIVE_USER_ID, metaRepo } from "./meta.js";

// ---------------------------------------------------------------------------
// Integration tests: meta archive (migration 235, ADR-014).
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Uses prefix MTA- / mta- for everything it creates. The `meta-archive` user
// itself is seeded by the migration and shared with every other file, so this
// file never deletes it — it deletes its own events (which cascade to
// meta_decks) and the decks those events owned.
// ---------------------------------------------------------------------------

const ctx = createDbContext(crypto.randomUUID());

const FORMAT = "freeform";

let legendCardId: string;
let championCardId: string;
let spellCardId: string;
const createdEventIds: string[] = [];
const createdDeckIds: string[] = [];
const createdUserIds: string[] = [];

/**
 * A contributor, with the credit visibility the test is about.
 * @param suffix Makes the id and email unique within the file.
 * @param visibility What the user consented to show.
 * @param profile The name and Riot ID the credit resolves from.
 * @returns The created user's id, tracked for teardown.
 */
async function seedUser(
  suffix: string,
  visibility: MetaCreditVisibility,
  profile: { name?: string | null; riotId?: string | null } = {},
): Promise<string> {
  const id = `mta-user-${suffix}`;
  await ctx!.db
    .insertInto("users")
    .values({
      id,
      email: `${id}@example.invalid`,
      name: profile.name === undefined ? "MTA Contributor" : profile.name,
      riotId: profile.riotId ?? null,
      metaCreditVisibility: visibility,
    })
    .execute();
  createdUserIds.push(id);
  return id;
}

/** @returns The inserted card's id. */
async function seedCard(name: string, normName: string, type: string): Promise<string> {
  const [card] = await ctx!.db
    .insertInto("cards")
    .values({ name, slug: normName, type, normName, keywords: [], tags: [] })
    .returning("id")
    .execute();
  return card.id;
}

/** @returns The created event's id, tracked for teardown. */
async function seedEvent(
  repo: ReturnType<typeof metaRepo>,
  slug: string,
  overrides: { eventDate?: string; format?: string; name?: string } = {},
): Promise<string> {
  const event = await repo.createEvent({
    slug,
    name: overrides.name ?? `MTA ${slug}`,
    eventDate: overrides.eventDate ?? "2026-08-01",
    format: overrides.format ?? FORMAT,
    playerCount: 64,
    organizer: "MTA Organizer",
    notes: null,
  });
  createdEventIds.push(event.id);
  return event.id;
}

/** @returns The created deck's id, tracked for teardown. */
async function seedDeck(
  repo: ReturnType<typeof metaRepo>,
  eventId: string,
  opts: {
    playerName: string;
    finishTier: number;
    record?: string | null;
    withChampion?: boolean;
    listStatus?: MetaListStatus;
  },
): Promise<string> {
  const created = await repo.createDeck(
    {
      eventId,
      name: `MTA ${opts.playerName} Deck`,
      format: FORMAT,
      formatConfig: null,
      cards: [
        { cardId: legendCardId, zone: "legend", quantity: 1, preferredPrintingId: null },
        ...(opts.withChampion === false
          ? []
          : ([
              {
                cardId: championCardId,
                zone: "champion",
                quantity: 3,
                preferredPrintingId: null,
              },
            ] as const)),
        { cardId: spellCardId, zone: "main", quantity: 3, preferredPrintingId: null },
      ],
      playerName: opts.playerName,
      finishTier: opts.finishTier,
      record: opts.record ?? null,
      // A partial list is written with the same cards here: what makes it
      // partial is the side zones the source never sent, which by definition
      // leave no trace in the row.
      listStatus: opts.listStatus ?? "full",
    },
    `mta${Math.random().toString(36).slice(2, 11).padEnd(9, "x")}`,
  );
  if (!created) {
    throw new Error("seedDeck: event not found");
  }
  createdDeckIds.push(created.deckId);
  return created.deckId;
}

/**
 * An archetype entry: the legend the source published and nothing else, with no
 * share token, exactly as `createArchivedDeck` writes one.
 * @returns The created deck's id, tracked for teardown.
 */
async function seedArchetypeDeck(
  repo: ReturnType<typeof metaRepo>,
  eventId: string,
  playerName: string,
): Promise<string> {
  const created = await repo.createDeck(
    {
      eventId,
      name: `MTA ${playerName} Archetype`,
      format: FORMAT,
      formatConfig: null,
      cards: [{ cardId: legendCardId, zone: "legend", quantity: 1, preferredPrintingId: null }],
      playerName,
      finishTier: 8,
      record: null,
      listStatus: "archetype",
    },
    null,
  );
  if (!created) {
    throw new Error("seedArchetypeDeck: event not found");
  }
  createdDeckIds.push(created.deckId);
  return created.deckId;
}

if (ctx) {
  const { db } = ctx;

  legendCardId = await seedCard("MTA Legend", "mta-legend", "legend");
  championCardId = await seedCard("MTA Champion", "mta-champion", "unit");
  spellCardId = await seedCard("MTA Spell", "mta-spell", "spell");

  afterAll(async () => {
    // Decks first: deleting them takes their deck_cards and meta_decks rows,
    // which is what frees the cards below.
    await db.deleteFrom("decks").where("id", "in", createdDeckIds).execute();
    await db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
    await db
      .deleteFrom("cards")
      .where("id", "in", [legendCardId, championCardId, spellCardId])
      .execute();
    // Credits cascade off the user, so the contributors go last.
    await db.deleteFrom("users").where("id", "in", createdUserIds).execute();
  });
}

describe.skipIf(!ctx)("metaRepo", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaRepo(db);

  describe("schema constraints", () => {
    it("rejects a slug that isn't URL-safe", async () => {
      await expect(seedEvent(repo, "MTA Not A Slug")).rejects.toThrow();
    });

    it("rejects a slug shorter than three characters", async () => {
      await expect(seedEvent(repo, "mt")).rejects.toThrow();
    });

    it("rejects a duplicate slug", async () => {
      await seedEvent(repo, "mta-duplicate-slug");
      await expect(seedEvent(repo, "mta-duplicate-slug")).rejects.toThrow();
    });

    it("rejects a player count of zero", async () => {
      await expect(
        db
          .insertInto("metaEvents")
          .values({
            slug: "mta-zero-players",
            name: "MTA Zero",
            eventDate: "2026-08-01",
            format: FORMAT,
            playerCount: 0,
          })
          .execute(),
      ).rejects.toThrow();
    });

    it("rejects a finish tier below the bound", async () => {
      const eventId = await seedEvent(repo, "mta-bad-finish");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA Bound", finishTier: 1 });
      // A placement starts at 1. There is no upper bound: the tier is the
      // bracket a pilot finished in, and a large event's is arbitrarily deep.
      await expect(
        db.updateTable("metaDecks").set({ finishTier: 0 }).where("deckId", "=", deckId).execute(),
      ).rejects.toThrow();
    });
  });

  describe("archived deck invariants", () => {
    it("creates the deck under the synthetic owner, public, with a token", async () => {
      const eventId = await seedEvent(repo, "mta-invariants");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA Nova", finishTier: 1 });

      const deck = await db
        .selectFrom("decks")
        .select(["userId", "isPublic", "shareToken"])
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();

      expect(deck.userId).toBe(META_ARCHIVE_USER_ID);
      expect(deck.isPublic).toBe(true);
      expect(deck.shareToken).not.toBeNull();
    });

    it("writes the card list and the satellite row together", async () => {
      const eventId = await seedEvent(repo, "mta-cards-written");
      const deckId = await seedDeck(repo, eventId, {
        playerName: "MTA Ekko",
        finishTier: 2,
        record: "4-2",
      });

      const cards = await db
        .selectFrom("deckCards")
        .select(["zone", "quantity"])
        .where("deckId", "=", deckId)
        .execute();
      expect(cards).toHaveLength(3);

      const satellite = await db
        .selectFrom("metaDecks")
        .selectAll()
        .where("deckId", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(satellite.metaEventId).toBe(eventId);
      expect(satellite.record).toBe("4-2");
    });

    it("reports an archive deck, and only an archive deck", async () => {
      const eventId = await seedEvent(repo, "mta-is-meta");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA Vi", finishTier: 1 });

      expect(await repo.isMetaDeck(deckId)).toBe(true);
      expect(await repo.isMetaDeck(crypto.randomUUID())).toBe(false);
    });

    it("leaves an event untouched when the deck's event doesn't exist", async () => {
      const created = await repo.createDeck(
        {
          eventId: crypto.randomUUID(),
          name: "MTA Orphan",
          format: FORMAT,
          formatConfig: null,
          cards: [{ cardId: legendCardId, zone: "legend", quantity: 1, preferredPrintingId: null }],
          playerName: "MTA Nobody",
          finishTier: 1,
          record: null,
          listStatus: "full",
        },
        "mtaorphan001",
      );
      expect(created).toBeUndefined();

      const stranded = await db
        .selectFrom("decks")
        .select("id")
        .where("name", "=", "MTA Orphan")
        .execute();
      expect(stranded).toHaveLength(0);
    });
  });

  describe("cascades", () => {
    it("takes the satellite rows when the event goes", async () => {
      const eventId = await seedEvent(repo, "mta-cascade-event");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA Cascade", finishTier: 1 });

      await db.deleteFrom("metaEvents").where("id", "=", eventId).execute();

      const satellite = await db
        .selectFrom("metaDecks")
        .select("deckId")
        .where("deckId", "=", deckId)
        .execute();
      expect(satellite).toHaveLength(0);
      // The FK cascade reaches meta_decks only; the deck itself survives,
      // which is exactly why deleteEvent removes decks explicitly.
      const deck = await db.selectFrom("decks").select("id").where("id", "=", deckId).execute();
      expect(deck).toHaveLength(1);
    });

    it("takes the satellite row when the deck goes", async () => {
      const eventId = await seedEvent(repo, "mta-cascade-deck");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA Gone", finishTier: 1 });

      await db.deleteFrom("decks").where("id", "=", deckId).execute();

      const satellite = await db
        .selectFrom("metaDecks")
        .select("deckId")
        .where("deckId", "=", deckId)
        .execute();
      expect(satellite).toHaveLength(0);
    });

    it("deleteEvent removes the underlying decks, not just the satellites", async () => {
      const eventId = await seedEvent(repo, "mta-delete-event");
      const first = await seedDeck(repo, eventId, { playerName: "MTA One", finishTier: 1 });
      const second = await seedDeck(repo, eventId, { playerName: "MTA Two", finishTier: 2 });

      expect(await repo.deleteEvent(eventId)).toBe(true);

      const decks = await db
        .selectFrom("decks")
        .select("id")
        .where("id", "in", [first, second])
        .execute();
      expect(decks).toHaveLength(0);
    });

    it("deleteEvent reports a missing event", async () => {
      expect(await repo.deleteEvent(crypto.randomUUID())).toBe(false);
    });

    it("deleteDeck removes the deck and its cards", async () => {
      const eventId = await seedEvent(repo, "mta-delete-deck");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA Solo", finishTier: 1 });

      expect(await repo.deleteDeck(deckId)).toBe(true);
      expect(await repo.deleteDeck(deckId)).toBe(false);

      const cards = await db
        .selectFrom("deckCards")
        .select("id")
        .where("deckId", "=", deckId)
        .execute();
      expect(cards).toHaveLength(0);
    });
  });

  describe("reads", () => {
    it("counts decks per event and orders newest first", async () => {
      const older = await seedEvent(repo, "mta-read-older", { eventDate: "2026-01-01" });
      const newer = await seedEvent(repo, "mta-read-newer", { eventDate: "2026-12-01" });
      await seedDeck(repo, newer, { playerName: "MTA Reader", finishTier: 1 });

      const events = await repo.listEvents();
      const mine = events.filter((event) => [older, newer].includes(event.id));
      expect(mine.map((event) => event.id)).toEqual([newer, older]);
      expect(mine[0].deckCount).toBe(1);
      expect(mine[1].deckCount).toBe(0);
    });

    it("resolves an event by slug with its deck count", async () => {
      const eventId = await seedEvent(repo, "mta-by-slug");
      await seedDeck(repo, eventId, { playerName: "MTA Slug", finishTier: 1 });

      const event = await repo.eventBySlug("mta-by-slug");
      expect(event?.id).toBe(eventId);
      expect(event?.deckCount).toBe(1);
      expect(await repo.eventBySlug("mta-no-such-slug")).toBeUndefined();
    });

    it("denormalizes legend and champion onto each deck summary", async () => {
      const eventId = await seedEvent(repo, "mta-summaries", { name: "MTA Summaries" });
      await seedDeck(repo, eventId, { playerName: "MTA Second", finishTier: 4, record: "3-3" });
      await seedDeck(repo, eventId, { playerName: "MTA First", finishTier: 1 });

      const decks = await repo.deckSummariesForEvent(eventId);
      expect(decks.map((deck) => deck.playerName)).toEqual(["MTA First", "MTA Second"]);
      expect(decks[0].legendName).toBe("MTA Legend");
      expect(decks[0].championName).toBe("MTA Champion");
      expect(decks[0].eventName).toBe("MTA Summaries");
      expect(decks[0].eventDate).toBe("2026-08-01");
      expect(decks[1].record).toBe("3-3");
    });

    it("leaves the champion null when the deck has no card in that zone", async () => {
      const eventId = await seedEvent(repo, "mta-no-champion");
      await seedDeck(repo, eventId, {
        playerName: "MTA Bare",
        finishTier: 1,
        withChampion: false,
      });

      const [deck] = await repo.deckSummariesForEvent(eventId);
      expect(deck.legendCardId).toBe(legendCardId);
      expect(deck.championCardId).toBeNull();
      expect(deck.championName).toBeNull();
    });

    it("returns the event and placement for one deck, and nothing for a foreign deck", async () => {
      const eventId = await seedEvent(repo, "mta-context", { name: "MTA Context" });
      const deckId = await seedDeck(repo, eventId, {
        playerName: "MTA Pilot",
        finishTier: 8,
        record: "6-2",
      });

      const context = await repo.contextForDeck(deckId);
      expect(context).toEqual({
        listStatus: "full",
        playerName: "MTA Pilot",
        finishTier: 8,
        record: "6-2",
        eventSlug: "mta-context",
        eventName: "MTA Context",
        eventDate: "2026-08-01",
        eventFormat: FORMAT,
      });
      expect(await repo.contextForDeck(crypto.randomUUID())).toBeUndefined();
    });

    it("sums the card count for the admin table", async () => {
      const eventId = await seedEvent(repo, "mta-admin-decks");
      await seedDeck(repo, eventId, { playerName: "MTA Admin", finishTier: 1 });

      const [deck] = await repo.adminDecksForEvent(eventId);
      // 1 legend + 3 champion + 3 main.
      expect(deck.cardCount).toBe(7);
      expect(deck.shareToken).toMatch(/^mta/u);
    });
  });

  describe("stats", () => {
    it("counts decks and card inclusion within the scope", async () => {
      const inScope = await seedEvent(repo, "mta-stats-in", {
        eventDate: "2026-06-15",
        format: FORMAT,
      });
      const outOfScope = await seedEvent(repo, "mta-stats-out", {
        eventDate: "2026-01-15",
        format: FORMAT,
      });
      await seedDeck(repo, inScope, { playerName: "MTA Stats A", finishTier: 1 });
      await seedDeck(repo, inScope, { playerName: "MTA Stats B", finishTier: 2 });
      await seedDeck(repo, outOfScope, { playerName: "MTA Stats C", finishTier: 1 });

      const scope = { dateFrom: "2026-06-01", dateTo: "2026-06-30" };
      const total = await repo.deckCountInScope(scope);
      expect(total).toBe(2);

      const cards = await repo.cardInclusion(scope);
      const legend = cards.find((row) => row.cardId === legendCardId);
      // Both in-scope decks carry it; the out-of-scope one must not count.
      expect(legend?.deckCount).toBe(2);
      expect(legend?.name).toBe("MTA Legend");
    });

    it("narrows to the legend zone for the play-rate axis", async () => {
      const eventId = await seedEvent(repo, "mta-stats-legend", { eventDate: "2026-07-15" });
      await seedDeck(repo, eventId, { playerName: "MTA Legend Rate", finishTier: 1 });

      const scope = { dateFrom: "2026-07-01", dateTo: "2026-07-31" };
      const legends = await repo.cardInclusion(scope, { zone: "legend" });
      expect(legends.map((row) => row.cardId)).toEqual([legendCardId]);
      expect(legends[0].deckCount).toBe(1);
    });

    it("scopes by the event's format, not the deck's", async () => {
      const eventId = await seedEvent(repo, "mta-stats-format", { eventDate: "2026-09-15" });
      await seedDeck(repo, eventId, { playerName: "MTA Format", finishTier: 1 });

      const scope = { format: FORMAT, dateFrom: "2026-09-01", dateTo: "2026-09-30" };
      expect(await repo.deckCountInScope(scope)).toBe(1);
      expect(await repo.deckCountInScope({ ...scope, format: "no-such-format" })).toBe(0);
    });

    it("reports an empty scope as zero rather than failing", async () => {
      const scope = { dateFrom: "1999-01-01", dateTo: "1999-12-31" };
      expect(await repo.deckCountInScope(scope)).toBe(0);
      expect(await repo.cardInclusion(scope)).toEqual([]);
    });

    it("counts an archetype in the legend play-rate but not in card inclusion", async () => {
      const eventId = await seedEvent(repo, "mta-stats-archetype", { eventDate: "2026-10-15" });
      await seedDeck(repo, eventId, { playerName: "MTA Full List", finishTier: 1 });
      // A partial list has a complete main deck, so it belongs in both halves
      // of the card table exactly like the full one.
      await seedDeck(repo, eventId, {
        playerName: "MTA Partial List",
        finishTier: 2,
        listStatus: "partial",
      });
      await seedArchetypeDeck(repo, eventId, "MTA Archetype");

      const scope = { dateFrom: "2026-10-01", dateTo: "2026-10-31" };
      expect(await repo.deckCountInScope(scope)).toBe(3);
      expect(await repo.deckCountInScope(scope, { knownMainDeckOnly: true })).toBe(2);

      // All three name the legend, so the play-rate axis sees all three.
      const legends = await repo.cardInclusion(scope, { zone: "legend" });
      expect(legends.find((row) => row.cardId === legendCardId)?.deckCount).toBe(3);

      // Only the two with a main deck contribute a main-deck card.
      const cards = await repo.cardInclusion(scope, { zone: "main", knownMainDeckOnly: true });
      expect(cards.find((row) => row.cardId === spellCardId)?.deckCount).toBe(2);
    });
  });

  describe("updates", () => {
    it("applies a partial event patch and leaves the rest alone", async () => {
      const eventId = await seedEvent(repo, "mta-patch-event", { name: "MTA Before" });

      expect(await repo.updateEvent(eventId, { name: "MTA After", playerCount: 128 })).toBe(true);

      const event = await repo.eventById(eventId);
      expect(event?.name).toBe("MTA After");
      expect(event?.playerCount).toBe(128);
      expect(event?.slug).toBe("mta-patch-event");
      expect(event?.organizer).toBe("MTA Organizer");
    });

    it("reports a patch against a missing event", async () => {
      expect(await repo.updateEvent(crypto.randomUUID(), { name: "MTA Ghost" })).toBe(false);
    });

    it("moves a deck to another event and replaces its cards wholesale", async () => {
      const from = await seedEvent(repo, "mta-move-from");
      const to = await seedEvent(repo, "mta-move-to");
      const deckId = await seedDeck(repo, from, { playerName: "MTA Mover", finishTier: 4 });

      expect(
        await repo.updateDeck(deckId, {
          eventId: to,
          name: "MTA Renamed",
          finishTier: 1,
          record: null,
          cards: [{ cardId: spellCardId, zone: "main", quantity: 1, preferredPrintingId: null }],
        }),
      ).toBe(true);

      const context = await repo.contextForDeck(deckId);
      expect(context?.eventSlug).toBe("mta-move-to");
      expect(context?.finishTier).toBe(1);

      const cards = await db
        .selectFrom("deckCards")
        .select(["cardId", "zone"])
        .where("deckId", "=", deckId)
        .execute();
      expect(cards).toEqual([{ cardId: spellCardId, zone: "main" }]);

      const [summary] = await repo.deckSummariesForEvent(to);
      expect(summary.deckName).toBe("MTA Renamed");
      expect(summary.legendCardId).toBeNull();
    });

    it("reports a patch against a deck outside the archive", async () => {
      expect(await repo.updateDeck(crypto.randomUUID(), { name: "MTA Ghost" })).toBe(false);
    });

    it("promotes an archetype to a full list and takes the minted token", async () => {
      const eventId = await seedEvent(repo, "mta-fill-in");
      const deckId = await seedArchetypeDeck(repo, eventId, "MTA Filled");

      expect(
        await repo.updateDeck(deckId, {
          listStatus: "full",
          shareToken: "mtafilled001",
          cards: [
            { cardId: legendCardId, zone: "legend", quantity: 1, preferredPrintingId: null },
            { cardId: spellCardId, zone: "main", quantity: 3, preferredPrintingId: null },
          ],
        }),
      ).toBe(true);

      const state = await repo.deckShareState(deckId);
      expect(state).toEqual({ listStatus: "full", shareToken: "mtafilled001" });
    });
  });

  describe("sitemap", () => {
    it("lists event slugs and deck tokens with ISO timestamps", async () => {
      const eventId = await seedEvent(repo, "mta-sitemap");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA Crawl", finishTier: 1 });

      const { events, decks } = await repo.sitemapEntries();
      const event = events.find((entry) => entry.slug === "mta-sitemap");
      expect(event?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);

      const deck = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(decks.some((entry) => entry.slug === deck.shareToken)).toBe(true);
    });

    it("omits an archetype-only deck, which has no page to crawl", async () => {
      const eventId = await seedEvent(repo, "mta-sitemap-archetype");
      const deckId = await seedArchetypeDeck(repo, eventId, "MTA Uncrawled");

      const stored = await db
        .selectFrom("decks")
        .select("shareToken")
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();
      expect(stored.shareToken).toBeNull();

      // The generator iterates tokens, so a deck without one drops out on its
      // own — this pins that the token really is absent rather than blank.
      const { decks } = await repo.sitemapEntries();
      expect(decks.every((entry) => entry.slug !== null && entry.slug !== "")).toBe(true);
      const event = await repo.eventById(eventId);
      expect(event?.deckCount).toBe(1);
    });
  });

  describe("source citations", () => {
    it("lets two providers cite one event", async () => {
      const eventId = await seedEvent(repo, "mta-two-sources");

      await repo.insertEventSource({
        metaEventId: eventId,
        provider: "mta-uvs",
        externalId: "evt-1",
        label: "mta-uvs",
        sourceUrl: "https://example.invalid/uvs",
      });
      await repo.insertEventSource({
        metaEventId: eventId,
        provider: "mta-prb",
        externalId: "evt-1",
        label: "mta-prb",
        sourceUrl: null,
      });

      // One event, two citations: the fan-in the amendment exists for. Neither
      // is reachable by a live-side key any more — the link is the candidate's
      // own FK, and this list is the credit it writes.
      const sources = await repo.sourcesForEvent(eventId);
      expect(sources.map((source) => source.label).toSorted()).toEqual(["mta-prb", "mta-uvs"]);
    });

    it("takes a hand-entered citation with no source key at all", async () => {
      const eventId = await seedEvent(repo, "mta-hand-cite");
      await repo.insertEventSource({
        metaEventId: eventId,
        provider: null,
        externalId: null,
        label: "Twitch VOD",
        sourceUrl: "https://example.invalid/vod",
      });
      const [source] = await repo.sourcesForEvent(eventId);
      expect(source.provider).toBeNull();
      expect(source.externalId).toBeNull();
    });

    it("removes one provider's citation by key and leaves the other's", async () => {
      const eventId = await seedEvent(repo, "mta-uncite");
      await repo.insertEventSource({
        metaEventId: eventId,
        provider: "mta-gone",
        externalId: "evt-2",
        label: "mta-gone",
        sourceUrl: null,
      });
      await repo.insertEventSource({
        metaEventId: eventId,
        provider: "mta-stays",
        externalId: "evt-2",
        label: "mta-stays",
        sourceUrl: null,
      });

      expect(await repo.deleteEventSourceByKey("mta-gone", "evt-2")).toBe(true);
      expect(await repo.deleteEventSourceByKey("mta-gone", "evt-2")).toBe(false);
      const sources = await repo.sourcesForEvent(eventId);
      expect(sources.map((source) => source.provider)).toEqual(["mta-stays"]);
    });
  });

  describe("contributor credit", () => {
    it("credits one person once per event however many decks they added", async () => {
      const eventId = await seedEvent(repo, "mta-credit-once");
      const deckA = await seedDeck(repo, eventId, { playerName: "MTA A", finishTier: 1 });
      const deckB = await seedDeck(repo, eventId, { playerName: "MTA B", finishTier: 2 });
      const userId = await seedUser("once", "name", { name: "MTA Nova" });

      await repo.insertCredit({ metaEventId: eventId, deckId: deckA, userId });
      await repo.insertCredit({ metaEventId: eventId, deckId: deckB, userId });

      const contributors = await repo.contributorsForEvent(eventId);
      expect(contributors).toEqual([{ metaEventId: eventId, userId, displayName: "MTA Nova" }]);
    });

    it("is idempotent, so re-accepting a corrected list adds no second row", async () => {
      const eventId = await seedEvent(repo, "mta-credit-idempotent");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA C", finishTier: 1 });
      const userId = await seedUser("idem", "name", { name: "MTA Rell" });

      await repo.insertCredit({ metaEventId: eventId, deckId, userId });
      await repo.insertCredit({ metaEventId: eventId, deckId, userId });
      // The event-level credit is a different contribution, NULLS NOT DISTINCT
      // keeping it to one of its own.
      await repo.insertCredit({ metaEventId: eventId, deckId: null, userId });
      await repo.insertCredit({ metaEventId: eventId, deckId: null, userId });

      const rows = await db
        .selectFrom("metaCredits")
        .select("id")
        .where("metaEventId", "=", eventId)
        .execute();
      expect(rows).toHaveLength(2);
    });

    it("drops a contributor who never opted in", async () => {
      const eventId = await seedEvent(repo, "mta-credit-hidden");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA D", finishTier: 1 });
      const userId = await seedUser("hidden", "hidden", { name: "MTA Invisible" });

      await repo.insertCredit({ metaEventId: eventId, deckId, userId });
      expect(await repo.contributorsForEvent(eventId)).toEqual([]);
    });

    it("falls back to the display name when the Riot ID is unset", async () => {
      const eventId = await seedEvent(repo, "mta-credit-riot-fallback");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA E", finishTier: 1 });
      const userId = await seedUser("riotless", "riot_id", { name: "MTA Ekko", riotId: null });

      await repo.insertCredit({ metaEventId: eventId, deckId, userId });
      const [contributor] = await repo.contributorsForEvent(eventId);
      expect(contributor.displayName).toBe("MTA Ekko");
    });

    it("prefers the Riot ID when the contributor chose it", async () => {
      const eventId = await seedEvent(repo, "mta-credit-riot");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA F", finishTier: 1 });
      const userId = await seedUser("riot", "riot_id", {
        name: "MTA Ekko",
        riotId: "MTA Ekko#EUW",
      });

      await repo.insertCredit({ metaEventId: eventId, deckId, userId });
      const [contributor] = await repo.contributorsForEvent(eventId);
      expect(contributor.displayName).toBe("MTA Ekko#EUW");
    });

    it("omits a contributor whose chosen field is blank rather than printing an id", async () => {
      const eventId = await seedEvent(repo, "mta-credit-blank");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA G", finishTier: 1 });
      const userId = await seedUser("blank", "name", { name: "   " });

      await repo.insertCredit({ metaEventId: eventId, deckId, userId });
      expect(await repo.contributorsForEvent(eventId)).toEqual([]);
    });

    it("scopes a credit delete to one contributor of a shared deck", async () => {
      const eventId = await seedEvent(repo, "mta-credit-unlink");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA H", finishTier: 1 });
      const staying = await seedUser("staying", "name", { name: "MTA Stays" });
      const leaving = await seedUser("leaving", "name", { name: "MTA Leaves" });

      await repo.insertCredit({ metaEventId: eventId, deckId, userId: staying });
      await repo.insertCredit({ metaEventId: eventId, deckId, userId: leaving });
      await repo.deleteCreditsForDeck(deckId, leaving);

      const contributors = await repo.contributorsForEvent(eventId);
      expect(contributors.map((row) => row.displayName)).toEqual(["MTA Stays"]);
      const deckContributors = await repo.contributorsForDeck(deckId);
      expect(deckContributors.map((row) => row.userId)).toEqual([staying]);
    });

    it("reads and writes a contributor's visibility setting", async () => {
      const eventId = await seedEvent(repo, "mta-credit-visibility");
      const deckId = await seedDeck(repo, eventId, { playerName: "MTA K", finishTier: 1 });
      const userId = await seedUser("visibility", "hidden", { name: "MTA Opt In" });
      await repo.insertCredit({ metaEventId: eventId, deckId, userId });

      expect(await repo.creditVisibility(userId)).toBe("hidden");
      expect(await repo.contributorsForEvent(eventId)).toEqual([]);

      // Opting in credits every past contribution, without touching a credit row.
      expect(await repo.setCreditVisibility(userId, "name")).toBe(true);
      expect(await repo.creditVisibility(userId)).toBe("name");
      const contributors = await repo.contributorsForEvent(eventId);
      expect(contributors.map((row) => row.displayName)).toEqual(["MTA Opt In"]);

      // And opting back out removes them all, again without a sweep.
      expect(await repo.setCreditVisibility(userId, "hidden")).toBe(true);
      expect(await repo.contributorsForEvent(eventId)).toEqual([]);
    });

    it("reports a missing user rather than pretending they are hidden", async () => {
      expect(await repo.creditVisibility("mta-user-nobody")).toBeUndefined();
      expect(await repo.setCreditVisibility("mta-user-nobody", "name")).toBe(false);
    });
  });
});
