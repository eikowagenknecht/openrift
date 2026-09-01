import type { MetaEventTier } from "@openrift/shared/types";
import type { Kysely, Selectable, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database, UvsgamesEventsTable } from "../db/index.js";
import { keyBatches, rowBatches } from "../lib/bind-batches.js";
import { normalizeFormatKey, UVSGAMES_PROVIDER } from "../lib/uvsgames-catalog.js";

/**
 * The uvsgames listing mirror, the two vocabularies the source publishes, and
 * the sync settings row (ADR-014). The live archive tables stay in `metaRepo`
 * and the fetched results in `uvsgamesResultsRepo`; this repo owns one source's
 * crawl bookkeeping.
 *
 * Triage state is derived here rather than stored: an event is "new" when no
 * `meta_event_sources` row links its key and it is not ignored. Storing it
 * would mean a second place that can disagree with the citation table.
 *
 * The mirror has no provider column: it is one source's listing, field for
 * field. The citation and ignore tables it joins against do, because those
 * really are multi-source, so every join here pins {@link UVSGAMES_PROVIDER}.
 */

type UvsgamesEventRow = Selectable<UvsgamesEventsTable>;

/** The projection one listing row upserts, minus the crawl bookkeeping. */
export interface UvsgamesUpsertInput {
  externalId: string;
  name: string;
  startAt: Date;
  endAtEstimate: Date | null;
  displayStatus: string;
  decklistStatus: string | null;
  playerCount: number | null;
  eventType: string | null;
  eventFormat: string | null;
  storeId: number | null;
  storeName: string | null;
  location: string | null;
  timezone: string | null;
  eventConfigurationTemplate: string | null;
  contentHash: string;
}

export interface UvsgamesUpsertResult {
  /** Keys the listing had never shown before. */
  inserted: string[];
  /** Keys whose projection moved, so their hash no longer matches. */
  changed: string[];
  /** Keys the source repeated verbatim; only their `last_seen_at` was touched. */
  unchanged: string[];
}

/** Triage state, derived from the citation and the ignore table. */
export type UvsgamesTriage = "new" | "accepted" | "dismissed";

export interface UvsgamesListRow extends UvsgamesEventRow {
  triage: UvsgamesTriage;
  /** The live event this key feeds, through its citation row. */
  metaEventId: string | null;
  metaEventSlug: string | null;
  /**
   * The store's current name, falling back to the one the listing left on the
   * row when it named no keyed store. Every caller reads this rather than
   * {@link UvsgamesEventRow.storeName}, which is only that fallback.
   */
  storeDisplayName: string | null;
  /** From the recheck queue; null both for an unaccepted event and an exhausted ladder. */
  nextCheckAt: Date | null;
  /** Zero for an event that was never accepted, so it has no queue row. */
  checkStage: number;
}

/**
 * What the deep fetch mirrored for the row. Only the triage list reads it, so
 * the sync paths keep the narrower row and pay for none of it. The counts are
 * zero, never null, for a row nothing was fetched for yet; `fetchedAt` is what
 * says whether a fetch happened.
 */
export interface UvsgamesCoverageRow extends UvsgamesListRow {
  fetchedAt: Date | null;
  stagedPlayerCount: number;
  stagedLegendCount: number;
  stagedDeckCount: number;
}

export interface UvsgamesListFilters {
  /** Case-insensitive substring of the event name. */
  search?: string;
  displayStatus?: string;
  /** True keeps only events whose organizer published decklists. */
  decklistPublished?: boolean;
  minPlayers?: number;
  /** Inclusive bounds on `start_at`. */
  dateFrom?: Date;
  dateTo?: Date;
  triage?: UvsgamesTriage;
  /** True keeps only rows a covering crawl stopped returning. */
  missing?: boolean;
  /** True keeps only accepted rows whose results were never fetched. */
  awaitingResults?: boolean;
}

/** How one page of the catalogue is ordered. Defaults to newest events first. */
export interface UvsgamesListOrder {
  sort?: "startAt" | "name" | "playerCount";
  direction?: "asc" | "desc";
}

export interface UvsgamesTriageCounts {
  new: number;
  accepted: number;
  dismissed: number;
}

