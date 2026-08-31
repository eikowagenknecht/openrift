import type {
  CardType,
  DeckFormatConfig,
  DeckZone,
  META_EVENT_SORTS,
  MetaCreditVisibility,
  MetaEntryStatus,
  MetaEventTier,
  MetaListStatus,
} from "@openrift/shared/types";
import type {
  ExpressionBuilder,
  Insertable,
  Kysely,
  RawBuilder,
  Selectable,
  SqlBool,
  Updateable,
} from "kysely";
import { sql } from "kysely";

import type {
  Database,
  MetaEventMatchesTable,
  MetaEventPhasesTable,
  MetaEventPlayersTable,
  MetaEventSourcesTable,
  MetaEventsTable,
} from "../db/index.js";

/**
 * The synthetic account that owns every archived deck. It has no `accounts`
 * row, so no credential or OAuth path can produce a session for it — the id is
 * safe to hardcode as the write path's owner.
 */
export const META_ARCHIVE_USER_ID = "meta-archive";

export type MetaEventMatchRow = Selectable<MetaEventMatchesTable>;

export type NewMetaEventMatch = Insertable<MetaEventMatchesTable>;

export type MetaEventPhaseRow = Selectable<MetaEventPhasesTable>;

export type NewMetaEventPhase = Insertable<MetaEventPhasesTable>;

/** One event's recomputed classification, with the fields the pass owns. */
export interface MetaEventClassificationPatch {
  id: string;
  /** Omitted leaves the live value: the column is NOT NULL and a human may own it. */
  tier?: MetaEventTier;
  country?: string | null;
  location?: string | null;
}

/** A written match row, with the source key the caller pairs it back up by. */
export interface UpsertedMetaEventMatch {
  id: string;
  sourceMatchId: string | null;
}

/**
 * `playerRowCount` is the whole standings table; `deckCount` the subset a
 * decklist is known for. They differ for nearly every real event, which is the
 * point of the pyramid.
 */
export type MetaEventWithCounts = Selectable<MetaEventsTable> & {
  playerRowCount: number;
  deckCount: number;
};

/**
 * One player's entry as a public standings table renders it.
 *
 * `legendName` is the canonical `cards.name`; the types and tags travel beside
 * it so a player-facing presenter can compose the champion-led label while the
 * admin table keeps the field it edits.
 */
export interface MetaEventPlayerRow {
  id: string;
  rank: number;
  rankIsTier: boolean;
  playerName: string;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendCardId: string | null;
  legendName: string | null;
  legendSlug: string | null;
  legendTypes: CardType[] | null;
  legendTags: string[] | null;
  legendDomains: string[] | null;
  championCardId: string | null;
  championName: string | null;
  championSlug: string | null;
  championDomains: string[] | null;
  /** Null for a standings-only entry, together with the three fields below. */
  deckId: string | null;
  deckName: string | null;
  shareToken: string | null;
  listStatus: MetaListStatus;
}

/** A standings row carrying the event it belongs to, for a cross-event batch. */
export type MetaEventPlayerWithEventRow = MetaEventPlayerRow & { metaEventId: string };

/** One archived deck as the cross-event browser lists it. */
export interface MetaDeckSummaryRow {
  playerId: string;
  deckId: string;
  shareToken: string;
  listStatus: MetaListStatus;
  deckName: string;
  deckFormat: string;
  legendCardId: string | null;
  legendName: string | null;
  legendSlug: string | null;
  legendTypes: CardType[] | null;
  legendTags: string[] | null;
  championCardId: string | null;
  championName: string | null;
  playerName: string;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
  eventTier: MetaEventTier;
  eventCountry: string | null;
}

/** How many of one card an archived list holds, summed across its zones. */
export interface MetaDeckCardRow {
  deckId: string;
  cardId: string;
  quantity: number;
}

/**
 * One legend the archive holds a result for, with the card fields a display
 * name and a route key are built from.
 */
export interface MetaArchiveLegendRow {
  cardId: string;
  name: string;
  slug: string;
  types: CardType[] | null;
  tags: string[] | null;
  domains: string[] | null;
  deckCount: number;
}

/** One archived standings row as a legend's own page lists it. */
export interface MetaLegendFinishRow {
  playerId: string;
  rank: number;
  rankIsTier: boolean;
  playerName: string;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  shareToken: string | null;
  listStatus: MetaListStatus;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
  eventTier: MetaEventTier;
  eventCountry: string | null;
  eventPlayerCount: number | null;
}

/**
 * The standings context an archived deck's page prints. Also the
 * archive-membership test the public deck endpoint uses — `undefined` means the
 * token belongs to a deck outside the archive, which must 404 rather than
 * render as an archive entry.
 */
export interface MetaDeckContextRow {
  playerId: string;
  listStatus: MetaListStatus;
  playerName: string;
  rank: number;
  rankIsTier: boolean;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  eventSlug: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
  eventTier: MetaEventTier;
  eventCountry: string | null;
}

/** One standings row in the admin's event management table. */
export interface AdminMetaPlayerRow extends MetaEventPlayerRow {
  deckFormat: string | null;
  cardCount: number;
}

/** A live standings row as the review queue compares against it. */
export interface LiveMetaPlayerRow {
  id: string;
  metaEventId: string;
  rank: number;
  rankIsTier: boolean;
  playerName: string;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  legendCardId: string | null;
  championCardId: string | null;
  listStatus: MetaListStatus;
  deckId: string | null;
  deckName: string | null;
  shareToken: string | null;
}

