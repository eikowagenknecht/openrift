import type { MetaCreditVisibility, MetaListStatus } from "@openrift/shared/types";
import { afterAll, describe, expect, it } from "vitest";

import type { Repos } from "../deps.js";
import { materializeCandidateMatches } from "../services/meta-event-matches.js";
import { suggestMetaEventMatches } from "../services/meta-match-suggestions.js";
import { createDbContext } from "../test/integration-context.js";
import { metaCandidatesRepo } from "./meta-candidates.js";
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
    format: FORMAT,
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
      const eventId = await seedEvent(repo, "mta-stats-format", { eventDate: "2026-09-15" });
      await seedListedPlayer(repo, eventId, { playerName: "MTA Format", rank: 1 });

      const scope = { format: FORMAT, dateFrom: "2026-09-01", dateTo: "2026-09-30" };
      expect(await repo.playerCountInScope(scope)).toBe(1);
      expect(await repo.deckCountInScope(scope)).toBe(1);
      expect(await repo.deckCountInScope({ ...scope, format: "no-such-format" })).toBe(0);
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

    it("moves a standings row to another event and rewrites its scalars", async () => {
      const from = await seedEvent(repo, "mta-move-from");
      const to = await seedEvent(repo, "mta-move-to");
      const { playerId, deckId } = await seedListedPlayer(repo, from, {
        playerName: "MTA Mover",
        rank: 4,
        rankIsTier: true,
      });

      expect(
        await repo.updatePlayer(playerId, {
          eventId: to,
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
      expect(context?.eventSlug).toBe("mta-move-to");
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

describe.skipIf(!ctx)("event matches", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaRepo(db);
  const candidates = metaCandidatesRepo(db);

  const PROVIDER = "mta-matches";
  const UVS_A = 990_201;
  const UVS_B = 990_202;
  const UVS_C = 990_203;

  afterAll(async () => {
    // Candidates first: their match rows FK the uvs players without a cascade.
    await db.deleteFrom("candidateMetaEvents").where("provider", "=", PROVIDER).execute();
    await db.deleteFrom("uvsgamesPlayers").where("id", "in", [UVS_A, UVS_B, UVS_C]).execute();
  });

  async function seedField(slug: string): Promise<{
    eventId: string;
    candidateEventId: string;
    liveByUvsId: Map<number, string>;
  }> {
    await db
      .insertInto("uvsgamesPlayers")
      .values([
        { id: UVS_A, displayName: "MTA Seat A" },
        { id: UVS_B, displayName: "MTA Seat B" },
        { id: UVS_C, displayName: "MTA Seat C" },
      ])
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();

    const eventId = await seedEvent(repo, slug);
    const candidateEventId = await candidates.insertEvent({
      provider: PROVIDER,
      externalId: slug,
      name: `MTA ${slug}`,
      eventDate: "2026-08-01",
      format: FORMAT,
      playerCount: 3,
      organizer: null,
      sourceUrl: null,
      notes: null,
      tier: null,
      country: null,
      location: null,
      metaEventId: eventId,
    });

    const liveByUvsId = new Map<number, string>();
    for (const [index, uvsId] of [UVS_A, UVS_B, UVS_C].entries()) {
      const liveId = await seedDecklessPlayer(repo, eventId, {
        playerName: `MTA Seat ${uvsId}`,
        rank: index + 1,
      });
      await candidates.insertPlayer({
        candidateEventId,
        externalId: `reg-${uvsId}`,
        playerName: `MTA Seat ${uvsId}`,
        rank: index + 1,
        uvsgamesPlayerId: uvsId,
        metaEventPlayerId: liveId,
      });
      liveByUvsId.set(uvsId, liveId);
    }
    return { eventId, candidateEventId, liveByUvsId };
  }

  function stagedMatch(
    candidateEventId: string,
    roundId: string,
    p1: number,
    p2: number | null,
    overrides: Partial<{
      roundNumber: number;
      tableNumber: number | null;
      winner: number | null;
    }> = {},
  ) {
    return {
      candidateEventId,
      // The source's own key: distinct per seat pairing within the round.
      sourceMatchId: `${roundId}-${p1}-${p2 ?? "bye"}`,
      roundId,
      phaseOrder: 0,
      roundNumber: overrides.roundNumber ?? 1,
      tableNumber: overrides.tableNumber === undefined ? 1 : overrides.tableNumber,
      isBye: p2 === null,
      isDraw: false,
      player1UvsgamesId: p1,
      player2UvsgamesId: p2,
      winnerUvsgamesId: overrides.winner === undefined ? p1 : overrides.winner,
      gamesWonP1: 2,
      gamesWonP2: p2 === null ? null : 0,
    };
  }

  it("stages, materializes, and stamps a round of matches", async () => {
    const { eventId, candidateEventId, liveByUvsId } = await seedField("mta-matches-flow");

    await candidates.replaceRoundMatches(candidateEventId, "r1", [
      stagedMatch(candidateEventId, "r1", UVS_A, UVS_B),
      stagedMatch(candidateEventId, "r1", UVS_C, null, { tableNumber: null }),
    ]);
    expect(await candidates.matchRoundIds(candidateEventId)).toEqual(["r1"]);
    expect(await candidates.unmaterializedMatches(candidateEventId)).toHaveLength(2);

    const summary = await materializeCandidateMatches(
      { meta: repo, metaCandidates: candidates },
      candidateEventId,
      eventId,
    );
    expect(summary).toEqual({ materialized: 2, waiting: 0 });

    const live = await repo.matchesForEvent(eventId);
    expect(live).toHaveLength(2);
    expect(live[0]).toMatchObject({
      player1Id: liveByUvsId.get(UVS_A),
      player2Id: liveByUvsId.get(UVS_B),
      winnerId: liveByUvsId.get(UVS_A),
      isBye: false,
    });
    expect(live[1]).toMatchObject({
      player1Id: liveByUvsId.get(UVS_C),
      player2Id: null,
      isBye: true,
      tableNumber: null,
    });
    expect(await candidates.unmaterializedMatches(candidateEventId)).toHaveLength(0);
  });

  it("answers the write with each row's live id beside its source match id", async () => {
    const { eventId, candidateEventId, liveByUvsId } = await seedField("mta-matches-returning");

    await candidates.replaceRoundMatches(candidateEventId, "r1", [
      stagedMatch(candidateEventId, "r1", UVS_A, UVS_B),
      stagedMatch(candidateEventId, "r1", UVS_C, null, { roundNumber: 2, tableNumber: null }),
    ]);
    const staged = await candidates.unmaterializedMatches(candidateEventId);

    const written = await repo.upsertEventMatches(
      staged.map((match) => ({
        metaEventId: eventId,
        sourceMatchId: match.sourceMatchId,
        sourceRoundId: match.roundId,
        phaseOrder: match.phaseOrder,
        roundNumber: match.roundNumber,
        tableNumber: match.tableNumber,
        isBye: match.isBye,
        isDraw: match.isDraw,
        player1Id: liveByUvsId.get(match.player1UvsgamesId) as string,
        player2Id:
          match.player2UvsgamesId === null
            ? null
            : (liveByUvsId.get(match.player2UvsgamesId) as string),
        winnerId: null,
        gamesWonP1: match.gamesWonP1,
        gamesWonP2: match.gamesWonP2,
      })),
    );

    expect(written).toHaveLength(2);
    const bySource = new Map(written.map((row) => [row.sourceMatchId, row.id]));
    expect(bySource.has(`r1-${UVS_A}-${UVS_B}`)).toBe(true);
    expect(bySource.has(`r1-${UVS_C}-bye`)).toBe(true);
    expect(new Set(bySource.values()).size).toBe(2);
  });

  it("leaves a match waiting while a participant has no live row, then completes it", async () => {
    const { eventId, candidateEventId } = await seedField("mta-matches-waiting");
    const [pending] = await candidates.playersByCandidateEventIds([candidateEventId]);
    if (pending === undefined) {
      throw new Error("no candidate players staged");
    }
    await candidates.updatePlayer(pending.id, { metaEventPlayerId: null });
    const pendingUvsId = pending.uvsgamesPlayerId as number;
    const otherUvsId = [UVS_A, UVS_B, UVS_C].find((id) => id !== pendingUvsId) as number;

    await candidates.replaceRoundMatches(candidateEventId, "r1", [
      stagedMatch(candidateEventId, "r1", pendingUvsId, otherUvsId, { winner: otherUvsId }),
    ]);

    const first = await materializeCandidateMatches(
      { meta: repo, metaCandidates: candidates },
      candidateEventId,
      eventId,
    );
    expect(first).toEqual({ materialized: 0, waiting: 1 });
    expect(await repo.matchesForEvent(eventId)).toHaveLength(0);

    const liveId = await seedDecklessPlayer(repo, eventId, {
      playerName: "MTA Late Accept",
      rank: 9,
    });
    await candidates.updatePlayer(pending.id, { metaEventPlayerId: liveId });

    const second = await materializeCandidateMatches(
      { meta: repo, metaCandidates: candidates },
      candidateEventId,
      eventId,
    );
    expect(second).toEqual({ materialized: 1, waiting: 0 });
    expect(await repo.matchesForEvent(eventId)).toHaveLength(1);
  });

  it("replaces a refetched round wholesale, live rows included", async () => {
    const { eventId, candidateEventId } = await seedField("mta-matches-replace");

    await candidates.replaceRoundMatches(candidateEventId, "r1", [
      stagedMatch(candidateEventId, "r1", UVS_A, UVS_B),
    ]);
    await materializeCandidateMatches(
      { meta: repo, metaCandidates: candidates },
      candidateEventId,
      eventId,
    );
    expect(await repo.matchesForEvent(eventId)).toHaveLength(1);

    await candidates.replaceRoundMatches(candidateEventId, "r1", [
      stagedMatch(candidateEventId, "r1", UVS_A, UVS_C, { tableNumber: 2 }),
    ]);

    // The replaced generation took its live row with it; the new one waits.
    expect(await repo.matchesForEvent(eventId)).toHaveLength(0);
    const staged = await candidates.unmaterializedMatches(candidateEventId);
    expect(staged).toHaveLength(1);
    expect(staged[0]?.player2UvsgamesId).toBe(UVS_C);
  });

  it("takes the live matches when a player row goes, and the staging survives unstamped", async () => {
    const { eventId, candidateEventId, liveByUvsId } = await seedField("mta-matches-cascade");

    await candidates.replaceRoundMatches(candidateEventId, "r1", [
      stagedMatch(candidateEventId, "r1", UVS_A, UVS_B),
    ]);
    await materializeCandidateMatches(
      { meta: repo, metaCandidates: candidates },
      candidateEventId,
      eventId,
    );

    await db
      .deleteFrom("metaEventPlayers")
      .where("id", "=", liveByUvsId.get(UVS_B) as string)
      .execute();

    expect(await repo.matchesForEvent(eventId)).toHaveLength(0);
    const staged = await candidates.unmaterializedMatches(candidateEventId);
    expect(staged).toHaveLength(1);
    expect(staged[0]?.metaEventMatchId).toBeNull();
  });

  it("holds the match shape by CHECK: a bye has one seat and a winner is a participant", async () => {
    const { eventId, liveByUvsId } = await seedField("mta-matches-checks");
    const p1 = liveByUvsId.get(UVS_A) as string;
    const p2 = liveByUvsId.get(UVS_B) as string;
    const outsider = liveByUvsId.get(UVS_C) as string;

    await expect(
      db
        .insertInto("metaEventMatches")
        .values({
          metaEventId: eventId,
          roundNumber: 1,
          player1Id: p1,
          player2Id: null,
          isBye: false,
        })
        .execute(),
    ).rejects.toThrow(/chk_meta_event_matches_bye/u);

    await expect(
      db
        .insertInto("metaEventMatches")
        .values({
          metaEventId: eventId,
          roundNumber: 1,
          player1Id: p1,
          player2Id: p2,
          winnerId: outsider,
        })
        .execute(),
    ).rejects.toThrow(/chk_meta_event_matches_winner/u);
  });
});

describe.skipIf(!ctx)("staged candidates the source identifies", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaRepo(db);
  const candidates = metaCandidatesRepo(db);

  const SOURCE_PROVIDER = "uvsgames";
  const OWN_PROVIDER = "mta-staging";
  const MIRROR_KEY = "mta-cls-1";
  const TEMPLATE_ID = "mta-cls-template";
  const UVS_IDS = [990_301, 990_302, 990_303];

  afterAll(async () => {
    await db
      .deleteFrom("candidateMetaEvents")
      .where("provider", "in", [SOURCE_PROVIDER, OWN_PROVIDER])
      .where("externalId", "in", [MIRROR_KEY, "mta-staging-1", "mta-staging-2", "mta-staging-3"])
      .execute();
    await db.deleteFrom("uvsgamesEvents").where("externalId", "=", MIRROR_KEY).execute();
    await db.deleteFrom("uvsgamesEventTemplates").where("templateId", "=", TEMPLATE_ID).execute();
    await db.deleteFrom("uvsgamesPlayers").where("id", "in", UVS_IDS).execute();
  });

  it("stamps every staged player's source id in one write", async () => {
    const candidateEventId = await candidates.insertEvent({
      provider: OWN_PROVIDER,
      externalId: "mta-staging-1",
      name: "MTA Staging Field",
      eventDate: "2026-08-01",
      format: FORMAT,
      playerCount: 3,
      organizer: null,
      sourceUrl: null,
      notes: null,
      tier: null,
      country: null,
      location: null,
      metaEventId: null,
    });
    await db
      .insertInto("uvsgamesPlayers")
      .values(UVS_IDS.map((id) => ({ id, displayName: `MTA Staged ${id}` })))
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
    for (const [index, uvsId] of UVS_IDS.entries()) {
      await candidates.insertPlayer({
        candidateEventId,
        externalId: `reg-${uvsId}`,
        playerName: `MTA Staged ${uvsId}`,
        rank: index + 1,
      });
    }

    const stamped = await candidates.setPlayerUvsIds(
      candidateEventId,
      new Map([
        ...UVS_IDS.map((uvsId) => [`reg-${uvsId}`, uvsId] as const),
        // A registration this event never staged stamps nothing.
        ["reg-unknown", 990_399] as const,
      ]),
    );

    expect(stamped).toBe(3);
    const players = await candidates.playersByCandidateEventIds([candidateEventId]);
    expect(players.map((player) => player.uvsgamesPlayerId).toSorted()).toEqual(UVS_IDS);
  });

  it("writes the recomputed classification onto a batch of candidates", async () => {
    const staged = async (externalId: string): Promise<string> =>
      await candidates.insertEvent({
        provider: OWN_PROVIDER,
        externalId,
        name: `MTA ${externalId}`,
        eventDate: "2026-08-01",
        format: FORMAT,
        playerCount: 200,
        organizer: null,
        sourceUrl: null,
        notes: null,
        tier: null,
        country: null,
        location: null,
        metaEventId: null,
      });
    const promoted = await staged("mta-staging-2");
    const cleared = await staged("mta-staging-3");
    await candidates.setClassifications([
      { id: cleared, tier: "casual", country: "DE", location: "Kartenstrasse 1, Berlin" },
    ]);

    await candidates.setClassifications([
      { id: promoted, tier: "premier", country: "FR", location: "Rue Piltover 2, Paris" },
      // Every field travels, so a rule that now derives nothing clears the row.
      { id: cleared, tier: "store", country: null, location: null },
    ]);

    const rows = await db
      .selectFrom("candidateMetaEvents")
      .select(["id", "tier", "country", "location"])
      .where("id", "in", [promoted, cleared])
      .execute();
    expect(rows.find((row) => row.id === promoted)).toMatchObject({
      tier: "premier",
      country: "FR",
      location: "Rue Piltover 2, Paris",
    });
    expect(rows.find((row) => row.id === cleared)).toMatchObject({
      tier: "store",
      country: null,
      location: null,
    });
  });

  it("names cards by id, skipping the ids no card carries", async () => {
    const names = await candidates.cardNamesByIds([legendCardId, crypto.randomUUID()]);

    expect(names.get(legendCardId)).toBe("MTA Legend");
    expect(names.size).toBe(1);
    expect(await candidates.cardNamesByIds([])).toEqual(new Map());
  });

  it("joins the source facts and the live values the reclassify pass compares", async () => {
    await db
      .insertInto("uvsgamesEventTemplates")
      .values({ templateId: TEMPLATE_ID, sourceName: "MTA Series", tier: "competitive" })
      .execute();
    await db
      .insertInto("uvsgamesEvents")
      .values({
        externalId: MIRROR_KEY,
        name: "MTA Classified Event",
        // Clear of the window `uvsgames-events.integration.test.ts` sweeps with
        // `markMissing`, so this row cannot land in that file's counts.
        startAt: new Date("2026-11-05T18:00:00Z"),
        displayStatus: "complete",
        playerCount: 64,
        eventFormat: "Constructed",
        location: "Kartenstrasse 1, 10115, DE",
        timezone: "UTC",
        eventConfigurationTemplate: TEMPLATE_ID,
        contentHash: "mta-cls-hash",
        firstSeenAt: new Date("2026-08-01T00:00:00Z"),
        lastSeenAt: new Date("2026-08-01T00:00:00Z"),
      })
      .execute();
    const eventId = await seedEvent(repo, "mta-cls-live");
    const candidateEventId = await candidates.insertEvent({
      provider: SOURCE_PROVIDER,
      externalId: MIRROR_KEY,
      name: "MTA Classified Event",
      eventDate: "2026-08-01",
      format: FORMAT,
      playerCount: 64,
      organizer: null,
      sourceUrl: null,
      notes: null,
      tier: "store",
      country: null,
      location: null,
      metaEventId: eventId,
      // Keeps the row out of the mirror's awaiting-results count, which another
      // file asserts exactly.
      fetchedAt: new Date("2026-08-02T00:00:00Z"),
    });

    const rows = await candidates.classificationRows({ templateId: TEMPLATE_ID, limit: 50 });

    expect(rows).toEqual([
      {
        candidateEventId,
        name: "MTA Classified Event",
        playerCount: 64,
        tier: "store",
        country: null,
        location: null,
        sourceLocation: "Kartenstrasse 1, 10115, DE",
        templateTier: "competitive",
        metaEventId: eventId,
        liveTier: "store",
        liveCountry: null,
        liveLocation: null,
      },
    ]);
  });
});

describe.skipIf(!ctx)("the archive funnel one source fed", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaRepo(db);
  const candidates = metaCandidatesRepo(db);
  const PROVIDER = "mta-funnel-source";

  afterAll(async () => {
    await db.deleteFrom("candidateMetaEvents").where("provider", "=", PROVIDER).execute();
  });

  it("counts only the events and decks a candidate of that provider links", async () => {
    expect(await repo.archiveOverview(PROVIDER)).toEqual({
      events: 0,
      eventsWithStandings: 0,
      eventsWithDecklists: 0,
      decks: 0,
    });

    const linked = await seedEvent(repo, "mta-provider-linked");
    await seedListedPlayer(repo, linked, { playerName: "MTA Provider One", rank: 1 });
    await seedDecklessPlayer(repo, linked, { playerName: "MTA Provider Two", rank: 2 });
    // Archived, but fed by nobody: the whole-archive overview counts it and the
    // provider-scoped one does not.
    const unlinked = await seedEvent(repo, "mta-provider-unlinked");
    await seedListedPlayer(repo, unlinked, { playerName: "MTA Provider Three", rank: 1 });

    await candidates.insertEvent({
      provider: PROVIDER,
      externalId: "mta-provider-1",
      name: "MTA Provider Linked",
      eventDate: "2026-08-01",
      format: FORMAT,
      playerCount: 2,
      organizer: null,
      sourceUrl: null,
      notes: null,
      tier: null,
      country: null,
      location: null,
      metaEventId: linked,
    });

    expect(await repo.archiveOverview(PROVIDER)).toEqual({
      events: 1,
      eventsWithStandings: 1,
      eventsWithDecklists: 1,
      decks: 1,
    });
  });
});

describe.skipIf(!ctx)("suggested links for an unlinked candidate", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const repo = metaRepo(db);
  const candidates = metaCandidatesRepo(db);
  const PROVIDER = "mta-suggest";

  afterAll(async () => {
    await db.deleteFrom("candidateMetaEvents").where("provider", "=", PROVIDER).execute();
  });

  it("reads only the archive's date window, so an event outside it cannot be offered", async () => {
    const near = await seedEvent(repo, "mta-suggest-near", {
      eventDate: "2026-06-13",
      name: "MTA Summoner Skirmish",
    });
    const far = await seedEvent(repo, "mta-suggest-far", {
      eventDate: "2026-07-25",
      name: "MTA Summoner Skirmish",
    });
    const candidateEventId = await candidates.insertEvent({
      provider: PROVIDER,
      externalId: "mta-suggest-1",
      name: "MTA Summoner Skirmish",
      eventDate: "2026-06-12",
      format: FORMAT,
      playerCount: 32,
      organizer: null,
      sourceUrl: null,
      notes: null,
      tier: null,
      country: null,
      location: null,
      metaEventId: null,
    });

    const suggestions = await suggestMetaEventMatches(
      { meta: repo, metaCandidates: candidates } as unknown as Repos,
      candidateEventId,
    );

    const ids = suggestions.map((suggestion) => suggestion.metaEventId);
    expect(ids).toContain(near);
    expect(ids).not.toContain(far);
  });

  it("offers nothing for a candidate that is already linked", async () => {
    const eventId = await seedEvent(repo, "mta-suggest-linked", { eventDate: "2026-06-13" });
    const candidateEventId = await candidates.insertEvent({
      provider: PROVIDER,
      externalId: "mta-suggest-2",
      name: "MTA Summoner Skirmish",
      eventDate: "2026-06-12",
      format: FORMAT,
      playerCount: 32,
      organizer: null,
      sourceUrl: null,
      notes: null,
      tier: null,
      country: null,
      location: null,
      metaEventId: eventId,
    });

    expect(
      await suggestMetaEventMatches(
        { meta: repo, metaCandidates: candidates } as unknown as Repos,
        candidateEventId,
      ),
    ).toEqual([]);
  });
});