export interface MetaSyncSettingsRow {
  autoAcceptMinPlayers: number | null;
  autoAcceptNotable: boolean;
  autoAcceptOfficial: boolean;
  updatedAt: Date;
}

export interface MetaSyncSettingsPatch {
  autoAcceptMinPlayers?: number | null;
  autoAcceptNotable?: boolean;
  autoAcceptOfficial?: boolean;
}

/** One event-configuration template, as the vocabulary list shows it. */
export interface UvsgamesTemplateRow {
  templateId: string;
  sourceName: string | null;
  watched: boolean;
  /** The admin-mapped tier; null until an admin maps the template. */
  tier: MetaEventTier | null;
  eventCount: number;
  /**
   * Mean players over {@link ranEventCount} alone, so a template whose events
   * are still filling up is not judged on empty registrations. Null when none
   * of its events have run yet.
   */
  avgPlayers: number | null;
  /** Events that started before today and published a player count. */
  ranEventCount: number;
  /** The newest event running it, which is all an unnamed template has. */
  sampleEventName: string | null;
  lastStartAt: Date | null;
}

/** One of the source's format strings, with whatever it maps to. */
export interface UvsgamesFormatRow {
  sourceFormat: string;
  eventCount: number;
  mappedFormat: string | null;
}

/** One player the source published, as a deep fetch read them off a registration. */
export interface UvsgamesPlayerInput {
  id: number;
  displayName: string;
}

/** One template as the source's own vocabulary endpoint publishes it. */
export interface UvsgamesTemplateInput {
  templateId: string;
  sourceName: string;
}

/** The one row `meta_sync_settings` is CHECKed down to. */
const SETTINGS_ID = 1;

const CATALOG_ORDER_COLUMNS = {
  startAt: sql`c.start_at`,
  name: sql`lower(c.name)`,
  playerCount: sql`c.player_count`,
};

/**
 * How one page of the list is ordered. Nulls sort last whichever way the column
 * runs: an event the source gave no player count is not the answer to "biggest
 * first", and it is not the answer to "smallest first" either.
 */
function catalogOrderBy(order: UvsgamesListOrder) {
  const column = CATALOG_ORDER_COLUMNS[order.sort ?? "startAt"];
  return order.direction === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
}

