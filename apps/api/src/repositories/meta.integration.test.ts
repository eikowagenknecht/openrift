import type { MetaCreditVisibility, MetaListStatus } from "@openrift/shared/types";
import { afterAll, describe, expect, it } from "vitest";

import type { Repos } from "../deps.js";
import { createRepos } from "../deps.js";
import { promoteMetaEvent } from "../services/meta-promote.js";
import { createDbContext } from "../test/integration-context.js";
import type {
  MetaArchivedDeckInput,
  MetaDeckCardInput,
  MetaEventPlayerInput,
  NewMetaEventPhase,
} from "./meta.js";
import { META_ARCHIVE_USER_ID, metaRepo } from "./meta.js";

// Uses prefix MTA- / mta- for everything it creates. The `meta-archive` user
// itself is seeded by the migration and shared with every other file, so this
// file never deletes it.

const ctx = createDbContext(crypto.randomUUID());

const FORMAT = "freeform";
/** A second real format, so a deck can disagree with its event. */
const DECK_ONLY_FORMAT = "constructed";

let legendCardId: string;
let championCardId: string;
let spellCardId: string;
const createdEventIds: string[] = [];
const createdDeckIds: string[] = [];
const createdUserIds: string[] = [];
const createdCardIds: string[] = [];

/** The players this file invents, well clear of the source's own id space. */
const UVS_PLAYER_ID = 990_101;
const UVS_PLAYER_ID_B = 990_102;

interface PlayerOpts {
  playerName: string;
  rank: number;
  rankIsTier?: boolean;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  withChampion?: boolean;
  deckFormat?: string;
}

