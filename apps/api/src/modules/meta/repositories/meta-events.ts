import type {
  META_EVENT_SORTS,
  MetaEventSourceFilter,
  MetaEventStatus,
  MetaEventTier,
} from "@openrift/shared/types/enums";
import type {
  ExpressionBuilder,
  Insertable,
  Kysely,
  RawBuilder,
  Selectable,
  Updateable,
} from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type {
  MetaEventMatchesTable,
  MetaEventPhasesTable,
  MetaEventsTable,
} from "../../../db/tables/meta.js";
import { rowBatches } from "../../../lib/bind-batches.js";
import type { MetaDeckDateRange } from "./meta-shared.js";

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

export type MetaEventRow = Selectable<MetaEventsTable>;

/**
 * `playerRowCount` is the whole standings table; `deckCount` the subset a
 * decklist is known for. They differ for nearly every real event, which is the
 * point of the pyramid.
 */
export type MetaEventWithCounts = MetaEventRow & {
  playerRowCount: number;
  deckCount: number;
};

/**
 * One recent addition to the archive, already grouped into a burst: all rows of
 * one kind landing on one event within one UTC day.
 */
export interface MetaActivityRow {
  kind: "event-added" | "decks-added" | "results-added";
  /** When the newest row of the burst landed. */
  occurredAt: Date;
  /** Rows in the burst; null for `event-added`. */
  count: number | null;
  eventSlug: string;
  eventName: string;
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

/** How one page of the live event list is filtered. */
export interface MetaEventFilters {
  /** Matched against the event name and the organizer. */
  search?: string;
  format?: string;
  /** A provider that feeds the event, or `manual` for events no provider feeds. */
  source?: MetaEventSourceFilter;
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
 * The archive holds fewer standings rows than the source said played. An
 * event with no reported field size is excluded, not counted as complete.
 */
const standingsShort = sql<boolean>`meta_events.player_count is not null
  and c.player_row_count < meta_events.player_count`;

const noDecks = sql<boolean>`c.deck_count = 0`;

/**
 * The event has a citation from the named provider — or, for `manual`, from no
 * provider at all: hand-entered citations carry a null provider, so an event
 * built by hand has no provider row whether or not it has citations.
 */
function sourcedBy(source: MetaEventSourceFilter) {
  return (eb: ExpressionBuilder<Database, "metaEvents">) => {
    const providerRows = eb
      .selectFrom("metaEventSources as src")
      .select("src.id")
      .whereRef("src.metaEventId", "=", "metaEvents.id")
      .where("src.provider", "is not", null);
    if (source === "manual") {
      return eb.not(eb.exists(providerRows));
    }
    return eb.exists(providerRows.where("src.provider", "=", source));
  };
}

export function metaEventsRepo(db: Kysely<Database>) {
  /**
   * Lateral so the roster and deck counts stay filterable and sortable:
   * neither is a column on `meta_events`.
   *
   * The lateral body is an ungrouped aggregate: it always yields one row, so
   * `c.player_row_count` / `c.deck_count` are non-null for every event.
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

  return {
    /**
     * The archived events inside an inclusive event-date window, unpaged. The
     * public `/meta` lists are the only callers; anything the admin pages or
     * narrows by more than the date goes through {@link listEvents} instead.
     */
    allEvents(range: MetaDeckDateRange = {}): Promise<MetaEventWithCounts[]> {
      let query = eventQuery();
      if (range.from !== undefined) {
        query = query.where("metaEvents.eventDate", ">=", range.from);
      }
      if (range.to !== undefined) {
        query = query.where("metaEvents.eventDate", "<=", range.to);
      }
      return query.orderBy("eventDate", "desc").orderBy("name", "asc").execute();
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
      if (filters.source !== undefined) {
        rowQuery = rowQuery.where(sourcedBy(filters.source));
        countQuery = countQuery.where(sourcedBy(filters.source));
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

    /** The row's own columns, without the standings counts {@link eventById} joins for. */
    eventRowById(id: string): Promise<MetaEventRow | undefined> {
      return db.selectFrom("metaEvents").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** Every event's id and current tier, for the tier scan. */
    allEventTiers(): Promise<{ id: string; tier: MetaEventTier }[]> {
      return db.selectFrom("metaEvents").select(["id", "tier"]).execute();
    },

    /**
     * The newest additions to the archive, one row per burst (one kind, one
     * event, one UTC day), newest first.
     *
     * Deck and standings bursts on the UTC day the event was created are
     * folded into that event's `event-added` row, not reported separately.
     */
    async recentActivity(limit: number): Promise<MetaActivityRow[]> {
      const eventDay = sql`(e.created_at at time zone 'UTC')::date`;

      const [events, deckBursts, resultBursts] = await Promise.all([
        db
          .selectFrom("metaEvents")
          .select(["slug", "name", "createdAt"])
          .orderBy("createdAt", "desc")
          .limit(limit)
          .execute(),
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("decks as d", "d.id", "p.deckId")
          .innerJoin("metaEvents as e", "e.id", "p.metaEventId")
          .select((eb) => [
            "e.slug as eventSlug",
            "e.name as eventName",
            eb.fn.countAll<string>().as("count"),
            eb.fn.max("d.createdAt").as("occurredAt"),
          ])
          .where(sql`(d.created_at at time zone 'UTC')::date`, ">", eventDay)
          .groupBy(["e.slug", "e.name", sql`(d.created_at at time zone 'UTC')::date`])
          .orderBy(sql`max(d.created_at)`, "desc")
          .limit(limit)
          .execute(),
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("metaEvents as e", "e.id", "p.metaEventId")
          .select((eb) => [
            "e.slug as eventSlug",
            "e.name as eventName",
            eb.fn.countAll<string>().as("count"),
            eb.fn.max("p.createdAt").as("occurredAt"),
          ])
          .where(sql`(p.created_at at time zone 'UTC')::date`, ">", eventDay)
          .groupBy(["e.slug", "e.name", sql`(p.created_at at time zone 'UTC')::date`])
          .orderBy(sql`max(p.created_at)`, "desc")
          .limit(limit)
          .execute(),
      ]);

      const rows: MetaActivityRow[] = [
        ...events.map((row): MetaActivityRow => ({
          kind: "event-added",
          occurredAt: row.createdAt,
          count: null,
          eventSlug: row.slug,
          eventName: row.name,
        })),
        ...deckBursts.map((row): MetaActivityRow => ({
          kind: "decks-added",
          occurredAt: row.occurredAt,
          count: Number(row.count),
          eventSlug: row.eventSlug,
          eventName: row.eventName,
        })),
        ...resultBursts.map((row): MetaActivityRow => ({
          kind: "results-added",
          occurredAt: row.occurredAt,
          count: Number(row.count),
          eventSlug: row.eventSlug,
          eventName: row.eventName,
        })),
      ];
      return rows
        .toSorted((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
        .slice(0, limit);
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
     * Writes materialized matches, upserting on the source's own match id.
     *
     * @returns Each written row's live id beside its source id. Postgres
     * returns `ON CONFLICT` rows in arbitrary order; pair them by key, not
     * position.
     */
    async upsertEventMatches(rows: NewMetaEventMatch[]): Promise<UpsertedMetaEventMatch[]> {
      if (rows.length === 0) {
        return [];
      }
      // Batched: a 1000-player Swiss binds past one statement's parameter
      // ceiling. Wrapped in a transaction so readers see a whole
      // materialization or none of it.
      return await db.transaction().execute(async (trx) => {
        const written: UpsertedMetaEventMatch[] = [];
        for (const batch of rowBatches(rows)) {
          written.push(
            ...(await trx
              .insertInto("metaEventMatches")
              .values(batch)
              .onConflict((oc) =>
                // The conflict target must match the partial index's
                // predicate; this path only writes rows with a source id.
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
              .execute()),
          );
        }
        return written;
      });
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
     * Writes the reclassify pass's per-field decisions in one statement. A
     * field left out of the patch must keep its live value, not be
     * overwritten with null.
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

    async setEventLifecycle(
      id: string,
      values: { status: MetaEventStatus; sourceCheckedAt: Date | null },
    ): Promise<void> {
      await db.updateTable("metaEvents").set(values).where("id", "=", id).execute();
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
     * Deleting the event cascades its standings rows, releasing the RESTRICT
     * on their decks. Decks are then deleted explicitly or they would
     * survive under the synthetic owner.
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
  };
}