export function uvsgamesEventsRepo(db: Kysely<Database>) {
  /**
   * Joined once and reused by the list, the counts, and the by-key read, so the
   * three can never disagree about what "accepted" means. `meta_event_sources`
   * is the link, and it is provider-keyed, so both joins pin this source's own
   * key.
   */
  function triagedQuery() {
    return db
      .selectFrom("uvsgamesEvents as c")
      .leftJoin("metaEventSources as src", (join) =>
        join
          .on("src.provider", "=", UVSGAMES_PROVIDER)
          .onRef("src.externalId", "=", "c.externalId"),
      )
      .leftJoin("metaEvents as me", "me.id", "src.metaEventId")
      .leftJoin("ignoredMetaSourceEvents as i", (join) =>
        join.on("i.provider", "=", UVSGAMES_PROVIDER).onRef("i.externalId", "=", "c.externalId"),
      )
      .leftJoin("uvsgamesStores as s", "s.id", "c.storeId")
      .leftJoin("uvsgamesEventChecks as ck", "ck.externalId", "c.externalId");
  }

  /**
   * The three joined columns every row read carries: the store's current name
   * over the row's own fallback, and the queue's two fields, which live on
   * their own table now.
   */
  const joinedColumns = [
    sql<string | null>`coalesce(s.name, c.store_name)`.as("storeDisplayName"),
    sql<Date | null>`ck.next_check_at`.as("nextCheckAt"),
    sql<number>`coalesce(ck.check_stage, 0)`.as("checkStage"),
  ];

  const fetchedAt = sql<Date | null>`(
    select max(st.fetched_at) from uvsgames_event_standings st
     where st.external_id = c.external_id
  )`;
  const notFetched = sql<SqlBool>`not exists (
    select 1 from uvsgames_event_standings st where st.external_id = c.external_id
  )`;

  const dismissed = sql<SqlBool>`i.provider is not null`;
  const accepted = sql<SqlBool>`i.provider is null and src.meta_event_id is not null`;
  const triage = sql<UvsgamesTriage>`case
    when i.provider is not null then 'dismissed'
    when src.meta_event_id is not null then 'accepted'
    else 'new'
  end`;

  const isNew = sql<SqlBool>`i.provider is null and src.meta_event_id is null`;

  // Correlated against the mirror, so each one is an index lookup on the page's
  // rows rather than an aggregate over every event the archive has fetched.
  const stagedPlayerCount = sql<number>`(
    select count(*)::int from uvsgames_event_standings st where st.external_id = c.external_id
  )`;

  const stagedLegendCount = sql<number>`(
    select count(*)::int from uvsgames_event_standings st
     where st.external_id = c.external_id and st.legend_name is not null
  )`;

  const stagedDeckCount = sql<number>`(
    select count(*)::int from uvsgames_decklists dl
     where dl.external_id = c.external_id and dl.fetch_status = 'fetched'
  )`;

  /**
   * An event whose attendance is settled: it started before today and the
   * source published a count. Today's and future events are still taking
   * registrations, so averaging them in reads every new template as tiny.
   */
  const RAN_EVENT = sql`e.player_count is not null and e.start_at < date_trunc('day', now())`;

  /**
   * The table is the row set, not the mirror: the sync writes a row for every
   * template the source publishes, so one the crawl has not met yet still shows
   * up with its name and a count of zero. Events join in for the counts, served
   * by the partial index on the template column.
   */
  function templateQuery(templateId?: string) {
    let base = db
      .selectFrom("uvsgamesEventTemplates as t")
      .leftJoin("uvsgamesEvents as e", "e.eventConfigurationTemplate", "t.templateId");
    if (templateId !== undefined) {
      base = base.where("t.templateId", "=", templateId);
    }
    return base
      .select((eb) => [
        "t.templateId",
        "t.sourceName",
        "t.watched",
        "t.tier",
        eb.cast<number>(eb.fn.count("e.externalId"), "integer").as("eventCount"),
        sql<number | null>`round(avg(e.player_count) filter (where ${RAN_EVENT}), 1)::float8`.as(
          "avgPlayers",
        ),
        sql<number>`(count(*) filter (where ${RAN_EVENT}))::int`.as("ranEventCount"),
        sql<string | null>`(array_agg(e.name order by e.start_at desc))[1]`.as("sampleEventName"),
        eb.fn.max<Date>("e.startAt").as("lastStartAt"),
      ])
      .groupBy(["t.templateId", "t.sourceName", "t.watched", "t.tier"])
      .orderBy("eventCount", "desc")
      .orderBy("templateId", "asc");
  }

  /** The source's format strings and how many events carry each. */
  function formatCounts(sourceFormat?: string) {
    let base = db.selectFrom("uvsgamesEvents as e").where("e.eventFormat", "is not", null);
    if (sourceFormat !== undefined) {
      base = base.where("e.eventFormat", "=", sourceFormat);
    }
    return base
      .select((eb) => [
        "e.eventFormat as sourceFormat",
        eb.cast<number>(eb.fn.countAll(), "integer").as("eventCount"),
      ])
      .groupBy("e.eventFormat")
      .orderBy("eventCount", "desc")
      .orderBy("sourceFormat", "asc")
      .$narrowType<{ sourceFormat: string }>()
      .execute();
  }

  async function loadFormatMappings(): Promise<Map<string, string>> {
    const rows = await db
      .selectFrom("uvsgamesFormatMappings")
      .select(["sourceFormat", "mappedFormat"])
      .execute();
    return new Map(rows.map((row) => [normalizeFormatKey(row.sourceFormat), row.mappedFormat]));
  }

  async function readFormat(sourceFormat: string): Promise<UvsgamesFormatRow | undefined> {
    const [counts, mappings] = await Promise.all([
      formatCounts(sourceFormat),
      loadFormatMappings(),
    ]);
    const row = counts[0];
    if (row === undefined) {
      return undefined;
    }
    return { ...row, mappedFormat: mappings.get(normalizeFormatKey(row.sourceFormat)) ?? null };
  }

  function triagePredicate(state: UvsgamesTriage) {
    if (state === "dismissed") {
      return dismissed;
    }
    return state === "accepted" ? accepted : isNew;
  }

  return {
    /**
     * Hash-gated batch upsert. An unchanged row costs one `last_seen_at` write
     * and nothing else, which is the difference between a 250-page crawl being
     * cheap and it rewriting a quarter-million rows a week.
     *
     * `xmax = 0` distinguishes an insert from an update in the same statement:
     * Postgres leaves the transaction id zero on a freshly inserted tuple.
     */
    async upsertBatch(
      rows: readonly UvsgamesUpsertInput[],
      seenAt: Date,
    ): Promise<UvsgamesUpsertResult> {
      if (rows.length === 0) {
        return { inserted: [], changed: [], unchanged: [] };
      }

      // The store rows have to exist before the events that reference them, and
      // a repeated name is an update rather than a conflict: renames propagate.
      const stores = [
        ...new Map(
          rows
            .filter((row) => row.storeId !== null && row.storeName !== null)
            .map((row) => [row.storeId, { id: row.storeId, name: row.storeName }] as const),
        ).values(),
      ] as { id: number; name: string }[];
      for (const batch of rowBatches(
        stores.map((store) => ({ id: store.id, name: store.name.slice(0, 200) })),
      )) {
        await db
          .insertInto("uvsgamesStores")
          .values(batch)
          .onConflict((oc) =>
            oc.column("id").doUpdateSet((eb) => ({ name: eb.ref("excluded.name") })),
          )
          .execute();
      }

      const written: { externalId: string; inserted: boolean }[] = [];
      for (const batch of rowBatches(
        rows.map((row) => ({ ...row, lastSeenAt: seenAt, missingSince: null })),
      )) {
        written.push(
          ...(await db
            .insertInto("uvsgamesEvents")
            .values(batch)
            .onConflict((oc) =>
              oc
                .columns(["externalId"])
                .doUpdateSet((eb) => ({
                  name: eb.ref("excluded.name"),
                  startAt: eb.ref("excluded.startAt"),
                  endAtEstimate: eb.ref("excluded.endAtEstimate"),
                  displayStatus: eb.ref("excluded.displayStatus"),
                  decklistStatus: eb.ref("excluded.decklistStatus"),
                  playerCount: eb.ref("excluded.playerCount"),
                  eventType: eb.ref("excluded.eventType"),
                  eventFormat: eb.ref("excluded.eventFormat"),
                  storeName: eb.ref("excluded.storeName"),
                  location: eb.ref("excluded.location"),
                  timezone: eb.ref("excluded.timezone"),
                  storeId: eb.ref("excluded.storeId"),
                  eventConfigurationTemplate: eb.ref("excluded.eventConfigurationTemplate"),
                  contentHash: eb.ref("excluded.contentHash"),
                  lastSeenAt: eb.ref("excluded.lastSeenAt"),
                  missingSince: eb.ref("excluded.missingSince"),
                }))
                .where(
                  sql<SqlBool>`uvsgames_events.content_hash is distinct from excluded.content_hash
                    or uvsgames_events.missing_since is not null`,
                ),
            )
            .returning(["externalId", sql<boolean>`(xmax = 0)`.as("inserted")])
            .execute()),
        );
      }

      const inserted: string[] = [];
      const changed: string[] = [];
      for (const row of written) {
        (row.inserted ? inserted : changed).push(row.externalId);
      }

      // The rows the conflict WHERE filtered out are the untouched ones, and
      // they still have to record that the source repeated them.
      const touched = new Set([...inserted, ...changed]);
      const unchanged = rows.map((row) => row.externalId).filter((id) => !touched.has(id));
      for (const batch of keyBatches(unchanged)) {
        await db
          .updateTable("uvsgamesEvents")
          .set({ lastSeenAt: seenAt })
          .where("externalId", "in", batch)
          .execute();
      }

      return { inserted, changed, unchanged };
    },

    /**
     * Flags the rows a covering crawl no longer returned. The source deletes
     * events, and the row is kept rather than removed so an accepted event that
     * vanishes upstream stays visible in the archive's own history.
     */
    async markMissing(params: {
      from: Date;
      to: Date;
      seenBefore: Date;
      at: Date;
    }): Promise<number> {
      const result = await db
        .updateTable("uvsgamesEvents")
        .set({ missingSince: params.at })
        .where("startAt", ">=", params.from)
        .where("startAt", "<=", params.to)
        .where("lastSeenAt", "<", params.seenBefore)
        .where("missingSince", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows ?? 0n);
    },

    /** Every mirrored key running one template, for a scoped re-promote. */
    async externalIdsForTemplate(templateId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("uvsgamesEvents")
        .select("externalId")
        .where("eventConfigurationTemplate", "=", templateId)
        .execute();
      return rows.map((row) => row.externalId);
    },

    async byKey(externalId: string): Promise<UvsgamesListRow | undefined> {
      const row = await triagedQuery()
        .selectAll("c")
        .select([
          triage.as("triage"),
          "src.metaEventId as metaEventId",
          "me.slug as metaEventSlug",
          ...joinedColumns,
        ])
        .where("c.externalId", "=", externalId)
        .executeTakeFirst();
      return row;
    },

    /**
     * The recheck queue: every armed event whose next visit is due. Only the
     * accept path arms a row, so in practice these are accepted events, but the
     * filter is the queue's own column. Ordered oldest-due first so a backlog
     * drains in the order it built up.
     */
    async dueForRecheck(now: Date, limit: number): Promise<UvsgamesListRow[]> {
      const rows = await triagedQuery()
        .selectAll("c")
        .select([
          triage.as("triage"),
          "src.metaEventId as metaEventId",
          "me.slug as metaEventSlug",
          ...joinedColumns,
        ])
        .where("ck.nextCheckAt", "is not", null)
        .where("ck.nextCheckAt", "<=", now)
        .orderBy("ck.nextCheckAt", "asc")
        .limit(limit)
        .execute();
      return rows;
    },

    /**
     * Records that a results deep fetch completed, standings or no standings.
     * The recheck ladder reads this rather than counting mirror rows, because a
     * cancelled event legitimately has none.
     */
    async markResultsFetched(externalId: string, now: Date): Promise<void> {
      await db
        .updateTable("uvsgamesEvents")
        .set({ resultsFetchedAt: now })
        .where("externalId", "=", externalId)
        .execute();
    },

    /**
     * Arms or advances one event's place in the queue. The row is written on the
     * first accept and kept forever after: a null `nextCheckAt` is the ladder's
     * terminal state, and the row still records that the event was accepted and
     * how far its ladder got.
     */
    async setRecheck(
      externalId: string,
      values: { nextCheckAt: Date | null; checkStage: number },
    ): Promise<void> {
      await db
        .insertInto("uvsgamesEventChecks")
        .values({ externalId, ...values })
        .onConflict((oc) => oc.column("externalId").doUpdateSet(values))
        .execute();
    },

    /** Rows whose triage state may have moved, for the auto-accept sweep. */
    async unacceptedByKeys(externalIds: string[]): Promise<UvsgamesListRow[]> {
      const rows: UvsgamesListRow[] = [];
      for (const batch of keyBatches(externalIds)) {
        rows.push(
          ...(await triagedQuery()
            .selectAll("c")
            .select([
              triage.as("triage"),
              "src.metaEventId as metaEventId",
              "me.slug as metaEventSlug",
              ...joinedColumns,
            ])
            .where("c.externalId", "in", batch)
            .where(isNew)
            .execute()),
        );
      }
      return rows;
    },

    async list(
      filters: UvsgamesListFilters,
      page: { limit: number; offset: number },
      order: UvsgamesListOrder = {},
    ): Promise<{ rows: UvsgamesCoverageRow[]; total: number }> {
      let rowQuery = triagedQuery()
        .selectAll("c")
        .select([
          triage.as("triage"),
          "src.metaEventId as metaEventId",
          "me.slug as metaEventSlug",
          ...joinedColumns,
          fetchedAt.as("fetchedAt"),
          stagedPlayerCount.as("stagedPlayerCount"),
          stagedLegendCount.as("stagedLegendCount"),
          stagedDeckCount.as("stagedDeckCount"),
        ])
        .orderBy(catalogOrderBy(order))
        // Ties on the sort column are common (a locals night files every store
        // at the same minute), so the key breaks them and keeps paging stable.
        .orderBy("c.externalId", "desc")
        .limit(page.limit)
        .offset(page.offset);
      let countQuery = triagedQuery().select((eb) => eb.fn.countAll<string>().as("total"));

      if (filters.search !== undefined && filters.search.trim() !== "") {
        const pattern = `%${filters.search.trim()}%`;
        rowQuery = rowQuery.where("c.name", "ilike", pattern);
        countQuery = countQuery.where("c.name", "ilike", pattern);
      }
      if (filters.displayStatus !== undefined) {
        rowQuery = rowQuery.where("c.displayStatus", "=", filters.displayStatus);
        countQuery = countQuery.where("c.displayStatus", "=", filters.displayStatus);
      }
      if (filters.decklistPublished === true) {
        rowQuery = rowQuery.where("c.decklistStatus", "=", "PUBLISHED");
        countQuery = countQuery.where("c.decklistStatus", "=", "PUBLISHED");
      }
      if (filters.minPlayers !== undefined) {
        rowQuery = rowQuery.where("c.playerCount", ">=", filters.minPlayers);
        countQuery = countQuery.where("c.playerCount", ">=", filters.minPlayers);
      }
      if (filters.dateFrom !== undefined) {
        rowQuery = rowQuery.where("c.startAt", ">=", filters.dateFrom);
        countQuery = countQuery.where("c.startAt", ">=", filters.dateFrom);
      }
      if (filters.dateTo !== undefined) {
        rowQuery = rowQuery.where("c.startAt", "<=", filters.dateTo);
        countQuery = countQuery.where("c.startAt", "<=", filters.dateTo);
      }
      if (filters.missing === true) {
        rowQuery = rowQuery.where("c.missingSince", "is not", null);
        countQuery = countQuery.where("c.missingSince", "is not", null);
      }
      if (filters.awaitingResults === true) {
        rowQuery = rowQuery.where(accepted).where(notFetched);
        countQuery = countQuery.where(accepted).where(notFetched);
      }
      if (filters.triage !== undefined) {
        const predicate = triagePredicate(filters.triage);
        rowQuery = rowQuery.where(predicate);
        countQuery = countQuery.where(predicate);
      }

      const [rows, countRow] = await Promise.all([
        rowQuery.execute(),
        countQuery.executeTakeFirstOrThrow(),
      ]);
      return { rows, total: Number(countRow.total) };
    },

    /** The three triage buckets, unfiltered, for the tab labels. */
    async triageCounts(): Promise<UvsgamesTriageCounts> {
      const row = await triagedQuery()
        .select([
          sql<string>`count(*) filter (where ${dismissed})`.as("dismissed"),
          sql<string>`count(*) filter (where ${accepted})`.as("accepted"),
          sql<string>`count(*) filter (where ${isNew})`.as("new"),
        ])
        .executeTakeFirstOrThrow();
      return {
        new: Number(row.new),
        accepted: Number(row.accepted),
        dismissed: Number(row.dismissed),
      };
    },

    /**
     * Headline numbers for the admin sync panel. Joined rather than counted off
     * the catalogue alone, because the accepted bucket's two problem states —
     * results still missing, listing entry gone — are only visible against the
     * candidate link.
     */
    async syncOverview(): Promise<{
      total: number;
      completed: number;
      decklistPublished: number;
      missing: number;
      dueRecheck: number;
      queued: number;
      acceptedAwaitingResults: number;
      acceptedMissing: number;
      lastSeenAt: Date | null;
    }> {
      const row = await triagedQuery()
        .select((eb) => [
          eb.fn.countAll<string>().as("total"),
          sql<string>`count(*) filter (where c.display_status = 'complete')`.as("completed"),
          sql<string>`count(*) filter (where c.decklist_status = 'PUBLISHED')`.as(
            "decklistPublished",
          ),
          sql<string>`count(*) filter (where c.missing_since is not null)`.as("missing"),
          sql<string>`count(*) filter (where ck.next_check_at is not null and ck.next_check_at <= now())`.as(
            "dueRecheck",
          ),
          sql<string>`count(*) filter (where ck.next_check_at is not null)`.as("queued"),
          sql<string>`count(*) filter (where (${accepted}) and (${notFetched}))`.as(
            "acceptedAwaitingResults",
          ),
          sql<string>`count(*) filter (where (${accepted}) and c.missing_since is not null)`.as(
            "acceptedMissing",
          ),
          eb.fn.max<Date | null>("c.lastSeenAt").as("lastSeenAt"),
        ])
        .executeTakeFirstOrThrow();
      return {
        total: Number(row.total),
        completed: Number(row.completed),
        decklistPublished: Number(row.decklistPublished),
        missing: Number(row.missing),
        dueRecheck: Number(row.dueRecheck),
        queued: Number(row.queued),
        acceptedAwaitingResults: Number(row.acceptedAwaitingResults),
        acceptedMissing: Number(row.acceptedMissing),
        lastSeenAt: row.lastSeenAt,
      };
    },

    /**
     * Records the players a deep fetch just read. The display name is updated on
     * conflict, so a rename reaches every standings row filed under that id
     * rather than being snapshotted per event.
     */
    async upsertPlayers(players: readonly UvsgamesPlayerInput[]): Promise<number> {
      const unique = [...new Map(players.map((player) => [player.id, player])).values()];
      if (unique.length === 0) {
        return 0;
      }
      for (const batch of rowBatches(
        unique.map((player) => ({
          id: player.id,
          displayName: player.displayName.slice(0, 80),
        })),
      )) {
        await db
          .insertInto("uvsgamesPlayers")
          .values(batch)
          .onConflict((oc) =>
            oc.column("id").doUpdateSet((eb) => ({ displayName: eb.ref("excluded.displayName") })),
          )
          .execute();
      }
      return unique.length;
    },

    // ── The source's vocabularies ──────────────────────────────────────────
    // Templates come from the source's own vocabulary endpoint and formats are
    // discovered from the mirror, so the two lists are built differently: one
    // reads its own table, the other is a GROUP BY over `uvsgames_events` with
    // the mappings joined on. A format the listing has never carried has
    // nothing to map, which is what its `undefined` return means.

    /**
     * Watched template ids to their names, for the badge and the auto-accept
     * rule. The name is null for a template the source stopped publishing,
     * which is a row the badge has nothing to print but the rule still matches.
     */
    async watchedTemplates(): Promise<Map<string, string | null>> {
      const rows = await db
        .selectFrom("uvsgamesEventTemplates")
        .select(["templateId", "sourceName"])
        .where("watched", "=", true)
        .execute();
      return new Map(rows.map((row) => [row.templateId, row.sourceName]));
    },

    /**
     * Every template id to its admin-mapped tier, watched or not, for the
     * classifier. Null for a template the admin has not mapped yet.
     */
    async templateTiers(): Promise<Map<string, MetaEventTier | null>> {
      const rows = await db
        .selectFrom("uvsgamesEventTemplates")
        .select(["templateId", "tier"])
        .execute();
      return new Map(rows.map((row) => [row.templateId, row.tier]));
    },

    /** Normalized source format to `deck_formats` slug, for every mapping there is. */
    formatMappings(): Promise<Map<string, string>> {
      return loadFormatMappings();
    },

    listTemplates(): Promise<UvsgamesTemplateRow[]> {
      return templateQuery().execute();
    },

    /**
     * Writes the fields an admin owns and reads the row back, so the caller
     * gets the same shape the list returns. An unknown template updates nothing
     * and returns undefined: rows are the sync's to create, never a click's.
     */
    async updateTemplate(
      templateId: string,
      patch: { watched?: boolean; tier?: MetaEventTier | null },
    ): Promise<UvsgamesTemplateRow | undefined> {
      if (patch.watched === undefined && patch.tier === undefined) {
        return await templateQuery(templateId).executeTakeFirst();
      }
      const updated = await db
        .updateTable("uvsgamesEventTemplates")
        .set(patch)
        .where("templateId", "=", templateId)
        .executeTakeFirst();
      if (updated.numUpdatedRows === 0n) {
        return undefined;
      }
      return await templateQuery(templateId).executeTakeFirst();
    },

    /**
     * The source's published vocabulary, as the sync read it. Names are
     * refreshed on every run so a renamed template propagates; `watched` is
     * never touched, because that is the admin's column alone.
     */
    async upsertTemplates(templates: readonly UvsgamesTemplateInput[]): Promise<number> {
      if (templates.length === 0) {
        return 0;
      }
      let upserted = 0n;
      for (const batch of rowBatches(templates.map((template) => ({ ...template })))) {
        const result = await db
          .insertInto("uvsgamesEventTemplates")
          .values(batch)
          .onConflict((oc) =>
            oc
              .column("templateId")
              .doUpdateSet((eb) => ({ sourceName: eb.ref("excluded.sourceName") })),
          )
          .executeTakeFirst();
        upserted += result.numInsertedOrUpdatedRows ?? 0n;
      }
      return Number(upserted);
    },

    /**
     * Template ids the mirror carries that the endpoint never published, given
     * rows so the vocabulary list can show them at all. They stay nameless: the
     * source retired them and nothing can say what they were called.
     */
    async discoverTemplatesFromEvents(): Promise<number> {
      const result = await sql`
        INSERT INTO uvsgames_event_templates (template_id)
        SELECT DISTINCT event_configuration_template
          FROM uvsgames_events
         WHERE event_configuration_template IS NOT NULL
        ON CONFLICT (template_id) DO NOTHING
      `.execute(db);
      return Number(result.numAffectedRows ?? 0n);
    },

    /**
     * Every format string the listing carries, with its mapping. The two sides
     * are matched in TypeScript rather than SQL so the normalization is the one
     * {@link normalizeFormatKey} defines, not a second copy of it inside a join
     * predicate.
     */
    async listFormats(): Promise<UvsgamesFormatRow[]> {
      const [counts, mappings] = await Promise.all([formatCounts(), loadFormatMappings()]);
      return counts.map((row) => ({
        ...row,
        mappedFormat: mappings.get(normalizeFormatKey(row.sourceFormat)) ?? null,
      }));
    },

    formatByName(sourceFormat: string): Promise<UvsgamesFormatRow | undefined> {
      return readFormat(sourceFormat);
    },

    /**
     * A null mapping deletes the row, which is what un-mapping a format means.
     *
     * Stored under {@link normalizeFormatKey}'s key, the one the read side looks
     * up by: mapping "Constructed" and then "CONSTRUCTED" must edit one row, not
     * leave two for the lookup to pick a winner between. Rows written under an
     * older spelling are cleared out on the way past.
     */
    async setFormatMapping(
      sourceFormat: string,
      mappedFormat: string | null,
    ): Promise<UvsgamesFormatRow | undefined> {
      const key = normalizeFormatKey(sourceFormat);
      await db.transaction().execute(async (trx) => {
        const stored = await trx
          .selectFrom("uvsgamesFormatMappings")
          .select("sourceFormat")
          .execute();
        const dead = stored
          .map((row) => row.sourceFormat)
          .filter(
            (value) =>
              normalizeFormatKey(value) === key && (mappedFormat === null || value !== key),
          );
        if (dead.length > 0) {
          await trx
            .deleteFrom("uvsgamesFormatMappings")
            .where("sourceFormat", "in", dead)
            .execute();
        }
        if (mappedFormat !== null) {
          await trx
            .insertInto("uvsgamesFormatMappings")
            .values({ sourceFormat: key, mappedFormat })
            .onConflict((oc) => oc.column("sourceFormat").doUpdateSet({ mappedFormat }))
            .execute();
        }
      });
      return await readFormat(sourceFormat);
    },

    async settings(): Promise<MetaSyncSettingsRow> {
      const row = await db
        .selectFrom("metaSyncSettings")
        .select(["autoAcceptMinPlayers", "autoAcceptNotable", "autoAcceptOfficial", "updatedAt"])
        .where("id", "=", SETTINGS_ID)
        .executeTakeFirstOrThrow();
      return row;
    },

    async updateSettings(patch: MetaSyncSettingsPatch): Promise<MetaSyncSettingsRow> {
      const row = await db
        .updateTable("metaSyncSettings")
        .set(patch)
        .where("id", "=", SETTINGS_ID)
        .returning(["autoAcceptMinPlayers", "autoAcceptNotable", "autoAcceptOfficial", "updatedAt"])
        .executeTakeFirstOrThrow();
      return row;
    },
  };
}