/** Applied to the *event's* fields, not the standings row's. */
export interface MetaCountsFilters {
  format?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * One citation on an event: where a slice of its data came from. Public, and
 * never a contributor — a person is credited through {@link MetaContributorRow}
 * instead.
 */
export type MetaEventSourceRow = Selectable<MetaEventSourcesTable>;

/**
 * `provider` and `externalId` are null together for a hand-entered citation (a
 * VOD, a photo of the standings board); a provider row carries the source's
 * key so promotion and unlinking can find it.
 */
export interface MetaEventSourceInput {
  metaEventId: string;
  provider: string | null;
  externalId: string | null;
  label: string;
  sourceUrl: string | null;
}

/**
 * One contributor as an event page prints them. The name is resolved at read
 * time from the user's profile and their `meta_credit_visibility`, so a rename
 * or an opt-out reaches every past contribution with no sweep across rows.
 */
export interface MetaContributorRow {
  metaEventId: string;
  userId: string;
  /** Never empty: a contributor whose chosen field is blank is dropped instead. */
  displayName: string;
}

export interface MetaEventInput {
  slug: string;
  name: string;
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  notes: string | null;
  /** Omitted means the column default (`store`); the accept paths always classify one. */
  tier?: MetaEventTier;
  country?: string | null;
  location?: string | null;
}

export interface MetaDeckCardInput {
  cardId: string;
  zone: DeckZone;
  quantity: number;
  preferredPrintingId: string | null;
}

/**
 * The decklist attached to a standings row. `listStatus` cannot be `"none"`
 * here: that value means there is no deck, and the table CHECKs the two agree.
 */
export interface MetaArchivedDeckInput {
  name: string;
  format: string;
  formatConfig: DeckFormatConfig | null;
  cards: MetaDeckCardInput[];
  listStatus: Exclude<MetaListStatus, "none">;
}

export interface MetaEventPlayerInput {
  eventId: string;
  rank: number;
  rankIsTier: boolean;
  /**
   * Null only when {@link uvsgamesPlayerId} is set: a row filed from the
   * source is named by the source, and the archive stores no snapshot of it.
   * Both together is an admin's override of the source's name.
   */
  playerName: string | null;
  uvsgamesPlayerId?: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  /** The standings columns behind the rank; every source but the official one omits them. */
  matchPoints?: number | null;
  opponentMatchWinPct?: number | null;
  gameWinPct?: number | null;
  opponentGameWinPct?: number | null;
  entryStatus?: MetaEntryStatus | null;
  legendCardId: string | null;
  championCardId: string | null;
  /** The promotion identity this row is filed under; null for hand-entered rows. */
  sourceIdentity?: string | null;
  /** Null leaves the entry standings-only, which is what most of a field is. */
  deck: MetaArchivedDeckInput | null;
}

/** Scalar columns only — the deck moves through `setPlayerDeck` / `clearPlayerDeck`. */
export interface MetaEventPlayerPatch {
  rank?: number;
  rankIsTier?: boolean;
  playerName?: string | null;
  uvsgamesPlayerId?: number | null;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  matchPoints?: number | null;
  opponentMatchWinPct?: number | null;
  gameWinPct?: number | null;
  opponentGameWinPct?: number | null;
  entryStatus?: MetaEntryStatus | null;
  legendCardId?: string | null;
  championCardId?: string | null;
  sourceIdentity?: string | null;
}

/**
 * Queries for the admin-curated meta archive. `meta_event_players` is the
 * anchor: one row per player per event, with an optional `decks` row (owned by
 * {@link META_ARCHIVE_USER_ID}) hanging off it. This repo owns the event rows,
 * the standings rows, and every join that treats the three as one thing.
 */
/**
 * The player's name as every read serves it: the row's own column when the
 * archive holds one, otherwise the source's current display name. Writing the
 * local column is the admin's override, and clearing it hands the player back to
 * the source's renames.
 *
 * Requires `uvsgames_players` left-joined as `up`.
 */
const resolvedPlayerName = sql<string>`coalesce(p.player_name, up.display_name)`;

/** How one page of the live event list is filtered. */
export interface MetaEventFilters {
  /** Matched against the event name and the organizer. */
  search?: string;
  format?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Keeps only events holding fewer standings rows than the reported field. */
  incompleteStandings?: boolean;
  /** Keeps only events where no standings row carries a decklist. */
  noDecks?: boolean;
}

/** How one page of the live event list is ordered. Defaults to newest first. */
export interface MetaEventOrder {
  sort?: (typeof META_EVENT_SORTS)[number];
  direction?: "asc" | "desc";
}

const EVENT_ORDER_COLUMNS: Record<(typeof META_EVENT_SORTS)[number], RawBuilder<unknown>> = {
  eventDate: sql`meta_events.event_date`,
  name: sql`meta_events.name`,
  format: sql`meta_events.format`,
  organizer: sql`meta_events.organizer`,
  playerRowCount: sql`c.player_row_count`,
  deckCount: sql`c.deck_count`,
};

/**
 * Nulls sort last whichever way the column runs: an event with no organizer is
 * not the answer to "who ran the earliest event", in either direction.
 */
function eventOrderBy(order: MetaEventOrder) {
  const column = EVENT_ORDER_COLUMNS[order.sort ?? "eventDate"];
  return order.direction === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
}

/**
 * The archive holds fewer standings rows than the source said played. An event
 * whose field size was never reported cannot be short of it, so it is left out
 * rather than counted as complete.
 */
const standingsShort = sql<boolean>`meta_events.player_count is not null
  and c.player_row_count < meta_events.player_count`;

const noDecks = sql<boolean>`c.deck_count = 0`;

export function metaRepo(db: Kysely<Database>) {
  /**
   * The roster and deck counts, joined once per event rather than as two
   * correlated subqueries. Lateral so the counts are also filterable and
   * sortable: the list works down the events whose standings or decklists are
   * still short, and neither is a column on `meta_events`.
   *
   * The lateral body is an ungrouped aggregate, so it yields one row of zeroes
   * for an event with no standings rather than no row: every reader of
   * `c.player_row_count` / `c.deck_count` can take them as non-null.
   */
  function eventQuery() {
    return db
      .selectFrom("metaEvents")
      .leftJoinLateral(
        (eb) =>
          eb
            .selectFrom("metaEventPlayers as p")
            .whereRef("p.metaEventId", "=", "metaEvents.id")
            .select([
              eb.cast<number>(eb.fn.countAll(), "integer").as("playerRowCount"),
              sql<number>`count(*) filter (where p.deck_id is not null)::int`.as("deckCount"),
            ])
            .as("c"),
        (join) => join.onTrue(),
      )
      .selectAll("metaEvents")
      .select([
        sql<number>`c.player_row_count`.as("playerRowCount"),
        sql<number>`c.deck_count`.as("deckCount"),
      ]);
  }

  /**
   * The legend and champion are columns on the standings row, not zones of a
   * deck: the archive knows which legend a player played for nearly every entry,
   * and only a fraction of those entries ever gain a decklist.
   */
  function playerQuery() {
    return (
      db
        .selectFrom("metaEventPlayers as p")
        .leftJoin("cards as lc", "lc.id", "p.legendCardId")
        .leftJoin("cards as cc", "cc.id", "p.championCardId")
        // Left, like every other join onto the view: it is refreshed on demand,
        // and an inner join would drop a fresh Legend's standings row entirely
        // rather than just naming it without its champion.
        .leftJoin("mvCardAggregates as lmca", "lmca.cardId", "p.legendCardId")
        .leftJoin("mvCardAggregates as cmca", "cmca.cardId", "p.championCardId")
        .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
        .leftJoin("decks as d", "d.id", "p.deckId")
        .select([
          "p.id",
          "p.rank",
          "p.rankIsTier",
          resolvedPlayerName.as("playerName"),
          "p.wins",
          "p.losses",
          "p.draws",
          "p.legendCardId",
          "lc.name as legendName",
          "lc.slug as legendSlug",
          "lmca.types as legendTypes",
          "lc.tags as legendTags",
          "lmca.domains as legendDomains",
          "p.championCardId",
          "cc.name as championName",
          "cc.slug as championSlug",
          "cmca.domains as championDomains",
          "p.deckId",
          "d.name as deckName",
          "d.shareToken",
          "p.listStatus",
        ])
    );
  }

  /** The standings rows a count reads, narrowed by the event's own fields. */
  function playersInScope(filters: MetaCountsFilters) {
    let query = db
      .selectFrom("metaEventPlayers as p")
      .innerJoin("metaEvents as me", "me.id", "p.metaEventId");
    if (filters.format !== undefined) {
      query = query.where("me.format", "=", filters.format);
    }
    if (filters.dateFrom !== undefined) {
      query = query.where("me.eventDate", ">=", filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      query = query.where("me.eventDate", "<=", filters.dateTo);
    }
    return query;
  }

  /**
   * The display string is resolved in SQL so the filter and the ordering agree
   * with it: a contributor on `riot_id` falls back to their display name, a
   * blank result drops the row rather than printing part of a user id, and the
   * `DISTINCT` collapses the several entries one person contributed into one
   * name per event.
   */
  function contributorQuery() {
    const displayName = sql<string>`nullif(btrim(case
      when u.meta_credit_visibility = 'riot_id' then coalesce(nullif(btrim(u.riot_id), ''), u.name)
      else u.name
    end), '')`;
    return db
      .selectFrom("metaCredits as mc")
      .innerJoin("users as u", "u.id", "mc.userId")
      .select(["mc.metaEventId", "mc.userId"])
      .select(displayName.as("displayName"))
      .distinct()
      .where("u.metaCreditVisibility", "!=", "hidden")
      .where(sql<SqlBool>`${displayName} is not null`)
      .orderBy("displayName", "asc")
      .orderBy("mc.userId", "asc");
  }

  /** Writes the `decks` row and its cards, and points the standings row at it. */
  async function insertDeckForPlayer(
    trx: Kysely<Database>,
    playerId: string,
    deck: MetaArchivedDeckInput,
    shareToken: string | null,
  ): Promise<string> {
    const row = await trx
      .insertInto("decks")
      .values({
        userId: META_ARCHIVE_USER_ID,
        name: deck.name,
        description: null,
        format: deck.format,
        formatConfig: deck.formatConfig,
        // The permalink is the point of an archived deck; it is public from the
        // moment it exists, never through a later share toggle.
        isPublic: true,
        shareToken,
        links: [],
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    await trx
      .insertInto("deckCards")
      .values(deck.cards.map((card) => ({ deckId: row.id, ...card })))
      .execute();

    await trx
      .updateTable("metaEventPlayers")
      .set({ deckId: row.id, listStatus: deck.listStatus })
      .where("id", "=", playerId)
      .execute();

    return row.id;
  }

  function deckCardKey(card: {
    cardId: string;
    zone: string;
    quantity: number;
    preferredPrintingId: string | null;
  }): string {
    return `${card.cardId} ${card.zone} ${card.quantity} ${card.preferredPrintingId ?? ""}`;
  }

  function sameDeckCards(
    existing: readonly {
      cardId: string;
      zone: string;
      quantity: number;
      preferredPrintingId: string | null;
    }[],
    incoming: readonly MetaDeckCardInput[],
  ): boolean {
    if (existing.length !== incoming.length) {
      return false;
    }
    const held = new Map<string, number>();
    for (const card of existing) {
      const key = deckCardKey(card);
      held.set(key, (held.get(key) ?? 0) + 1);
    }
    for (const card of incoming) {
      const key = deckCardKey(card);
      const left = held.get(key) ?? 0;
      if (left === 0) {
        return false;
      }
      held.set(key, left - 1);
    }
    return true;
  }

  return {
    /**
     * Every archived event, unpaged. The public `/meta` list is the only caller
     * that legitimately wants the whole archive in one payload; anything admin
     * pages or narrows by date goes through {@link listEvents} instead.
     */
    allEvents(): Promise<MetaEventWithCounts[]> {
      return eventQuery().orderBy("eventDate", "desc").orderBy("name", "asc").execute();
    },

    async listEvents(
      filters: MetaEventFilters,
      page: { limit: number; offset: number },
      order: MetaEventOrder = {},
    ): Promise<{ rows: MetaEventWithCounts[]; total: number }> {
      let rowQuery = eventQuery()
        .orderBy(eventOrderBy(order))
        // Whole days collide constantly on the date column, so the slug breaks
        // ties and keeps a page boundary from repeating or skipping a row.
        .orderBy("metaEvents.slug", "asc")
        .limit(page.limit)
        .offset(page.offset);
      let countQuery = eventQuery()
        .clearSelect()
        .select((eb) => eb.fn.countAll<string>().as("total"));

      if (filters.search !== undefined && filters.search.trim() !== "") {
        const pattern = `%${filters.search.trim()}%`;
        const matches = (eb: ExpressionBuilder<Database, "metaEvents">) =>
          eb.or([
            eb("metaEvents.name", "ilike", pattern),
            eb("metaEvents.organizer", "ilike", pattern),
          ]);
        rowQuery = rowQuery.where(matches);
        countQuery = countQuery.where(matches);
      }
      if (filters.format !== undefined) {
        rowQuery = rowQuery.where("metaEvents.format", "=", filters.format);
        countQuery = countQuery.where("metaEvents.format", "=", filters.format);
      }
      if (filters.dateFrom !== undefined) {
        rowQuery = rowQuery.where("metaEvents.eventDate", ">=", filters.dateFrom);
        countQuery = countQuery.where("metaEvents.eventDate", ">=", filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        rowQuery = rowQuery.where("metaEvents.eventDate", "<=", filters.dateTo);
        countQuery = countQuery.where("metaEvents.eventDate", "<=", filters.dateTo);
      }
      if (filters.incompleteStandings === true) {
        rowQuery = rowQuery.where(standingsShort);
        countQuery = countQuery.where(standingsShort);
      }
      if (filters.noDecks === true) {
        rowQuery = rowQuery.where(noDecks);
        countQuery = countQuery.where(noDecks);
      }

      const [rows, countRow] = await Promise.all([
        rowQuery.execute(),
        countQuery.executeTakeFirstOrThrow(),
      ]);
      return { rows, total: Number(countRow.total) };
    },

    eventBySlug(slug: string): Promise<MetaEventWithCounts | undefined> {
      return eventQuery().where("slug", "=", slug).executeTakeFirst();
    },

    eventById(id: string): Promise<MetaEventWithCounts | undefined> {
      return eventQuery().where("id", "=", id).executeTakeFirst();
    },

    /**
     * Every rank-1 standings row of the named events.
     *
     * A source that published two first places gets both rows, in a stable
     * alphabetical order: which of a tie is "the" winner is not the archive's
     * call to make, and picking one would print a fact nobody published.
     */
    winnersForEvents(eventIds: readonly string[]): Promise<MetaEventPlayerWithEventRow[]> {
      if (eventIds.length === 0) {
        return Promise.resolve([]);
      }
      return playerQuery()
        .select("p.metaEventId")
        .where("p.metaEventId", "in", [...eventIds])
        .where("p.rank", "=", 1)
        .orderBy("p.metaEventId")
        .orderBy(resolvedPlayerName, "asc")
        .execute();
    },

    /** The whole field, deckless entries included, best finish first. */
    standingsForEvent(eventId: string): Promise<MetaEventPlayerRow[]> {
      return playerQuery()
        .where("p.metaEventId", "=", eventId)
        .orderBy("p.rank", "asc")
        .orderBy(resolvedPlayerName, "asc")
        .execute();
    },

    playerById(id: string): Promise<MetaEventPlayerRow | undefined> {
      return playerQuery().where("p.id", "=", id).executeTakeFirst();
    },

    /** Which event a standings row sits under, for a caller holding only its id. */
    async eventIdForPlayer(playerId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("metaEventPlayers")
        .select("metaEventId")
        .where("id", "=", playerId)
        .executeTakeFirst();
      return row?.metaEventId;
    },

    /**
     * The standings rows as stored, without the display resolution
     * {@link standingsForEvent} applies.
     *
     * Promotion needs the raw columns: `playerName` NULL where the source names
     * the player, and the source key it reconciles identity on. The read query
     * coalesces both away, which is right for rendering and wrong for deciding
     * whether a row already exists.
     */
    rawStandingsForEvent(eventId: string): Promise<Selectable<MetaEventPlayersTable>[]> {
      return db
        .selectFrom("metaEventPlayers")
        .selectAll()
        .where("metaEventId", "=", eventId)
        .orderBy("rank", "asc")
        .execute();
    },

    /**
     * Each standings row's rendered name beside its rank, for matching an
     * event-anchored overlay onto the row it describes. The name resolution is
     * the same one every read surface uses, so an overlay matches what the
     * submitter actually saw.
     */
    async standingsNamesForEvent(
      eventId: string,
    ): Promise<{ id: string; name: string; rank: number }[]> {
      return await db
        .selectFrom("metaEventPlayers as p")
        .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
        .select(["p.id", "p.rank"])
        .select(resolvedPlayerName.as("name"))
        .where("p.metaEventId", "=", eventId)
        .execute();
    },

    /** A batch of full event rows, for list surfaces that would otherwise loop {@link eventById}. */
    async eventsByIds(ids: readonly string[]): Promise<MetaEventWithCounts[]> {
      if (ids.length === 0) {
        return [];
      }
      return await eventQuery()
        .where("metaEvents.id", "in", [...ids])
        .execute();
    },

    /** The event's phase structure in play order; empty when no source published it. */
    phasesForEvent(eventId: string): Promise<MetaEventPhaseRow[]> {
      return db
        .selectFrom("metaEventPhases")
        .selectAll()
        .where("metaEventId", "=", eventId)
        .orderBy("phaseOrder", "asc")
        .execute();
    },

    /**
     * Replaces one event's phases. The source republishes the whole list on
     * every fetch and nothing references a phase row, so a wholesale replace is
     * both correct and cheaper than reconciling three rows.
     */
    async replaceEventPhases(eventId: string, rows: NewMetaEventPhase[]): Promise<void> {
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("metaEventPhases").where("metaEventId", "=", eventId).execute();
        if (rows.length > 0) {
          await trx.insertInto("metaEventPhases").values(rows).execute();
        }
      });
    },

    /** Round-by-round results in play order; empty when no source carried them. */
    matchesForEvent(eventId: string): Promise<MetaEventMatchRow[]> {
      return db
        .selectFrom("metaEventMatches")
        .selectAll()
        .where("metaEventId", "=", eventId)
        .orderBy("phaseOrder", "asc")
        .orderBy("roundNumber", "asc")
        .orderBy("tableNumber", "asc")
        .orderBy("id", "asc")
        .execute();
    },

    /**
     * Writes materialized matches, converging on the source's own match id so a
     * replayed materialization refreshes facts instead of failing, and so a
     * re-paired round moves its rows rather than duplicating them.
     *
     * @returns Each written row's live id beside its source id. Postgres returns
     * `ON CONFLICT` rows in whatever order it wrote them, so the caller pairs
     * them up by key rather than by position.
     */
    async upsertEventMatches(rows: NewMetaEventMatch[]): Promise<UpsertedMetaEventMatch[]> {
      if (rows.length === 0) {
        return [];
      }
      return await db
        .insertInto("metaEventMatches")
        .values(rows)
        .onConflict((oc) =>
          // The source key, as a partial index, so the conflict target names
          // its predicate. Every row this path writes carries a source id;
          // the seat index covers only the rows that do not.
          oc
            .columns(["metaEventId", "sourceMatchId"])
            .where("sourceMatchId", "is not", null)
            .doUpdateSet((eb) => ({
              phaseOrder: eb.ref("excluded.phaseOrder"),
              roundNumber: eb.ref("excluded.roundNumber"),
              sourceRoundId: eb.ref("excluded.sourceRoundId"),
              tableNumber: eb.ref("excluded.tableNumber"),
              isBye: eb.ref("excluded.isBye"),
              isDraw: eb.ref("excluded.isDraw"),
              player1Id: eb.ref("excluded.player1Id"),
              player2Id: eb.ref("excluded.player2Id"),
              winnerId: eb.ref("excluded.winnerId"),
              gamesWonP1: eb.ref("excluded.gamesWonP1"),
              gamesWonP2: eb.ref("excluded.gamesWonP2"),
            })),
        )
        .returning(["id", "sourceMatchId"])
        .execute();
    },

    /**
     * Unpaginated and unfiltered by design: the archive is curated and small,
     * and the deck browser filters client-side. Only rows with a list appear —
     * a standings-only entry has no deck to browse.
     */
    allDeckSummaries(): Promise<MetaDeckSummaryRow[]> {
      return (
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("decks as d", "d.id", "p.deckId")
          .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
          .leftJoin("cards as lc", "lc.id", "p.legendCardId")
          .leftJoin("cards as cc", "cc.id", "p.championCardId")
          .leftJoin("mvCardAggregates as lmca", "lmca.cardId", "p.legendCardId")
          .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
          .select([
            "p.id as playerId",
            "p.deckId",
            "d.shareToken",
            "p.listStatus",
            "d.name as deckName",
            "d.format as deckFormat",
            "p.legendCardId",
            "lc.name as legendName",
            "lc.slug as legendSlug",
            "lmca.types as legendTypes",
            "lc.tags as legendTags",
            "p.championCardId",
            "cc.name as championName",
            resolvedPlayerName.as("playerName"),
            "p.rank",
            "p.rankIsTier",
            "p.wins",
            "p.losses",
            "p.draws",
            "me.slug as eventSlug",
            "me.name as eventName",
            "me.eventDate",
            "me.format as eventFormat",
            "me.tier as eventTier",
            "me.country as eventCountry",
          ])
          // A deck is minted with its permalink, so this only ever narrows the
          // type; a token cleared by hand would leave a row with no page anyway.
          .where("d.shareToken", "is not", null)
          .$narrowType<{ deckId: string; shareToken: string }>()
          .orderBy("me.eventDate", "desc")
          .orderBy("p.rank", "asc")
          .orderBy(resolvedPlayerName, "asc")
          .execute()
      );
    },

    /**
     * Every legend the archive holds a standings row for, with the count of
     * lists filed under it.
     *
     * Grouped by the card rather than the champion: two legends of one champion
     * are two entries, which is what the route key keeps apart.
     */
    archiveLegends(): Promise<MetaArchiveLegendRow[]> {
      return db
        .selectFrom("metaEventPlayers as p")
        .innerJoin("cards as lc", "lc.id", "p.legendCardId")
        .leftJoin("mvCardAggregates as mca", "mca.cardId", "lc.id")
        .leftJoin("decks as d", "d.id", "p.deckId")
        .select([
          "lc.id as cardId",
          "lc.name",
          "lc.slug",
          "mca.types",
          "lc.tags",
          "mca.domains",
          // Mirrors what `allDeckSummaries` yields for this legend: a row with
          // no permalink has no page for the count to promise.
          sql<number>`count(*) filter (where d.share_token is not null)::int`.as("deckCount"),
        ])
        .groupBy(["lc.id", "lc.name", "lc.slug", "mca.types", "lc.tags", "mca.domains"])
        .orderBy("lc.name", "asc")
        .execute();
    },

    /**
     * One legend's whole record, best finish first and newest of an equal finish
     * ahead of older ones.
     *
     * Every row is a published standings row. The archive computes nothing from
     * them here beyond their order.
     */
    finishesForLegend(legendCardId: string): Promise<MetaLegendFinishRow[]> {
      return db
        .selectFrom("metaEventPlayers as p")
        .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
        .leftJoin("decks as d", "d.id", "p.deckId")
        .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
        .select([
          "p.id as playerId",
          "p.rank",
          "p.rankIsTier",
          resolvedPlayerName.as("playerName"),
          "p.wins",
          "p.losses",
          "p.draws",
          "d.shareToken",
          "p.listStatus",
          "me.slug as eventSlug",
          "me.name as eventName",
          "me.eventDate",
          "me.format as eventFormat",
          "me.tier as eventTier",
          "me.country as eventCountry",
          "me.playerCount as eventPlayerCount",
        ])
        .where("p.legendCardId", "=", legendCardId)
        .orderBy("p.rank", "asc")
        .orderBy("me.eventDate", "desc")
        .orderBy(resolvedPlayerName, "asc")
        .execute();
    },

    /**
     * What every archived list holds, for the browser's collection overlay.
     * Unpaginated like {@link allDeckSummaries} and for the same reason.
     *
     * Zones are summed away: the overlay asks whether the reader owns the card,
     * and a copy sitting in the rune deck rather than the main deck is still a
     * copy they need.
     */
    async allDeckCards(): Promise<MetaDeckCardRow[]> {
      const rows = await db
        .selectFrom("deckCards as dc")
        .select(({ fn }) => [
          "dc.deckId",
          "dc.cardId",
          fn.sum<string>("dc.quantity").as("quantity"),
        ])
        // An `exists` rather than a join, so the quantities stay the deck's own
        // however many standings rows reference it. `uq_meta_event_players_deck`
        // caps that at one today, and a join would silently double every
        // quantity the day it does not.
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("metaEventPlayers as p")
              .select(sql.lit(1).as("x"))
              .whereRef("p.deckId", "=", "dc.deckId"),
          ),
        )
        .groupBy(["dc.deckId", "dc.cardId"])
        .orderBy("dc.deckId")
        .execute();
      return rows.map((row) => ({
        deckId: row.deckId,
        cardId: row.cardId,
        quantity: Number(row.quantity),
      }));
    },

    /**
     * Guard for the share-token rotate path: an archived deck's token is its
     * permalink, so rotation must be refused while a standings row points at it.
     */
    async isMetaDeck(deckId: string): Promise<boolean> {
      const row = await db
        .selectFrom("metaEventPlayers")
        .select("id")
        .where("deckId", "=", deckId)
        .executeTakeFirst();
      return row !== undefined;
    },

    contextForDeck(deckId: string): Promise<MetaDeckContextRow | undefined> {
      return db
        .selectFrom("metaEventPlayers as p")
        .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
        .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
        .select([
          "p.id as playerId",
          "p.listStatus",
          resolvedPlayerName.as("playerName"),
          "p.rank",
          "p.rankIsTier",
          "p.wins",
          "p.losses",
          "p.draws",
          "me.slug as eventSlug",
          "me.name as eventName",
          "me.eventDate",
          "me.format as eventFormat",
          "me.tier as eventTier",
          "me.country as eventCountry",
        ])
        .where("p.deckId", "=", deckId)
        .executeTakeFirst();
    },

    /**
     * The archive's side of the sync funnel: how many events it holds, how many
     * of those have standings at all, how many carry at least one decklist, and
     * how many decks that adds up to.
     */
    async archiveOverview(provider?: string): Promise<{
      events: number;
      eventsWithStandings: number;
      eventsWithDecklists: number;
      decks: number;
    }> {
      // When a provider is given, count only events that provider's citation
      // links, so the per-source funnel's "Published" is the archive this source
      // fed. The decks count follows the same restriction.
      let base = db.selectFrom("metaEvents as e");
      if (provider !== undefined) {
        base = base.where((eb) =>
          eb.exists(
            eb
              .selectFrom("metaEventSources as src")
              .whereRef("src.metaEventId", "=", "e.id")
              .where("src.provider", "=", provider),
          ),
        );
      }
      const row = await base
        .select((eb) => [
          eb.fn.countAll<string>().as("events"),
          sql<string>`count(*) filter (where exists (
            select 1 from meta_event_players p where p.meta_event_id = e.id
          ))`.as("eventsWithStandings"),
          sql<string>`count(*) filter (where exists (
            select 1 from meta_event_players p
            where p.meta_event_id = e.id and p.deck_id is not null
          ))`.as("eventsWithDecklists"),
          // A deck belongs to this slice when its event is in the filtered set.
          // The correlated exists keeps the provider restriction on the count.
          provider === undefined
            ? sql<string>`(select count(*) from meta_event_players p where p.deck_id is not null)`.as(
                "decks",
              )
            : sql<string>`(
                select count(*) from meta_event_players p
                where p.deck_id is not null and exists (
                  select 1 from meta_event_sources src
                  where src.meta_event_id = p.meta_event_id and src.provider = ${provider}
                )
              )`.as("decks"),
        ])
        .executeTakeFirstOrThrow();
      return {
        events: Number(row.events),
        eventsWithStandings: Number(row.eventsWithStandings),
        eventsWithDecklists: Number(row.eventsWithDecklists),
        decks: Number(row.decks),
      };
    },

    /** Every standings row in scope. */
    async playerCountInScope(filters: MetaCountsFilters): Promise<number> {
      const row = await playersInScope(filters)
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    /**
     * Rows whose main deck the archive holds. `partial` counts exactly like
     * `full` — a partial list's main deck is complete by definition.
     */
    async deckCountInScope(filters: MetaCountsFilters): Promise<number> {
      const row = await playersInScope(filters)
        .where("p.listStatus", "!=", "none")
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    adminPlayersForEvent(eventId: string): Promise<AdminMetaPlayerRow[]> {
      return playerQuery()
        .select((eb) => [
          "d.format as deckFormat",
          eb
            .selectFrom("deckCards as dc")
            .select((inner) =>
              inner.cast<number>(inner.fn.sum("dc.quantity"), "integer").as("cardCount"),
            )
            .whereRef("dc.deckId", "=", "p.deckId")
            .as("cardCount"),
        ])
        .where("p.metaEventId", "=", eventId)
        .orderBy("p.rank", "asc")
        .orderBy(resolvedPlayerName, "asc")
        .execute()
        .then((rows) => rows.map((row) => ({ ...row, cardCount: row.cardCount ?? 0 })));
    },

    /** The live rows a candidate pipeline diffs against, by standings-row id. */
    livePlayersByIds(ids: string[]): Promise<LiveMetaPlayerRow[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return (
        db
          .selectFrom("metaEventPlayers as p")
          .leftJoin("decks as d", "d.id", "p.deckId")
          // Resolved, so a diff against a candidate's own name does not report a
          // change on every pass for a row filed under the source's identity.
          .leftJoin("uvsgamesPlayers as up", "up.id", "p.uvsgamesPlayerId")
          .select([
            "p.id",
            "p.metaEventId",
            "p.rank",
            "p.rankIsTier",
            resolvedPlayerName.as("playerName"),
            "p.wins",
            "p.losses",
            "p.draws",
            "p.legendCardId",
            "p.championCardId",
            "p.listStatus",
            "p.deckId",
            "d.name as deckName",
            "d.shareToken",
          ])
          .where("p.id", "in", ids)
          .execute()
      );
    },

    async createEvent(input: MetaEventInput): Promise<MetaEventWithCounts> {
      const row = await db
        .insertInto("metaEvents")
        .values(input)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { ...row, playerRowCount: 0, deckCount: 0 };
    },

    /**
     * Writes the reclassify pass's per-field decisions in one statement. A field
     * the pass left alone is not in the patch and must keep its live value, so
     * each column reads its own flag out of the VALUES list rather than being
     * overwritten with a null.
     *
     * @returns How many rows the statement touched.
     */
    async setEventClassifications(rows: readonly MetaEventClassificationPatch[]): Promise<number> {
      if (rows.length === 0) {
        return 0;
      }
      const values = sql.join(
        rows.map(
          (row) => sql`(
            ${row.id}::uuid,
            ${row.tier ?? null}::text,
            ${row.country !== undefined}::boolean,
            ${row.country ?? null}::text,
            ${row.location !== undefined}::boolean,
            ${row.location ?? null}::text
          )`,
        ),
      );
      const result = await sql`
        update meta_events as m
           set tier = coalesce(v.tier, m.tier),
               country = case when v.set_country then v.country else m.country end,
               location = case when v.set_location then v.location else m.location end
          from (values ${values})
            as v(id, tier, set_country, country, set_location, location)
         where m.id = v.id
      `.execute(db);
      return Number(result.numAffectedRows ?? 0n);
    },

    /** The caller has already narrowed the body to real columns via `buildPatchUpdates`. */
    async updateEvent(id: string, updates: Updateable<MetaEventsTable>): Promise<boolean> {
      const result = await db
        .updateTable("metaEvents")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /**
     * Deleting the event cascades its standings rows, which is what releases
     * the RESTRICT on their decks; the decks themselves are then removed
     * explicitly, or they would survive under the synthetic owner with nothing
     * pointing at them.
     */
    deleteEvent(id: string): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        const deckRows = await trx
          .selectFrom("metaEventPlayers")
          .select("deckId")
          .where("metaEventId", "=", id)
          .where("deckId", "is not", null)
          .$narrowType<{ deckId: string }>()
          .execute();

        const result = await trx.deleteFrom("metaEvents").where("id", "=", id).executeTakeFirst();
        if ((result.numDeletedRows ?? 0n) === 0n) {
          return false;
        }

        if (deckRows.length > 0) {
          await trx
            .deleteFrom("decks")
            .where(
              "id",
              "in",
              deckRows.map((row) => row.deckId),
            )
            .execute();
        }
        return true;
      });
    },

    /**
     * `shareToken` is supplied by the caller (wrapped in `withUniqueShareToken`)
     * because the retry has to re-run the whole transaction, not just the
     * insert that collided. It is null exactly when `input.deck` is, since a
     * standings-only entry has no page to address.
     */
    createPlayer(
      input: MetaEventPlayerInput,
      shareToken: string | null,
    ): Promise<{ metaEventPlayerId: string; deckId: string | null } | undefined> {
      return db.transaction().execute(async (trx) => {
        const event = await trx
          .selectFrom("metaEvents")
          .select("id")
          .where("id", "=", input.eventId)
          .executeTakeFirst();
        if (!event) {
          return;
        }

        const player = await trx
          .insertInto("metaEventPlayers")
          .values({
            metaEventId: input.eventId,
            rank: input.rank,
            rankIsTier: input.rankIsTier,
            playerName: input.playerName,
            uvsgamesPlayerId: input.uvsgamesPlayerId ?? null,
            wins: input.wins,
            losses: input.losses,
            draws: input.draws,
            matchPoints: input.matchPoints ?? null,
            opponentMatchWinPct: input.opponentMatchWinPct ?? null,
            gameWinPct: input.gameWinPct ?? null,
            opponentGameWinPct: input.opponentGameWinPct ?? null,
            entryStatus: input.entryStatus ?? null,
            legendCardId: input.legendCardId,
            championCardId: input.championCardId,
            sourceIdentity: input.sourceIdentity ?? null,
          })
          .returning("id")
          .executeTakeFirstOrThrow();

        const deckId =
          input.deck === null
            ? null
            : await insertDeckForPlayer(trx, player.id, input.deck, shareToken);

        return { metaEventPlayerId: player.id, deckId };
      });
    },

    async updatePlayer(id: string, patch: MetaEventPlayerPatch): Promise<boolean> {
      const updates: Updateable<MetaEventPlayersTable> = {};
      if (patch.rank !== undefined) {
        updates.rank = patch.rank;
      }
      if (patch.rankIsTier !== undefined) {
        updates.rankIsTier = patch.rankIsTier;
      }
      if (patch.uvsgamesPlayerId !== undefined) {
        updates.uvsgamesPlayerId = patch.uvsgamesPlayerId;
      }
      if (patch.playerName !== undefined) {
        updates.playerName = patch.playerName;
      }
      if (patch.wins !== undefined) {
        updates.wins = patch.wins;
      }
      if (patch.losses !== undefined) {
        updates.losses = patch.losses;
      }
      if (patch.draws !== undefined) {
        updates.draws = patch.draws;
      }
      if (patch.matchPoints !== undefined) {
        updates.matchPoints = patch.matchPoints;
      }
      if (patch.opponentMatchWinPct !== undefined) {
        updates.opponentMatchWinPct = patch.opponentMatchWinPct;
      }
      if (patch.gameWinPct !== undefined) {
        updates.gameWinPct = patch.gameWinPct;
      }
      if (patch.opponentGameWinPct !== undefined) {
        updates.opponentGameWinPct = patch.opponentGameWinPct;
      }
      if (patch.entryStatus !== undefined) {
        updates.entryStatus = patch.entryStatus;
      }
      if (patch.legendCardId !== undefined) {
        updates.legendCardId = patch.legendCardId;
      }
      if (patch.championCardId !== undefined) {
        updates.championCardId = patch.championCardId;
      }
      if (patch.sourceIdentity !== undefined) {
        updates.sourceIdentity = patch.sourceIdentity;
      }

      if (Object.keys(updates).length === 0) {
        const row = await db
          .selectFrom("metaEventPlayers")
          .select("id")
          .where("id", "=", id)
          .executeTakeFirst();
        return row !== undefined;
      }

      const result = await db
        .updateTable("metaEventPlayers")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /**
     * Attaches a list, or replaces the one already there. The permalink is
     * minted with the deck and never rotated afterwards, so `shareToken` is
     * only written when the deck is created — a replacement keeps the token the
     * published links already use.
     *
     * `preserveName` keeps the existing deck's name (a maintainer rename must
     * survive a re-promote); the input name is still used when the deck is
     * created. An unchanged card list is left alone rather than deleted and
     * reinserted, so a re-promote of an unmoved list writes nothing.
     */
    setPlayerDeck(
      playerId: string,
      deck: MetaArchivedDeckInput,
      shareToken: string,
      options?: { preserveName?: boolean },
    ): Promise<{ deckId: string } | undefined> {
      return db.transaction().execute(async (trx) => {
        const player = await trx
          .selectFrom("metaEventPlayers")
          .select(["deckId", "listStatus"])
          .where("id", "=", playerId)
          .executeTakeFirst();
        if (!player) {
          return;
        }

        if (player.deckId === null) {
          const deckId = await insertDeckForPlayer(trx, playerId, deck, shareToken);
          return { deckId };
        }

        const current = await trx
          .selectFrom("decks")
          .select(["name", "format", "formatConfig"])
          .where("id", "=", player.deckId)
          .executeTakeFirst();
        const name = options?.preserveName === true ? (current?.name ?? deck.name) : deck.name;
        if (current === undefined || current.name !== name || current.format !== deck.format) {
          await trx
            .updateTable("decks")
            .set({
              name,
              format: deck.format,
              formatConfig: deck.formatConfig,
              updatedAt: sql`now()`,
            })
            .where("id", "=", player.deckId)
            .execute();
        }

        const existing = await trx
          .selectFrom("deckCards")
          .select(["cardId", "zone", "quantity", "preferredPrintingId"])
          .where("deckId", "=", player.deckId)
          .execute();
        if (!sameDeckCards(existing, deck.cards)) {
          await trx.deleteFrom("deckCards").where("deckId", "=", player.deckId).execute();
          await trx
            .insertInto("deckCards")
            .values(deck.cards.map((card) => ({ deckId: player.deckId as string, ...card })))
            .execute();
        }
        if (player.listStatus !== deck.listStatus) {
          await trx
            .updateTable("metaEventPlayers")
            .set({ listStatus: deck.listStatus })
            .where("id", "=", playerId)
            .execute();
        }

        return { deckId: player.deckId };
      });
    },

    /**
     * Renames a standings row's archived deck. Durable by construction:
     * promotion preserves an existing deck's name, so a rename is curation of
     * the derived artifact rather than a fight with the sources.
     */
    async renamePlayerDeck(playerId: string, name: string): Promise<boolean> {
      const player = await db
        .selectFrom("metaEventPlayers")
        .select("deckId")
        .where("id", "=", playerId)
        .executeTakeFirst();
      if (!player || player.deckId === null) {
        return false;
      }
      await db
        .updateTable("decks")
        .set({ name, updatedAt: sql`now()` })
        .where("id", "=", player.deckId)
        .execute();
      return true;
    },

    /**
     * Detaches and deletes a standings row's list. The reference is cleared
     * first because `meta_event_players.deck_id` is ON DELETE RESTRICT: a
     * standings row must never disappear because someone removed a decklist.
     */
    clearPlayerDeck(playerId: string): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        const player = await trx
          .selectFrom("metaEventPlayers")
          .select("deckId")
          .where("id", "=", playerId)
          .executeTakeFirst();
        if (!player) {
          return false;
        }
        if (player.deckId === null) {
          return true;
        }
        await trx
          .updateTable("metaEventPlayers")
          .set({ deckId: null, listStatus: "none" })
          .where("id", "=", playerId)
          .execute();
        await trx.deleteFrom("decks").where("id", "=", player.deckId).execute();
        return true;
      });
    },