function shareToken(): string {
  return `mta${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

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

async function seedCard(
  name: string,
  normName: string,
  type: string,
  tags: string[] = [],
): Promise<string> {
  const [card] = await ctx!.db
    .insertInto("cards")
    .values({ name, slug: normName, type, normName, keywords: [], tags })
    .returning("id")
    .execute();
  createdCardIds.push(card.id);
  return card.id;
}

async function seedEvent(
  repo: ReturnType<typeof metaRepo>,
  slug: string,
  overrides: {
    eventDate?: string;
    format?: string;
    name?: string;
    playerCount?: number | null;
    organizer?: string | null;
  } = {},
): Promise<string> {
  const event = await repo.createEvent({
    slug,
    name: overrides.name ?? `MTA ${slug}`,
    eventDate: overrides.eventDate ?? "2026-08-01",
    format: overrides.format ?? FORMAT,
    playerCount: overrides.playerCount === undefined ? 64 : overrides.playerCount,
    organizer: overrides.organizer === undefined ? "MTA Organizer" : overrides.organizer,
    notes: null,
  });
  createdEventIds.push(event.id);
  return event.id;
}

function playerInput(
  eventId: string,
  opts: PlayerOpts,
  deck: MetaArchivedDeckInput | null,
): MetaEventPlayerInput {
  return {
    eventId,
    rank: opts.rank,
    rankIsTier: opts.rankIsTier ?? false,
    playerName: opts.playerName,
    wins: opts.wins ?? null,
    losses: opts.losses ?? null,
    draws: opts.draws ?? null,
    legendCardId,
    championCardId: opts.withChampion === false ? null : championCardId,
    deck,
  };
}

function deckInput(
  opts: PlayerOpts,
  listStatus: Exclude<MetaListStatus, "none">,
): MetaArchivedDeckInput {
  const champion: MetaDeckCardInput[] =
    opts.withChampion === false
      ? []
      : [{ cardId: championCardId, zone: "champion", quantity: 3, preferredPrintingId: null }];
  return {
    name: `${opts.playerName} Deck`,
    format: opts.deckFormat ?? FORMAT,
    formatConfig: null,
    // A partial list is written with the same cards: what makes it partial is
    // the side zones the source never sent, which leave no trace in the row.
    cards: [
      { cardId: legendCardId, zone: "legend", quantity: 1, preferredPrintingId: null },
      ...champion,
      { cardId: spellCardId, zone: "main", quantity: 3, preferredPrintingId: null },
    ],
    listStatus,
  };
}

async function seedListedPlayer(
  repo: ReturnType<typeof metaRepo>,
  eventId: string,
  opts: PlayerOpts & { listStatus?: Exclude<MetaListStatus, "none"> },
): Promise<{ playerId: string; deckId: string }> {
  const created = await repo.createPlayer(
    playerInput(eventId, opts, deckInput(opts, opts.listStatus ?? "full")),
    shareToken(),
  );
  if (!created || created.deckId === null) {
    throw new Error("seedListedPlayer: no list was written");
  }
  createdDeckIds.push(created.deckId);
  return { playerId: created.metaEventPlayerId, deckId: created.deckId };
}

async function seedDecklessPlayer(
  repo: ReturnType<typeof metaRepo>,
  eventId: string,
  opts: PlayerOpts,
): Promise<string> {
  const created = await repo.createPlayer(playerInput(eventId, opts, null), null);
  if (!created) {
    throw new Error("seedDecklessPlayer: event not found");
  }
  return created.metaEventPlayerId;
}

if (ctx) {
  const { db } = ctx;

  legendCardId = await seedCard("MTA Legend", "mta-legend", "legend");
  championCardId = await seedCard("MTA Champion", "mta-champion", "unit");
  spellCardId = await seedCard("MTA Spell", "mta-spell", "spell");

  afterAll(async () => {
    // Events first: `meta_event_players.deck_id` is ON DELETE RESTRICT, so the
    // decks are only free once the event has cascaded its standings rows.
    await db.deleteFrom("metaEvents").where("id", "in", createdEventIds).execute();
    await db.deleteFrom("decks").where("id", "in", createdDeckIds).execute();
    await db.deleteFrom("cards").where("id", "in", createdCardIds).execute();
    await db
      .deleteFrom("uvsgamesPlayers")
      .where("id", "in", [UVS_PLAYER_ID, UVS_PLAYER_ID_B])
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

    it("rejects a rank below the bound", async () => {
      const eventId = await seedEvent(repo, "mta-bad-rank");
      const playerId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Bound",
        rank: 1,
      });
      // A placement starts at 1. There is no upper bound: a large event's
      // field runs arbitrarily deep.
      await expect(
        db.updateTable("metaEventPlayers").set({ rank: 0 }).where("id", "=", playerId).execute(),
      ).rejects.toThrow();
    });

    it("rejects a list status on a standings row that has no deck", async () => {
      const eventId = await seedEvent(repo, "mta-status-no-deck");
      const playerId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Statusless",
        rank: 4,
      });

      await expect(
        db
          .updateTable("metaEventPlayers")
          .set({ listStatus: "full" })
          .where("id", "=", playerId)
          .execute(),
      ).rejects.toThrow();
    });

    it("rejects a deck the list status no longer claims", async () => {
      const eventId = await seedEvent(repo, "mta-deck-no-status");
      const { playerId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Listed",
        rank: 1,
      });

      await expect(
        db
          .updateTable("metaEventPlayers")
          .set({ deckId: null })
          .where("id", "=", playerId)
          .execute(),
      ).rejects.toThrow();
    });
  });

  describe("archived deck invariants", () => {
    it("creates the deck under the synthetic owner, public, with a token", async () => {
      const eventId = await seedEvent(repo, "mta-invariants");
      const { deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Nova",
        rank: 1,
      });

      const deck = await db
        .selectFrom("decks")
        .select(["userId", "isPublic", "shareToken"])
        .where("id", "=", deckId)
        .executeTakeFirstOrThrow();

      expect(deck.userId).toBe(META_ARCHIVE_USER_ID);
      expect(deck.isPublic).toBe(true);
      expect(deck.shareToken).not.toBeNull();
    });

    it("writes the card list and the standings row together", async () => {
      const eventId = await seedEvent(repo, "mta-cards-written");
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Ekko",
        rank: 2,
        wins: 4,
        losses: 2,
        draws: 0,
      });

      const cards = await db
        .selectFrom("deckCards")
        .select(["zone", "quantity"])
        .where("deckId", "=", deckId)
        .execute();
      expect(cards).toHaveLength(3);

      const row = await db
        .selectFrom("metaEventPlayers")
        .selectAll()
        .where("id", "=", playerId)
        .executeTakeFirstOrThrow();
      expect(row.metaEventId).toBe(eventId);
      expect(row.deckId).toBe(deckId);
      expect(row.listStatus).toBe("full");
      expect([row.wins, row.losses, row.draws]).toEqual([4, 2, 0]);
    });

    // `uq_deck_cards` is NULLS NOT DISTINCT, so the archive's null
    // `preferred_printing_id` does not separate two lines naming the same card
    // and zone. A source that splits a playset, or two names resolving to one
    // card, used to violate the index instead of adding up.
    it("folds repeated lines into one row, summing quantity", async () => {
      const eventId = await seedEvent(repo, "mta-merge-create");
      const created = await repo.createPlayer(
        playerInput(
          eventId,
          { playerName: "MTA Merge", rank: 1 },
          {
            name: "MTA Merge Deck",
            format: FORMAT,
            formatConfig: null,
            cards: [
              { cardId: legendCardId, zone: "legend", quantity: 1, preferredPrintingId: null },
              { cardId: spellCardId, zone: "main", quantity: 2, preferredPrintingId: null },
              { cardId: spellCardId, zone: "main", quantity: 1, preferredPrintingId: null },
            ],
            listStatus: "full",
          },
        ),
        shareToken(),
      );
      if (!created || created.deckId === null) {
        throw new Error("no list was written");
      }
      createdDeckIds.push(created.deckId);

      const cards = await db
        .selectFrom("deckCards")
        .select(["cardId", "zone", "quantity"])
        .where("deckId", "=", created.deckId)
        .execute();

      expect(cards).toHaveLength(2);
      expect(cards.find((card) => card.cardId === spellCardId)?.quantity).toBe(3);
    });

    it("folds repeated lines when replacing an existing list", async () => {
      const eventId = await seedEvent(repo, "mta-merge-replace");
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Replace",
        rank: 1,
      });

      await repo.setPlayerDeck(
        playerId,
        {
          name: "MTA Replace Deck",
          format: FORMAT,
          formatConfig: null,
          cards: [
            { cardId: legendCardId, zone: "legend", quantity: 1, preferredPrintingId: null },
            { cardId: spellCardId, zone: "main", quantity: 2, preferredPrintingId: null },
            { cardId: spellCardId, zone: "main", quantity: 2, preferredPrintingId: null },
          ],
          listStatus: "full",
        },
        shareToken(),
      );

      const cards = await db
        .selectFrom("deckCards")
        .select(["cardId", "zone", "quantity"])
        .where("deckId", "=", deckId)
        .execute();

      expect(cards).toHaveLength(2);
      expect(cards.find((card) => card.cardId === spellCardId)?.quantity).toBe(4);
    });

    it("leaves a standings-only entry with no deck and no permalink", async () => {
      const eventId = await seedEvent(repo, "mta-standings-only");
      const playerId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Legend Only",
        rank: 12,
        rankIsTier: true,
      });

      const row = await repo.playerById(playerId);
      expect(row?.listStatus).toBe("none");
      expect(row?.deckId).toBeNull();
      expect(row?.shareToken).toBeNull();
      expect(row?.rankIsTier).toBe(true);
      // The legend is a column on the standings row, so it survives the
      // absence of a list — which is the point of the pyramid.
      expect(row?.legendName).toBe("MTA Legend");
    });

    it("reports an archive deck, and only an archive deck", async () => {
      const eventId = await seedEvent(repo, "mta-is-meta");
      const { deckId } = await seedListedPlayer(repo, eventId, { playerName: "MTA Vi", rank: 1 });

      expect(await repo.isMetaDeck(deckId)).toBe(true);
      expect(await repo.isMetaDeck(crypto.randomUUID())).toBe(false);
    });

    it("leaves nothing behind when the standings row's event doesn't exist", async () => {
      const opts = { playerName: "MTA Nobody", rank: 1 };
      const created = await repo.createPlayer(
        playerInput(crypto.randomUUID(), opts, {
          ...deckInput(opts, "full"),
          name: "MTA Orphan",
        }),
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
    it("takes the standings rows when the event goes, stranding their decks", async () => {
      const eventId = await seedEvent(repo, "mta-cascade-event");
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Cascade",
        rank: 1,
      });

      await db.deleteFrom("metaEvents").where("id", "=", eventId).execute();

      const players = await db
        .selectFrom("metaEventPlayers")
        .select("id")
        .where("id", "=", playerId)
        .execute();
      expect(players).toHaveLength(0);
      // The cascade reaches the standings row only; the deck itself survives,
      // which is exactly why deleteEvent removes decks explicitly.
      const deck = await db.selectFrom("decks").select("id").where("id", "=", deckId).execute();
      expect(deck).toHaveLength(1);
    });

    it("refuses to delete a deck a standings row still references", async () => {
      const eventId = await seedEvent(repo, "mta-deck-restrict");
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Held",
        rank: 1,
      });

      await expect(db.deleteFrom("decks").where("id", "=", deckId).execute()).rejects.toThrow();

      expect(await repo.clearPlayerDeck(playerId)).toBe(true);

      const deck = await db.selectFrom("decks").select("id").where("id", "=", deckId).execute();
      expect(deck).toHaveLength(0);
      const row = await repo.playerById(playerId);
      expect(row?.listStatus).toBe("none");
    });

    it("deleteEvent removes the underlying decks, not just the standings rows", async () => {
      const eventId = await seedEvent(repo, "mta-delete-event");
      const first = await seedListedPlayer(repo, eventId, { playerName: "MTA One", rank: 1 });
      const second = await seedListedPlayer(repo, eventId, { playerName: "MTA Two", rank: 2 });
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA Three", rank: 3 });

      expect(await repo.deleteEvent(eventId)).toBe(true);

      const decks = await db
        .selectFrom("decks")
        .select("id")
        .where("id", "in", [first.deckId, second.deckId])
        .execute();
      expect(decks).toHaveLength(0);
    });

    it("deleteEvent reports a missing event", async () => {
      expect(await repo.deleteEvent(crypto.randomUUID())).toBe(false);
    });

    it("deletePlayer removes the standings row, its deck and its cards", async () => {
      const eventId = await seedEvent(repo, "mta-delete-player");
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Solo",
        rank: 1,
      });

      expect(await repo.deletePlayer(playerId)).toBe(true);
      expect(await repo.deletePlayer(playerId)).toBe(false);

      const decks = await db.selectFrom("decks").select("id").where("id", "=", deckId).execute();
      expect(decks).toHaveLength(0);
      const cards = await db
        .selectFrom("deckCards")
        .select("id")
        .where("deckId", "=", deckId)
        .execute();
      expect(cards).toHaveLength(0);
    });

    it("deletePlayer takes a standings-only entry too", async () => {
      const eventId = await seedEvent(repo, "mta-delete-deckless");
      const playerId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Bare",
        rank: 9,
      });

      expect(await repo.deletePlayer(playerId)).toBe(true);
      expect(await repo.playerById(playerId)).toBeUndefined();
    });
  });

  // The archive is paged on the server (the accept pipeline fills it faster
  // than a maintainer can), so a page is one slice of the whole table and every
  // filter, the order and the total have to come from SQL.
  describe("paged event list", () => {
    const PAGE = { limit: 50, offset: 0 };

    // `meta_events.slug` is unique and nothing resets between tests, so each
    // call has to seed a set of its own.
    let pagingSets = 0;

    async function seedPagingSet() {
      pagingSets += 1;
      const tag = `${pagingSets}`;
      const early = await seedEvent(repo, `mta-page-early-${tag}`, {
        eventDate: "2026-03-01",
        name: `MTA Piltover Open ${tag}`,
        organizer: `MTA Zaun Collective ${tag}`,
        playerCount: 10,
      });
      const late = await seedEvent(repo, `mta-page-late-${tag}`, {
        eventDate: "2026-09-01",
        name: `MTA Noxus Cup ${tag}`,
        playerCount: 4,
      });
      // Two of the four the source counted, so this one is short of its field.
      await seedListedPlayer(repo, late, { playerName: `MTA Pager One ${tag}`, rank: 1 });
      await seedDecklessPlayer(repo, late, { playerName: `MTA Pager Two ${tag}`, rank: 2 });
      return { early, late, tag };
    }

    /** The seeded rows alone; the shared DB carries other suites' events too. */
    function ours(rows: { id: string }[], ids: string[]) {
      return rows.filter((row) => ids.includes(row.id)).map((row) => row.id);
    }

    it("orders newest first and counts the whole match, not the page", async () => {
      const { early, late } = await seedPagingSet();

      const { rows, total } = await repo.listEvents({}, PAGE);

      expect(ours(rows, [early, late])).toEqual([late, early]);
      expect(total).toBeGreaterThanOrEqual(2);
    });

    it("pages without repeating or skipping a row across a date tie", async () => {
      const first = await seedEvent(repo, "mta-page-tie-a", { eventDate: "2026-05-05" });
      const second = await seedEvent(repo, "mta-page-tie-b", { eventDate: "2026-05-05" });
      const third = await seedEvent(repo, "mta-page-tie-c", { eventDate: "2026-05-05" });
      const mine = [first, second, third];

      const seen: string[] = [];
      for (let offset = 0; offset < 200; offset += 1) {
        const { rows } = await repo.listEvents({}, { limit: 1, offset });
        seen.push(...ours(rows, mine));
      }

      expect(seen.toSorted()).toEqual(mine.toSorted());
    });

    it("searches the organizer as well as the name", async () => {
      const { early, tag } = await seedPagingSet();

      const byName = await repo.listEvents({ search: `Piltover Open ${tag}` }, PAGE);
      const byOrganizer = await repo.listEvents({ search: `Zaun Collective ${tag}` }, PAGE);

      expect(byName.rows.map((row) => row.id)).toContain(early);
      expect(byOrganizer.rows.map((row) => row.id)).toContain(early);
    });

    it("narrows to a date range", async () => {
      const { early, late } = await seedPagingSet();

      const { rows } = await repo.listEvents(
        { dateFrom: "2026-08-01", dateTo: "2026-10-01" },
        PAGE,
      );

      expect(rows.map((row) => row.id)).toContain(late);
      expect(rows.map((row) => row.id)).not.toContain(early);
    });

    it("keeps only events holding fewer standings than the field the source reported", async () => {
      const { early, late } = await seedPagingSet();

      const { rows } = await repo.listEvents({ incompleteStandings: true }, PAGE);

      expect(rows.map((row) => row.id)).toContain(late);
      expect(rows.map((row) => row.id)).toContain(early);
    });

    it("leaves an event with no reported field size out of the incomplete filter", async () => {
      const unknownField = await seedEvent(repo, "mta-page-no-field", { playerCount: null });

      const { rows } = await repo.listEvents({ incompleteStandings: true }, PAGE);

      expect(rows.map((row) => row.id)).not.toContain(unknownField);
    });

    it("keeps only events where no standings row carries a decklist", async () => {
      const { early, late } = await seedPagingSet();

      const { rows } = await repo.listEvents({ noDecks: true }, PAGE);

      expect(rows.map((row) => row.id)).toContain(early);
      expect(rows.map((row) => row.id)).not.toContain(late);
    });

    it("orders by a count the event row does not carry", async () => {
      const { early, late } = await seedPagingSet();

      const { rows } = await repo.listEvents({}, PAGE, {
        sort: "playerRowCount",
        direction: "desc",
      });

      expect(ours(rows, [early, late])).toEqual([late, early]);
    });

    it("sorts a blank organizer last whichever way the column runs", async () => {
      const named = await seedEvent(repo, "mta-page-organizer", { organizer: "MTA Aaa Runner" });
      const blank = await seedEvent(repo, "mta-page-no-organizer", { organizer: null });
      const mine = [named, blank];

      const asc = await repo.listEvents({}, PAGE, { sort: "organizer", direction: "asc" });
      const desc = await repo.listEvents({}, PAGE, { sort: "organizer", direction: "desc" });

      expect(ours(asc.rows, mine).at(-1)).toBe(blank);
      expect(ours(desc.rows, mine).at(-1)).toBe(blank);
    });

    it("counts the filtered set rather than the table", async () => {
      const { late, tag } = await seedPagingSet();

      const all = await repo.listEvents({}, PAGE);
      const narrowed = await repo.listEvents({ search: `Noxus Cup ${tag}` }, PAGE);

      expect(narrowed.rows.map((row) => row.id)).toEqual([late]);
      expect(narrowed.total).toBe(1);
      expect(narrowed.total).toBeLessThan(all.total);
    });

    it("narrows to a provider's events, and manual to events no provider feeds", async () => {
      // Far-future dates: the manual filter matches every source-less event in
      // the shared DB, and these two must land on the newest-first page.
      const sourced = await seedEvent(repo, "mta-page-src-provider", { eventDate: "2031-01-02" });
      const hand = await seedEvent(repo, "mta-page-src-hand", { eventDate: "2031-01-01" });
      await repo.insertEventSource({
        metaEventId: sourced,
        provider: "uvsgames",
        externalId: "mta-page-src-evt",
        label: "uvsgames",
        sourceUrl: null,
      });
      // A citation without a source key does not stop the event being manual.
      await repo.insertEventSource({
        metaEventId: hand,
        provider: null,
        externalId: null,
        label: "Twitch VOD",
        sourceUrl: null,
      });
      const mine = [sourced, hand];

      const byProvider = await repo.listEvents({ source: "uvsgames" }, PAGE);
      const manual = await repo.listEvents({ source: "manual" }, PAGE);

      expect(ours(byProvider.rows, mine)).toEqual([sourced]);
      expect(ours(manual.rows, mine)).toEqual([hand]);
    });
  });

  describe("reads", () => {
    it("counts standings rows and decks per event, newest first", async () => {
      const older = await seedEvent(repo, "mta-read-older", { eventDate: "2026-01-01" });
      const newer = await seedEvent(repo, "mta-read-newer", { eventDate: "2026-12-01" });
      await seedListedPlayer(repo, newer, { playerName: "MTA Reader", rank: 1 });
      await seedDecklessPlayer(repo, newer, { playerName: "MTA Watcher", rank: 2 });

      const events = await repo.allEvents();
      const mine = events.filter((event) => [older, newer].includes(event.id));
      expect(mine.map((event) => event.id)).toEqual([newer, older]);
      expect(mine[0].playerRowCount).toBe(2);
      expect(mine[0].deckCount).toBe(1);
      expect(mine[1].playerRowCount).toBe(0);
      expect(mine[1].deckCount).toBe(0);
    });

    it("folds a legend's standings per event for the index, newest event first", async () => {
      const older = await seedEvent(repo, "mta-records-older", { eventDate: "2026-02-01" });
      const newer = await seedEvent(repo, "mta-records-newer", { eventDate: "2026-11-01" });
      await seedListedPlayer(repo, newer, { playerName: "MTA Rec Winner", rank: 1 });
      await seedDecklessPlayer(repo, newer, { playerName: "MTA Rec Fourth", rank: 4 });
      await seedDecklessPlayer(repo, older, {
        playerName: "MTA Rec Tier",
        rank: 8,
        rankIsTier: true,
      });

      const allRecords = await repo.archiveLegendEventRecords();
      const records = allRecords.filter(
        (row) =>
          row.legendCardId === legendCardId &&
          ["mta-records-older", "mta-records-newer"].includes(row.eventSlug),
      );

      expect(records).toEqual([
        {
          legendCardId,
          eventSlug: "mta-records-newer",
          bestRank: 1,
          rankIsTier: false,
          finishes: 2,
          decklists: 1,
          won: true,
        },
        {
          legendCardId,
          eventSlug: "mta-records-older",
          bestRank: 8,
          rankIsTier: true,
          finishes: 1,
          decklists: 0,
          won: false,
        },
      ]);
    });

    it("resolves an event by slug with its counts", async () => {
      const eventId = await seedEvent(repo, "mta-by-slug");
      await seedListedPlayer(repo, eventId, { playerName: "MTA Slug", rank: 1 });

      const event = await repo.eventBySlug("mta-by-slug");
      expect(event?.id).toBe(eventId);
      expect(event?.playerRowCount).toBe(1);
      expect(event?.deckCount).toBe(1);
      expect(await repo.eventBySlug("mta-no-such-slug")).toBeUndefined();
    });

    it("returns the whole field, deckless entries included, best finish first", async () => {
      const eventId = await seedEvent(repo, "mta-standings");
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA Fourth", rank: 4 });
      await seedListedPlayer(repo, eventId, {
        playerName: "MTA Winner",
        rank: 1,
        wins: 6,
        losses: 0,
        draws: 1,
      });

      const standings = await repo.standingsForEvent(eventId);
      expect(standings.map((row) => row.playerName)).toEqual(["MTA Winner", "MTA Fourth"]);
      expect(standings[0].legendName).toBe("MTA Legend");
      expect(standings[0].championName).toBe("MTA Champion");
      expect(standings[0].shareToken).not.toBeNull();
      expect([standings[0].wins, standings[0].losses, standings[0].draws]).toEqual([6, 0, 1]);
      expect(standings[1].deckId).toBeNull();
      expect(standings[1].listStatus).toBe("none");
    });

    it("takes the podium and nothing deeper, and nothing from an event with no standings", async () => {
      const withPodium = await seedEvent(repo, "mta-winner-one");
      const pending = await seedEvent(repo, "mta-winner-none");
      await seedListedPlayer(repo, withPodium, { playerName: "MTA Champ", rank: 1, wins: 7 });
      await seedDecklessPlayer(repo, withPodium, { playerName: "MTA Runner", rank: 2 });
      await seedDecklessPlayer(repo, withPodium, { playerName: "MTA Third", rank: 3 });
      await seedDecklessPlayer(repo, withPodium, { playerName: "MTA Fourth", rank: 4 });

      const finishes = await repo.topFinishesForEvents([withPodium, pending]);

      expect(finishes).toHaveLength(3);
      expect(finishes.every((row) => row.metaEventId === withPodium)).toBe(true);
      expect(finishes.map((row) => row.playerName)).toEqual([
        "MTA Champ",
        "MTA Runner",
        "MTA Third",
      ]);
      expect(finishes[0].wins).toBe(7);
    });

    it("keeps both rows when a source published two first places, ordered by rank then name", async () => {
      const eventId = await seedEvent(repo, "mta-winner-tie");
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA Zed", rank: 1 });
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA Ashe", rank: 1 });
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA Bronze", rank: 2 });

      const finishes = await repo.topFinishesForEvents([eventId]);

      expect(finishes.map((row) => row.playerName)).toEqual(["MTA Ashe", "MTA Zed", "MTA Bronze"]);
    });

    it("asks nothing of the database for an empty event list", async () => {
      expect(await repo.topFinishesForEvents([])).toEqual([]);
    });

    it("reports later deck and standings batches as bursts, newest first", async () => {
      const eventId = await seedEvent(repo, "mta-activity-late");
      const { deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Fresh",
        rank: 1,
      });
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA Later", rank: 2 });
      await ctx!.db
        .updateTable("metaEvents")
        .set({ createdAt: new Date("2026-08-20T10:00:00Z") })
        .where("id", "=", eventId)
        .execute();
      await ctx!.db
        .updateTable("metaEventPlayers")
        .set({ createdAt: new Date("2026-08-22T09:00:00Z") })
        .where("metaEventId", "=", eventId)
        .execute();
      await ctx!.db
        .updateTable("decks")
        .set({ createdAt: new Date("2026-08-23T09:00:00Z") })
        .where("id", "=", deckId)
        .execute();

      const rows = await repo.recentActivity(500);
      const mine = rows.filter((row) => row.eventSlug === "mta-activity-late");

      expect(mine.map((row) => row.kind)).toEqual(["decks-added", "results-added", "event-added"]);
      expect(mine[0].count).toBe(1);
      expect(mine[1].count).toBe(2);
      expect(mine[2].count).toBeNull();
      expect(mine[0].eventName).toBe("MTA mta-activity-late");
    });

    it("folds rows landing on the event's own creation day into its one row", async () => {
      const eventId = await seedEvent(repo, "mta-activity-fold");
      const { deckId } = await seedListedPlayer(repo, eventId, { playerName: "MTA Same", rank: 1 });
      const sameDay = new Date("2026-08-20T10:00:00Z");
      await ctx!.db
        .updateTable("metaEvents")
        .set({ createdAt: sameDay })
        .where("id", "=", eventId)
        .execute();
      await ctx!.db
        .updateTable("metaEventPlayers")
        .set({ createdAt: new Date("2026-08-20T12:00:00Z") })
        .where("metaEventId", "=", eventId)
        .execute();
      await ctx!.db
        .updateTable("decks")
        .set({ createdAt: new Date("2026-08-20T14:00:00Z") })
        .where("id", "=", deckId)
        .execute();

      const rows = await repo.recentActivity(500);
      const mine = rows.filter((row) => row.eventSlug === "mta-activity-fold");

      expect(mine.map((row) => row.kind)).toEqual(["event-added"]);
    });

    it("leaves the champion null when the standings row names none", async () => {
      const eventId = await seedEvent(repo, "mta-no-champion");
      await seedListedPlayer(repo, eventId, {
        playerName: "MTA Bare",
        rank: 1,
        withChampion: false,
      });

      const [row] = await repo.standingsForEvent(eventId);
      expect(row.legendCardId).toBe(legendCardId);
      expect(row.championCardId).toBeNull();
      expect(row.championName).toBeNull();
    });

    it("lists only the entries a list is known for in the deck browser", async () => {
      const eventId = await seedEvent(repo, "mta-summaries", { name: "MTA Summaries" });
      await seedListedPlayer(repo, eventId, {
        playerName: "MTA Second",
        rank: 4,
        wins: 3,
        losses: 3,
        draws: 0,
      });
      await seedListedPlayer(repo, eventId, { playerName: "MTA First", rank: 1 });
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA Unlisted", rank: 8 });

      const summaries = await repo.allDeckSummaries();
      const decks = summaries.filter((deck) => deck.eventSlug === "mta-summaries");
      expect(decks.map((deck) => deck.playerName)).toEqual(["MTA First", "MTA Second"]);
      expect(decks[0].legendName).toBe("MTA Legend");
      expect(decks[0].championName).toBe("MTA Champion");
      expect(decks[0].eventName).toBe("MTA Summaries");
      expect(decks[0].eventDate).toBe("2026-08-01");
      expect(decks[0].deckName).toBe("MTA First Deck");
      expect(decks[1].wins).toBe(3);
    });

    it("reports each archived list's cards, summed across its zones", async () => {
      const eventId = await seedEvent(repo, "mta-deck-cards");
      const { deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Carded",
        rank: 1,
      });

      const all = await repo.allDeckCards();
      const rows = all.filter((row) => row.deckId === deckId);
      expect(new Map(rows.map((row) => [row.cardId, row.quantity]))).toEqual(
        new Map([
          [legendCardId, 1],
          [championCardId, 3],
          [spellCardId, 3],
        ]),
      );
    });

    it("holds one standings row per deck, which is what keeps the card index unfanned", async () => {
      const eventId = await seedEvent(repo, "mta-deck-cards-unique");
      const { deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Owner",
        rank: 1,
      });
      const otherId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Claimant",
        rank: 2,
      });

      await expect(
        db
          .updateTable("metaEventPlayers")
          .set({ deckId, listStatus: "full" })
          .where("id", "=", otherId)
          .execute(),
      ).rejects.toThrow();
    });

    it("returns the standings context for one deck, and nothing for a foreign deck", async () => {
      const eventId = await seedEvent(repo, "mta-context", { name: "MTA Context" });
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Player",
        rank: 8,
        rankIsTier: true,
        wins: 6,
        losses: 2,
        draws: 0,
      });

      const context = await repo.contextForDeck(deckId);
      expect(context).toEqual({
        playerId,
        listStatus: "full",
        playerName: "MTA Player",
        rank: 8,
        rankIsTier: true,
        wins: 6,
        losses: 2,
        draws: 0,
        eventSlug: "mta-context",
        eventName: "MTA Context",
        eventDate: "2026-08-01",
        eventFormat: FORMAT,
        eventTier: "store",
        eventCountry: null,
      });
      expect(await repo.contextForDeck(crypto.randomUUID())).toBeUndefined();
    });

    it("sums the card count for the admin table and reports zero without a list", async () => {
      const eventId = await seedEvent(repo, "mta-admin-players");
      await seedListedPlayer(repo, eventId, { playerName: "MTA Admin", rank: 1 });
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA Deckless", rank: 2 });

      const [listed, deckless] = await repo.adminPlayersForEvent(eventId);
      // 1 legend + 3 champion + 3 main.
      expect(listed.cardCount).toBe(7);
      expect(listed.deckFormat).toBe(FORMAT);
      expect(listed.shareToken).toMatch(/^mta/u);
      expect(deckless.cardCount).toBe(0);
      expect(deckless.deckFormat).toBeNull();
      expect(deckless.shareToken).toBeNull();
    });

    it("returns the live rows a candidate diffs against", async () => {
      const eventId = await seedEvent(repo, "mta-live-rows");
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Live",
        rank: 1,
      });

      const [row] = await repo.livePlayersByIds([playerId]);
      expect(row.metaEventId).toBe(eventId);
      expect(row.deckId).toBe(deckId);
      expect(row.deckName).toBe("MTA Live Deck");
      expect(row.listStatus).toBe("full");
      expect(await repo.livePlayersByIds([])).toEqual([]);
    });
  });

  describe("event phases", () => {
    function phase(eventId: string, order: number, overrides: Partial<NewMetaEventPhase> = {}) {
      return {
        metaEventId: eventId,
        phaseOrder: order,
        name: `MTA Phase ${order}`,
        roundType: "swiss",
        roundCount: 6,
        rankRequired: null,
        maxGameWins: 2,
        ...overrides,
      };
    }

    it("replaces the published list wholesale and reads it back in play order", async () => {
      const eventId = await seedEvent(repo, "mta-phases");
      expect(await repo.phasesForEvent(eventId)).toEqual([]);

      await repo.replaceEventPhases(eventId, [
        phase(eventId, 1, {
          name: "MTA Top 8",
          roundType: "singleElimination",
          roundCount: 3,
          rankRequired: 8,
        }),
        phase(eventId, 0),
      ]);

      const phases = await repo.phasesForEvent(eventId);
      expect(phases.map((row) => row.name)).toEqual(["MTA Phase 0", "MTA Top 8"]);
      expect(phases[1]).toMatchObject({
        roundType: "singleElimination",
        roundCount: 3,
        rankRequired: 8,
        maxGameWins: 2,
      });

      // The source republishes the whole list on every fetch, so a shorter one
      // takes the place of the longer one rather than merging into it.
      await repo.replaceEventPhases(eventId, [
        phase(eventId, 0, { roundCount: 5, maxGameWins: null }),
      ]);
      const replaced = await repo.phasesForEvent(eventId);
      expect(replaced).toHaveLength(1);
      expect(replaced[0]).toMatchObject({ roundCount: 5, maxGameWins: null });

      await repo.replaceEventPhases(eventId, []);
      expect(await repo.phasesForEvent(eventId)).toEqual([]);
    });

    it("keeps two events' phases apart and holds the order unique within one", async () => {
      const mine = await seedEvent(repo, "mta-phases-mine");
      const other = await seedEvent(repo, "mta-phases-other");
      await repo.replaceEventPhases(mine, [phase(mine, 0)]);
      await repo.replaceEventPhases(other, [phase(other, 0, { name: "MTA Other Phase" })]);

      const theirs = await repo.phasesForEvent(other);
      expect(await repo.phasesForEvent(mine)).toHaveLength(1);
      expect(theirs.map((row) => row.name)).toEqual(["MTA Other Phase"]);

      await expect(
        db.insertInto("metaEventPhases").values(phase(mine, 0)).execute(),
      ).rejects.toThrow(/uq_meta_event_phases_order/u);
    });
  });

  describe("counts", () => {
    it("counts standings rows and decks within the scope", async () => {
      const inScope = await seedEvent(repo, "mta-stats-in", { eventDate: "2026-06-15" });
      const outOfScope = await seedEvent(repo, "mta-stats-out", { eventDate: "2026-01-15" });
      await seedListedPlayer(repo, inScope, { playerName: "MTA Stats A", rank: 1 });
      // A partial list has a complete main deck, so it counts like a full one.
      await seedListedPlayer(repo, inScope, {
        playerName: "MTA Stats B",
        rank: 2,
        listStatus: "partial",
      });
      await seedDecklessPlayer(repo, inScope, { playerName: "MTA Stats C", rank: 3 });
      await seedListedPlayer(repo, outOfScope, { playerName: "MTA Stats D", rank: 1 });

      const scope = { dateFrom: "2026-06-01", dateTo: "2026-06-30" };
      expect(await repo.playerCountInScope(scope)).toBe(3);
      expect(await repo.deckCountInScope(scope)).toBe(2);
    });

    it("scopes by the event's format, not the deck's", async () => {
      // `meta_events.format` is a foreign key, so the scope can only name a real
      // format and cannot be one this test owns. Every other suite seeds into
      // the same archive, so the assertion is on the movement this test causes.
      const eventScope = { format: FORMAT, dateFrom: "2026-09-01", dateTo: "2026-09-30" };
      const deckScope = { ...eventScope, format: DECK_ONLY_FORMAT };
      const before = {
        players: await repo.playerCountInScope(eventScope),
        decks: await repo.deckCountInScope(eventScope),
        deckFormatDecks: await repo.deckCountInScope(deckScope),
      };

      const eventId = await seedEvent(repo, "mta-stats-format", { eventDate: "2026-09-15" });
      await seedListedPlayer(repo, eventId, {
        playerName: "MTA Format",
        rank: 1,
        deckFormat: DECK_ONLY_FORMAT,
      });

      expect(await repo.playerCountInScope(eventScope)).toBe(before.players + 1);
      expect(await repo.deckCountInScope(eventScope)).toBe(before.decks + 1);
      // The deck alone carries this format, and the scope never reads it.
      expect(await repo.deckCountInScope(deckScope)).toBe(before.deckFormatDecks);
    });

    // The overview spans the whole archive, and the integration files share one
    // database, so only the movement this test causes is its own to assert.
    it("narrows the archive funnel from events to standings to decklists", async () => {
      const before = await repo.archiveOverview();

      await seedEvent(repo, "mta-funnel-bare");
      const standingsOnly = await seedEvent(repo, "mta-funnel-standings");
      const withList = await seedEvent(repo, "mta-funnel-lists");
      await seedDecklessPlayer(repo, standingsOnly, { playerName: "MTA Funnel A", rank: 1 });
      await seedListedPlayer(repo, withList, { playerName: "MTA Funnel B", rank: 1 });

      const after = await repo.archiveOverview();
      expect(after.events).toBeGreaterThanOrEqual(before.events + 3);
      expect(after.eventsWithStandings).toBeGreaterThanOrEqual(before.eventsWithStandings + 2);
      expect(after.eventsWithDecklists).toBeGreaterThanOrEqual(before.eventsWithDecklists + 1);
      expect(after.eventsWithStandings).toBeLessThanOrEqual(after.events);
      expect(after.eventsWithDecklists).toBeLessThanOrEqual(after.eventsWithStandings);
      // Decks are counted across events, so the archive holds at least one per
      // event that has any.
      expect(after.decks).toBeGreaterThanOrEqual(before.decks + 1);
      expect(after.decks).toBeGreaterThanOrEqual(after.eventsWithDecklists);
    });

    it("counts every archived deck, not just the events holding one", async () => {
      const before = await repo.archiveOverview();

      const eventId = await seedEvent(repo, "mta-funnel-decks");
      await seedListedPlayer(repo, eventId, { playerName: "MTA Deck One", rank: 1 });
      await seedListedPlayer(repo, eventId, { playerName: "MTA Deck Two", rank: 2 });
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA No Deck", rank: 3 });

      const after = await repo.archiveOverview();
      expect(after.decks).toBe(before.decks + 2);
      expect(after.eventsWithDecklists).toBe(before.eventsWithDecklists + 1);
    });

    it("counts only the events a given provider's citation links", async () => {
      const provider = `mta-src-${crypto.randomUUID().slice(0, 8)}`;
      const sourced = await seedEvent(repo, `mta-funnel-sourced-${provider}`);
      const unsourced = await seedEvent(repo, `mta-funnel-unsourced-${provider}`);
      await repo.insertEventSource({
        metaEventId: sourced,
        provider,
        externalId: provider,
        label: "MTA Source",
        sourceUrl: null,
      });
      await seedListedPlayer(repo, sourced, { playerName: "MTA Sourced", rank: 1 });
      await seedListedPlayer(repo, unsourced, { playerName: "MTA Unsourced", rank: 1 });

      const overview = await repo.archiveOverview(provider);
      expect(overview).toEqual({
        events: 1,
        eventsWithStandings: 1,
        eventsWithDecklists: 1,
        decks: 1,
      });
    });

    it("reports an empty scope as zero rather than failing", async () => {
      const scope = { dateFrom: "1999-01-01", dateTo: "1999-12-31" };
      expect(await repo.playerCountInScope(scope)).toBe(0);
      expect(await repo.deckCountInScope(scope)).toBe(0);
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

    it("rewrites a standings row's scalars", async () => {
      const eventId = await seedEvent(repo, "mta-rewrite-scalars");
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Mover",
        rank: 4,
        rankIsTier: true,
      });

      expect(
        await repo.updatePlayer(playerId, {
          rank: 1,
          rankIsTier: false,
          playerName: "MTA Moved",
          wins: 6,
          losses: 0,
          draws: null,
          championCardId: null,
        }),
      ).toBe(true);

      const context = await repo.contextForDeck(deckId);
      expect(context?.rank).toBe(1);
      expect(context?.rankIsTier).toBe(false);
      expect(context?.playerName).toBe("MTA Moved");
      expect(context?.wins).toBe(6);

      const row = await repo.playerById(playerId);
      expect(row?.championCardId).toBeNull();
      expect(row?.legendCardId).toBe(legendCardId);
    });

    it("rewrites the standings columns behind the rank", async () => {
      const eventId = await seedEvent(repo, "mta-standings-detail");
      const playerId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Tiebreak",
        rank: 1,
      });

      expect(
        await repo.updatePlayer(playerId, {
          matchPoints: 21,
          opponentMatchWinPct: 0.65382653,
          gameWinPct: 0.77777778,
          opponentGameWinPct: 0.64397379,
          entryStatus: "dropped",
        }),
      ).toBe(true);

      const row = await db
        .selectFrom("metaEventPlayers")
        .select([
          "matchPoints",
          "opponentMatchWinPct",
          "gameWinPct",
          "opponentGameWinPct",
          "entryStatus",
        ])
        .where("id", "=", playerId)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({
        matchPoints: 21,
        opponentMatchWinPct: 0.65382653,
        gameWinPct: 0.77777778,
        opponentGameWinPct: 0.64397379,
        entryStatus: "dropped",
      });
    });

    it("writes the reclassify pass's decisions, leaving the fields it left alone", async () => {
      const kept = await seedEvent(repo, "mta-classify-kept");
      const moved = await seedEvent(repo, "mta-classify-moved");
      await repo.updateEvent(kept, {
        tier: "competitive",
        country: "DE",
        location: "Kartenstrasse 1, Berlin",
      });

      expect(
        await repo.setEventClassifications([
          // Naming only `country` leaves the tier and the address as they are.
          { id: kept, country: null },
          { id: moved, tier: "premier", country: "FR", location: "Rue Piltover 2, Paris" },
        ]),
      ).toBe(2);

      expect(await repo.eventById(kept)).toMatchObject({
        tier: "competitive",
        country: null,
        location: "Kartenstrasse 1, Berlin",
      });
      expect(await repo.eventById(moved)).toMatchObject({
        tier: "premier",
        country: "FR",
        location: "Rue Piltover 2, Paris",
      });
    });

    it("touches nothing for an empty classification batch", async () => {
      expect(await repo.setEventClassifications([])).toBe(0);
    });

    it("reports an empty patch against an existing row, and against a missing one", async () => {
      const eventId = await seedEvent(repo, "mta-empty-patch");
      const playerId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Untouched",
        rank: 5,
      });

      expect(await repo.updatePlayer(playerId, {})).toBe(true);
      expect(await repo.updatePlayer(crypto.randomUUID(), {})).toBe(false);
      expect(await repo.updatePlayer(crypto.randomUUID(), { rank: 2 })).toBe(false);
    });

    it("attaches a list to a standings-only entry and mints its permalink", async () => {
      const eventId = await seedEvent(repo, "mta-fill-in");
      const playerId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Filled",
        rank: 1,
      });

      const written = await repo.setPlayerDeck(
        playerId,
        deckInput({ playerName: "MTA Filled", rank: 1 }, "full"),
        "mtafilled001",
      );
      if (!written) {
        throw new Error("setPlayerDeck: standings row not found");
      }
      createdDeckIds.push(written.deckId);

      const row = await repo.playerById(playerId);
      expect(row?.listStatus).toBe("full");
      expect(row?.deckId).toBe(written.deckId);
      expect(row?.shareToken).toBe("mtafilled001");
    });

    it("replaces a list wholesale without rotating the permalink", async () => {
      const eventId = await seedEvent(repo, "mta-replace-list");
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Replaced",
        rank: 1,
      });
      const before = await repo.playerById(playerId);

      const written = await repo.setPlayerDeck(
        playerId,
        {
          name: "MTA Corrected",
          format: FORMAT,
          formatConfig: null,
          cards: [{ cardId: spellCardId, zone: "main", quantity: 1, preferredPrintingId: null }],
          listStatus: "partial",
        },
        "mtareplaced1",
      );
      expect(written?.deckId).toBe(deckId);

      const cards = await db
        .selectFrom("deckCards")
        .select(["cardId", "zone"])
        .where("deckId", "=", deckId)
        .execute();
      expect(cards).toEqual([{ cardId: spellCardId, zone: "main" }]);

      const after = await repo.playerById(playerId);
      expect(after?.listStatus).toBe("partial");
      expect(after?.deckName).toBe("MTA Corrected");
      // Links already published to this deck have to keep working.
      expect(after?.shareToken).toBe(before?.shareToken);
    });

    it("rewrites nothing when the same list is written again", async () => {
      const eventId = await seedEvent(repo, "mta-rewrite-same-list");
      const opts = { playerName: "MTA Unchanged", rank: 1 };
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, opts);
      const before = await db
        .selectFrom("deckCards")
        .select("id")
        .where("deckId", "=", deckId)
        .orderBy("id", "asc")
        .execute();
      const deckBefore = await db
        .selectFrom("decks")
        .select("updatedAt")
        .where("id", "=", deckId)
        .executeTakeFirst();

      await repo.setPlayerDeck(playerId, deckInput(opts, "full"), "mtaunchanged");

      // A re-promote runs over every event's whole field, so writing an
      // identical list would churn every card row in the archive each pass.
      const after = await db
        .selectFrom("deckCards")
        .select("id")
        .where("deckId", "=", deckId)
        .orderBy("id", "asc")
        .execute();
      const deckAfter = await db
        .selectFrom("decks")
        .select("updatedAt")
        .where("id", "=", deckId)
        .executeTakeFirst();
      expect(after).toEqual(before);
      expect(deckAfter?.updatedAt).toEqual(deckBefore?.updatedAt);
    });

    it("keeps a curated deck name when the caller asks for it", async () => {
      const eventId = await seedEvent(repo, "mta-preserve-deck-name");
      const opts = { playerName: "MTA Renamed", rank: 1 };
      const { playerId, deckId } = await seedListedPlayer(repo, eventId, opts);
      await db
        .updateTable("decks")
        .set({ name: "MTA Curated Name" })
        .where("id", "=", deckId)
        .execute();

      await repo.setPlayerDeck(playerId, deckInput(opts, "full"), "mtapreserve1", {
        preserveName: true,
      });
      const preserved = await repo.playerById(playerId);
      await repo.setPlayerDeck(playerId, deckInput(opts, "full"), "mtapreserve1");

      const overwritten = await repo.playerById(playerId);

      expect(preserved?.deckName).toBe("MTA Curated Name");
      // Without the flag the caller's name is the name, which is what the
      // admin's own edit means.
      expect(overwritten?.deckName).toBe("MTA Renamed Deck");
    });

    it("renames an attached deck, and reports a row that has none to rename", async () => {
      const eventId = await seedEvent(repo, "mta-rename-deck");
      const opts = { playerName: "MTA Namer", rank: 1 };
      const { playerId } = await seedListedPlayer(repo, eventId, opts);
      const decklessId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Deckless",
        rank: 2,
      });

      expect(await repo.renamePlayerDeck(playerId, "MTA Chosen Name")).toBe(true);
      // Not an error: an entry with no list has no name to carry, so the
      // caller learns nothing was written rather than throwing.
      expect(await repo.renamePlayerDeck(decklessId, "MTA Chosen Name")).toBe(false);
      expect(await repo.renamePlayerDeck(crypto.randomUUID(), "MTA Chosen Name")).toBe(false);

      const row = await repo.playerById(playerId);
      expect(row?.deckName).toBe("MTA Chosen Name");
    });

    it("reports a list written against a standings row that doesn't exist", async () => {
      const written = await repo.setPlayerDeck(
        crypto.randomUUID(),
        deckInput({ playerName: "MTA Ghost", rank: 1 }, "full"),
        "mtaghost0001",
      );
      expect(written).toBeUndefined();
    });

    it("treats clearing a standings-only entry as a no-op, and reports a missing row", async () => {
      const eventId = await seedEvent(repo, "mta-clear-noop");
      const playerId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Nothing",
        rank: 3,
      });

      expect(await repo.clearPlayerDeck(playerId)).toBe(true);
      expect(await repo.clearPlayerDeck(crypto.randomUUID())).toBe(false);
    });
  });

  describe("sitemap", () => {
    it("lists event slugs and deck tokens with ISO timestamps", async () => {
      const eventId = await seedEvent(repo, "mta-sitemap");
      const { deckId } = await seedListedPlayer(repo, eventId, {
        playerName: "MTA Crawl",
        rank: 1,
      });

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

    it("omits a standings-only entry, which has no page to crawl", async () => {
      const eventId = await seedEvent(repo, "mta-sitemap-deckless");
      await seedDecklessPlayer(repo, eventId, { playerName: "MTA Uncrawled", rank: 1 });

      const { decks } = await repo.sitemapEntries();
      expect(decks.every((entry) => entry.slug !== null && entry.slug !== "")).toBe(true);
      const event = await repo.eventById(eventId);
      expect(event?.playerRowCount).toBe(1);
      expect(event?.deckCount).toBe(0);
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

      // One event, two citations: the fan-in this supports. Neither is
      // reachable by a live-side key any more — the link is the candidate's
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
    it("credits one person once per event however many entries they added", async () => {
      const eventId = await seedEvent(repo, "mta-credit-once");
      const first = await seedListedPlayer(repo, eventId, { playerName: "MTA A", rank: 1 });
      const second = await seedListedPlayer(repo, eventId, { playerName: "MTA B", rank: 2 });
      const userId = await seedUser("once", "name", { name: "MTA Nova" });

      await repo.insertCredit({
        metaEventId: eventId,
        metaEventPlayerId: first.playerId,
        userId,
      });
      await repo.insertCredit({
        metaEventId: eventId,
        metaEventPlayerId: second.playerId,
        userId,
      });

      const contributors = await repo.contributorsForEvent(eventId);
      expect(contributors).toEqual([{ metaEventId: eventId, userId, displayName: "MTA Nova" }]);
    });

    it("is idempotent, so re-accepting a corrected list adds no second row", async () => {
      const eventId = await seedEvent(repo, "mta-credit-idempotent");
      const { playerId } = await seedListedPlayer(repo, eventId, { playerName: "MTA C", rank: 1 });
      const userId = await seedUser("idem", "name", { name: "MTA Rell" });

      await repo.insertCredit({ metaEventId: eventId, metaEventPlayerId: playerId, userId });
      await repo.insertCredit({ metaEventId: eventId, metaEventPlayerId: playerId, userId });
      // The event-level credit is a different contribution, NULLS NOT DISTINCT
      // keeping it to one of its own.
      await repo.insertCredit({ metaEventId: eventId, metaEventPlayerId: null, userId });
      await repo.insertCredit({ metaEventId: eventId, metaEventPlayerId: null, userId });

      const rows = await db
        .selectFrom("metaCredits")
        .select("id")
        .where("metaEventId", "=", eventId)
        .execute();
      expect(rows).toHaveLength(2);
    });

    it("drops a contributor who never opted in", async () => {
      const eventId = await seedEvent(repo, "mta-credit-hidden");
      const { playerId } = await seedListedPlayer(repo, eventId, { playerName: "MTA D", rank: 1 });
      const userId = await seedUser("hidden", "hidden", { name: "MTA Invisible" });

      await repo.insertCredit({ metaEventId: eventId, metaEventPlayerId: playerId, userId });
      expect(await repo.contributorsForEvent(eventId)).toEqual([]);
    });

    it("falls back to the display name when the Riot ID is unset", async () => {
      const eventId = await seedEvent(repo, "mta-credit-riot-fallback");
      const { playerId } = await seedListedPlayer(repo, eventId, { playerName: "MTA E", rank: 1 });
      const userId = await seedUser("riotless", "riot_id", { name: "MTA Ekko", riotId: null });

      await repo.insertCredit({ metaEventId: eventId, metaEventPlayerId: playerId, userId });
      const [contributor] = await repo.contributorsForEvent(eventId);
      expect(contributor.displayName).toBe("MTA Ekko");
    });

    it("prefers the Riot ID when the contributor chose it", async () => {
      const eventId = await seedEvent(repo, "mta-credit-riot");
      const { playerId } = await seedListedPlayer(repo, eventId, { playerName: "MTA F", rank: 1 });
      const userId = await seedUser("riot", "riot_id", {
        name: "MTA Ekko",
        riotId: "MTA Ekko#EUW",
      });

      await repo.insertCredit({ metaEventId: eventId, metaEventPlayerId: playerId, userId });
      const [contributor] = await repo.contributorsForEvent(eventId);
      expect(contributor.displayName).toBe("MTA Ekko#EUW");
    });

    it("omits a contributor whose chosen field is blank rather than printing an id", async () => {
      const eventId = await seedEvent(repo, "mta-credit-blank");
      const { playerId } = await seedListedPlayer(repo, eventId, { playerName: "MTA G", rank: 1 });
      const userId = await seedUser("blank", "name", { name: "   " });

      await repo.insertCredit({ metaEventId: eventId, metaEventPlayerId: playerId, userId });
      expect(await repo.contributorsForEvent(eventId)).toEqual([]);
    });

    it("scopes a credit delete to one contributor of a shared entry", async () => {
      const eventId = await seedEvent(repo, "mta-credit-unlink");
      const { playerId } = await seedListedPlayer(repo, eventId, { playerName: "MTA H", rank: 1 });
      const staying = await seedUser("staying", "name", { name: "MTA Stays" });
      const leaving = await seedUser("leaving", "name", { name: "MTA Leaves" });

      await repo.insertCredit({
        metaEventId: eventId,
        metaEventPlayerId: playerId,
        userId: staying,
      });
      await repo.insertCredit({
        metaEventId: eventId,
        metaEventPlayerId: playerId,
        userId: leaving,
      });
      await repo.deleteCreditsForPlayer(playerId, leaving);

      const contributors = await repo.contributorsForEvent(eventId);
      expect(contributors.map((row) => row.displayName)).toEqual(["MTA Stays"]);
      const entryContributors = await repo.contributorsForPlayer(playerId);
      expect(entryContributors.map((row) => row.userId)).toEqual([staying]);
    });

    it("reads and writes a contributor's visibility setting", async () => {
      const eventId = await seedEvent(repo, "mta-credit-visibility");
      const { playerId } = await seedListedPlayer(repo, eventId, { playerName: "MTA K", rank: 1 });
      const userId = await seedUser("visibility", "hidden", { name: "MTA Opt In" });
      await repo.insertCredit({ metaEventId: eventId, metaEventPlayerId: playerId, userId });

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
  describe("players the source identifies", () => {
    let eventId: string;

    it("names a row filed under a source id from the players table", async () => {
      await db
        .insertInto("uvsgamesPlayers")
        .values({ id: UVS_PLAYER_ID, displayName: "MTA Source Name" })
        .execute();
      eventId = await seedEvent(repo, "mta-uvs-players");
      const created = await repo.createPlayer(
        {
          eventId,
          rank: 1,
          rankIsTier: false,
          // Filed under the source's identity, so the archive stores no name.
          playerName: null,
          uvsgamesPlayerId: UVS_PLAYER_ID,
          wins: null,
          losses: null,
          draws: null,
          legendCardId,
          championCardId: null,
          deck: null,
        },
        null,
      );
      expect(created).not.toBeUndefined();

      const standings = await repo.standingsForEvent(eventId);
      expect(standings[0].playerName).toBe("MTA Source Name");
    });

    it("propagates a rename to the standings without touching the row", async () => {
      await db
        .updateTable("uvsgamesPlayers")
        .set({ displayName: "MTA Renamed" })
        .where("id", "=", UVS_PLAYER_ID)
        .execute();

      const standings = await repo.standingsForEvent(eventId);
      expect(standings[0].playerName).toBe("MTA Renamed");
    });

    it("lets a locally written name win over the source's", async () => {
      const standings = await repo.standingsForEvent(eventId);
      expect(await repo.updatePlayer(standings[0].id, { playerName: "MTA Admin Override" })).toBe(
        true,
      );

      const overridden = await repo.standingsForEvent(eventId);
      expect(overridden[0].playerName).toBe("MTA Admin Override");

      // Clearing it hands the player back to the source's renames.
      await repo.updatePlayer(standings[0].id, { playerName: null });
      const restored = await repo.standingsForEvent(eventId);
      expect(restored[0].playerName).toBe("MTA Renamed");
    });

    it("refuses a second row for the same player in one event", async () => {
      await expect(
        repo.createPlayer(
          {
            eventId,
            rank: 2,
            rankIsTier: false,
            playerName: null,
            uvsgamesPlayerId: UVS_PLAYER_ID,
            wins: null,
            losses: null,
            draws: null,
            legendCardId,
            championCardId: null,
            deck: null,
          },
          null,
        ),
      ).rejects.toThrow();
    });

    it("refuses a row that names nobody at all", async () => {
      await expect(
        db
          .insertInto("metaEventPlayers")
          .values({ metaEventId: eventId, rank: 9, playerName: null })
          .execute(),
      ).rejects.toThrow();
    });

    it("still files a pushed player under a name, with no source identity", async () => {
      const playerId = await seedDecklessPlayer(repo, eventId, {
        playerName: "MTA Pushed",
        rank: 3,
      });

      const row = await repo.playerById(playerId);
      expect(row?.playerName).toBe("MTA Pushed");
    });
  });
});

describe.skipIf(!ctx)("promotion", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaRepo(db);

  const EXTERNAL_ID = "mta-promote-1";
  const UVS_A = 990_201;
  const UVS_B = 990_202;
  /** A seat the mirror knows before any standings row names them. */
  const UVS_LATE = 990_203;
  let repos: Repos;
  let metaEventId: string;

  afterAll(async () => {
    // The live rows go first: `meta_event_players.uvsgames_player_id` has no
    // ON DELETE, so a mirrored player cannot be removed while one cites it.
    if (metaEventId !== undefined) {
      await db.deleteFrom("metaEvents").where("id", "=", metaEventId).execute();
    }
    await db.deleteFrom("uvsgamesEventMatches").where("externalId", "=", EXTERNAL_ID).execute();
    await db.deleteFrom("uvsgamesEventStandings").where("externalId", "=", EXTERNAL_ID).execute();
    await db.deleteFrom("uvsgamesEvents").where("externalId", "=", EXTERNAL_ID).execute();
    await db.deleteFrom("uvsgamesPlayers").where("id", "in", [UVS_A, UVS_B, UVS_LATE]).execute();
  });

  /**
   * One accepted event whose mirror holds two players and the match between
   * them, which is the smallest shape that exercises every promotion step.
   */
  async function seedMirror(): Promise<void> {
    repos = createRepos(db);

    await db
      .insertInto("uvsgamesPlayers")
      .values([
        { id: UVS_A, displayName: "MTA Ashe" },
        { id: UVS_B, displayName: "MTA Riven" },
      ])
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    await db
      .insertInto("uvsgamesEvents")
      .values({
        externalId: EXTERNAL_ID,
        name: "MTA Promotion Cup",
        startAt: new Date("2026-08-15T09:00:00Z"),
        displayStatus: "complete",
        eventFormat: "Constructed",
        playerCount: 2,
        contentHash: "mta-hash",
        lastSeenAt: new Date("2026-08-16T00:00:00Z"),
      })
      .execute();

    await db
      .insertInto("uvsgamesFormatMappings")
      .values({ sourceFormat: "constructed", mappedFormat: "constructed" })
      .onConflict((oc) => oc.column("sourceFormat").doNothing())
      .execute();

    const live = await repo.createEvent({
      slug: "mta-promotion-cup",
      name: "MTA Promotion Cup",
      eventDate: "2026-08-15",
      format: "constructed",
      playerCount: null,
      organizer: null,
      notes: null,
      tier: "store",
      country: null,
      location: null,
    });
    metaEventId = live.id;

    await repo.insertEventSource({
      metaEventId,
      provider: "uvsgames",
      externalId: EXTERNAL_ID,
      label: "uvsgames",
      sourceUrl: null,
    });

    await db
      .insertInto("uvsgamesEventStandings")
      .values([
        {
          externalId: EXTERNAL_ID,
          registrationId: "r1",
          uvsgamesPlayerId: UVS_A,
          rank: 1,
          wins: 1,
        },
        {
          externalId: EXTERNAL_ID,
          registrationId: "r2",
          uvsgamesPlayerId: UVS_B,
          rank: 2,
          wins: 0,
        },
      ])
      .execute();

    await db
      .insertInto("uvsgamesEventMatches")
      .values({
        externalId: EXTERNAL_ID,
        roundId: "901",
        sourceMatchId: "m-901-1",
        roundNumber: 1,
        player1UvsgamesId: UVS_A,
        player2UvsgamesId: UVS_B,
        winnerUvsgamesId: UVS_A,
      })
      .execute();
  }

  it("writes the field and its pairings from the mirror", async () => {
    await seedMirror();

    const result = await promoteMetaEvent(repos, metaEventId);

    expect(result.players).toBe(2);
    expect(result.matches).toBe(1);
    const players = await repo.rawStandingsForEvent(metaEventId);
    expect(players.map((row) => row.uvsgamesPlayerId).toSorted()).toEqual([UVS_A, UVS_B]);
  });

  it("is idempotent: a second run keeps every live id and value", async () => {
    const before = await repo.rawStandingsForEvent(metaEventId);

    await promoteMetaEvent(repos, metaEventId);

    const after = await repo.rawStandingsForEvent(metaEventId);
    // Identity is load-bearing: decks, matches and share tokens hang off it.
    expect(after.map((row) => row.id).toSorted()).toEqual(before.map((row) => row.id).toSorted());
    expect(after.map((row) => row.rank).toSorted()).toEqual([1, 2]);
  });

  it("keeps a player's live row when the source re-ranks them", async () => {
    const before = await repo.rawStandingsForEvent(metaEventId);
    const beforeById = new Map(before.map((row) => [row.uvsgamesPlayerId, row.id]));

    await db
      .updateTable("uvsgamesEventStandings")
      .set({ rank: 2 })
      .where("externalId", "=", EXTERNAL_ID)
      .where("registrationId", "=", "r1")
      .execute();
    await db
      .updateTable("uvsgamesEventStandings")
      .set({ rank: 1 })
      .where("externalId", "=", EXTERNAL_ID)
      .where("registrationId", "=", "r2")
      .execute();

    await promoteMetaEvent(repos, metaEventId);

    const after = await repo.rawStandingsForEvent(metaEventId);
    expect(new Map(after.map((row) => [row.uvsgamesPlayerId, row.id]))).toEqual(beforeById);
    expect(after.find((row) => row.uvsgamesPlayerId === UVS_A)?.rank).toBe(2);
  });

  it("carries the source's own match id through, so a re-promote upserts one pairing", async () => {
    const first = await repo.matchesForEvent(metaEventId);

    const promoted = await promoteMetaEvent(repos, metaEventId);

    const second = await repo.matchesForEvent(metaEventId);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ sourceMatchId: "m-901-1", sourceRoundId: "901" });
    // The live upsert keys on (event, source match id): without the id flowing
    // through, every pass would insert the round's pairings again.
    expect(promoted.matches).toBe(1);
    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id));
  });

  it("promotes a pairing again once both its players have live rows", async () => {
    await db
      .insertInto("uvsgamesPlayers")
      .values({ id: UVS_LATE, displayName: "MTA Late Add" })
      .execute();
    await db
      .insertInto("uvsgamesEventMatches")
      .values({
        externalId: EXTERNAL_ID,
        roundId: "902",
        sourceMatchId: "m-902-1",
        roundNumber: 2,
        player1UvsgamesId: UVS_A,
        // No standings row names this seat yet, so the pairing cannot promote.
        player2UvsgamesId: UVS_LATE,
      })
      .execute();

    const withoutOpponent = await promoteMetaEvent(repos, metaEventId);
    expect(withoutOpponent.matches).toBe(1);

    await db
      .insertInto("uvsgamesEventStandings")
      .values({
        externalId: EXTERNAL_ID,
        registrationId: "r3",
        uvsgamesPlayerId: UVS_LATE,
        rank: 3,
      })
      .execute();

    // No stamped-back link and no retry queue: the next promote simply picks
    // it up now that both seats resolve.
    const promoted = await promoteMetaEvent(repos, metaEventId);
    expect(promoted.matches).toBe(2);
  });

  it("lets an accepted overlay win the field it claims, and ignores a pending one", async () => {
    const pending = await repos.metaOverlays.insertEventOverlay({
      metaEventId,
      name: "Never Applied",
      claimedFields: ["name"],
      submittedByUserId: META_ARCHIVE_USER_ID,
    });

    await promoteMetaEvent(repos, metaEventId);
    const unapplied = await repo.eventById(metaEventId);
    expect(unapplied?.name).toBe("MTA Promotion Cup");

    await repos.metaOverlays.setEventOverlayStatus(pending, "accepted", new Date());
    await promoteMetaEvent(repos, metaEventId);

    // And it survives the next promote, which is the whole point of the mask.
    await promoteMetaEvent(repos, metaEventId);
    const applied = await repo.eventById(metaEventId);
    expect(applied?.name).toBe("Never Applied");

    await db.deleteFrom("metaEventOverlays").where("id", "=", pending).execute();
  });

  // Last in this block: it leaves thousands of pairings on the event, which
  // every test above reads.
  it("writes a round-by-round history wider than one statement can bind", async () => {
    const players = await repo.rawStandingsForEvent(metaEventId);
    const [first, second] = players;
    // 13 bound columns a row, against postgres's 65534: a 1000-player Swiss
    // reaches this, and used to take the whole recheck job down with it.
    const rows = Array.from({ length: 6000 }, (_entry, index) => ({
      metaEventId,
      sourceMatchId: `m-wide-${index}`,
      sourceRoundId: "903",
      phaseOrder: 0,
      roundNumber: 3,
      tableNumber: index + 1,
      isBye: false,
      isDraw: false,
      player1Id: first.id,
      player2Id: second.id,
      winnerId: first.id,
      gamesWonP1: 2,
      gamesWonP2: 1,
    }));

    const written = await repo.upsertEventMatches(rows);
    expect(written).toHaveLength(rows.length);

    // The conflict target still holds across batch boundaries, so a replayed
    // materialization refreshes rather than duplicating.
    const again = await repo.upsertEventMatches(rows);
    expect(again.map((row) => row.id).toSorted()).toEqual(written.map((row) => row.id).toSorted());
  });
});