    deletePlayer(playerId: string): Promise<boolean> {
      return db.transaction().execute(async (trx) => {
        const player = await trx
          .selectFrom("metaEventPlayers")
          .select("deckId")
          .where("id", "=", playerId)
          .executeTakeFirst();
        if (!player) {
          return false;
        }
        await trx.deleteFrom("metaEventPlayers").where("id", "=", playerId).execute();
        if (player.deckId !== null) {
          await trx.deleteFrom("decks").where("id", "=", player.deckId).execute();
        }
        return true;
      });
    },

    sourcesForEvent(eventId: string): Promise<MetaEventSourceRow[]> {
      return db
        .selectFrom("metaEventSources")
        .selectAll()
        .where("metaEventId", "=", eventId)
        .orderBy(sql`provider asc nulls last`)
        .orderBy("createdAt", "asc")
        .execute();
    },

    /**
     * The live event a source key already feeds, if any. This is the only link
     * between a mirror and live, so accept and promotion both resolve through
     * it rather than keeping a second pointer of their own.
     */
    sourceByKey(provider: string, externalId: string): Promise<MetaEventSourceRow | undefined> {
      return db
        .selectFrom("metaEventSources")
        .selectAll()
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
    },

    /** {@link sourceByKey} over a batch, for the scoped re-promote pass. */
    async sourcesByKeys(
      provider: string,
      externalIds: readonly string[],
    ): Promise<MetaEventSourceRow[]> {
      if (externalIds.length === 0) {
        return [];
      }
      return await db
        .selectFrom("metaEventSources")
        .selectAll()
        .where("provider", "=", provider)
        .where("externalId", "in", [...externalIds])
        .execute();
    },

    /** Citations for a page of events, in one round trip for the admin list. */
    async sourcesForEvents(eventIds: readonly string[]): Promise<MetaEventSourceRow[]> {
      if (eventIds.length === 0) {
        return [];
      }
      return await db
        .selectFrom("metaEventSources")
        .selectAll()
        .where("metaEventId", "in", [...eventIds])
        .orderBy("priority", "asc")
        .orderBy("createdAt", "asc")
        .execute();
    },

    /** Reorders one citation, which is how a reviewer picks the winning source. */
    async setEventSourcePriority(id: string, priority: number): Promise<boolean> {
      const result = await db
        .updateTable("metaEventSources")
        .set({ priority })
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    insertEventSource(input: MetaEventSourceInput): Promise<MetaEventSourceRow> {
      return db
        .insertInto("metaEventSources")
        .values(input)
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async deleteEventSource(id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("metaEventSources")
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Removes a provider's citation by its source key, for callers that hold
     * the key rather than the row id.
     */
    async deleteEventSourceByKey(provider: string, externalId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("metaEventSources")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    /**
     * Records one contribution; a null `metaEventPlayerId` credits the event
     * itself. Idempotent on the contribution's unique index (`NULLS NOT
     * DISTINCT`, so a second event-level credit for the same user is the same
     * row), because an accept is legitimately re-run — a corrected list, a
     * re-upload — and a contributor is credited once per thing they
     * contributed, not once per click.
     */
    async insertCredit(values: {
      metaEventId: string;
      metaEventPlayerId: string | null;
      userId: string;
    }): Promise<void> {
      await db
        .insertInto("metaCredits")
        .values(values)
        .onConflict((oc) => oc.columns(["metaEventId", "userId", "metaEventPlayerId"]).doNothing())
        .execute();
    },

    /**
     * Deleting the standings row itself cascades; this is the narrower case of
     * taking a credit back while the row stays. Several people can have
     * contributed to one entry, so the unlink path always passes `userId`.
     */
    async deleteCreditsForPlayer(metaEventPlayerId: string, userId?: string): Promise<void> {
      let query = db.deleteFrom("metaCredits").where("metaEventPlayerId", "=", metaEventPlayerId);
      if (userId !== undefined) {
        query = query.where("userId", "=", userId);
      }
      await query.execute();
    },

    /**
     * Consent is `users.meta_credit_visibility`, read here rather than frozen
     * onto the credit row: opting in later credits every past contribution and
     * opting out removes them all, without touching an archive row.
     */
    contributorsForEvent(eventId: string): Promise<MetaContributorRow[]> {
      return contributorQuery().where("mc.metaEventId", "=", eventId).execute();
    },

    contributorsForPlayer(metaEventPlayerId: string): Promise<MetaContributorRow[]> {
      return contributorQuery().where("mc.metaEventPlayerId", "=", metaEventPlayerId).execute();
    },

    /**
     * The column lives on `users` but its meaning is this domain's: it is the
     * consent behind {@link contributorsForEvent}, and reading it anywhere
     * else would be reading a meta-archive rule out of context.
     */
    async creditVisibility(userId: string): Promise<MetaCreditVisibility | undefined> {
      const row = await db
        .selectFrom("users")
        .select("metaCreditVisibility")
        .where("id", "=", userId)
        .executeTakeFirst();
      return row?.metaCreditVisibility;
    },

    /**
     * Nothing else moves on a visibility change: opting in credits every past
     * contribution and opting out removes them all, because the public read
     * resolves the name at render rather than freezing it onto a credit row.
     */
    async setCreditVisibility(userId: string, visibility: MetaCreditVisibility): Promise<boolean> {
      const result = await db
        .updateTable("users")
        .set({ metaCreditVisibility: visibility })
        .where("id", "=", userId)
        .executeTakeFirst();
      return (result.numUpdatedRows ?? 0n) > 0n;
    },

    /** `updatedAt` drives the `<lastmod>` the sitemap generator emits. */
    async sitemapEntries(): Promise<{
      events: { slug: string; updatedAt: string }[];
      decks: { slug: string; updatedAt: string }[];
    }> {
      const [events, decks] = await Promise.all([
        db
          .selectFrom("metaEvents")
          .select(["slug", "updatedAt"])
          .orderBy("eventDate", "desc")
          .execute(),
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("decks as d", "d.id", "p.deckId")
          .select(["d.shareToken as slug", "d.updatedAt"])
          .where("d.shareToken", "is not", null)
          .$narrowType<{ slug: string }>()
          .execute(),
      ]);
      const toEntry = (row: { slug: string; updatedAt: Date }) => ({
        slug: row.slug,
        updatedAt: row.updatedAt.toISOString(),
      });
      return {
        events: events.map((row) => toEntry(row)),
        decks: decks.map((row) => toEntry(row)),
      };
    },
  };
}
