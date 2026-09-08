import type { MetaEventTier, UvsgamesProbeOutcome } from "@openrift/shared/types/enums";
import type { Kysely, Selectable, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { UvsgamesEventsTable } from "../../../db/tables/meta-sources.js";
import { keyBatches, rowBatches } from "../../../lib/bind-batches.js";
import { normalizeFormatKey, UVSGAMES_PROVIDER } from "../../../lib/meta-providers.js";

/**
 * Owns one source's crawl bookkeeping; live archive tables stay in `metaRepo`.
 * Triage state is derived from `meta_event_sources` and the ignore table, never stored.
 * The mirror has no provider column: every join pins {@link UVSGAMES_PROVIDER}.
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

export interface UvsgamesIdProbeInput {
  externalId: number;
  outcome: UvsgamesProbeOutcome;
  gameType: string | null;
}

export interface UvsgamesUpsertResult {
  inserted: string[];
  changed: string[];
  unchanged: string[];
}

export type UvsgamesTriage = "new" | "accepted" | "dismissed";

export interface UvsgamesTierInputRow {
  metaEventId: string;
  externalId: string;
  eventConfigurationTemplate: string | null;
  eventFormat: string | null;
  playerCount: number | null;
}

export interface UvsgamesListRow extends UvsgamesEventRow {
  triage: UvsgamesTriage;
  metaEventId: string | null;
  metaEventSlug: string | null;
  storeDisplayName: string | null;
  nextCheckAt: Date | null;
  checkStage: number;
}

/** The counts are zero, never null, for a row nothing was fetched for yet. */
export interface UvsgamesCoverageRow extends UvsgamesListRow {
  fetchedAt: Date | null;
  stagedPlayerCount: number;
  stagedLegendCount: number;
  stagedDeckCount: number;
}

export interface UvsgamesListFilters {
  search?: string;
  displayStatus?: string;
  decklistPublished?: boolean;
  minPlayers?: number;
  dateFrom?: Date;
  dateTo?: Date;
  triage?: UvsgamesTriage;
  missing?: boolean;
  awaitingResults?: boolean;
}

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
  competitivePlayerFloor: number;
  updatedAt: Date;
}

export interface MetaSyncSettingsPatch {
  autoAcceptMinPlayers?: number | null;
  autoAcceptNotable?: boolean;
  autoAcceptOfficial?: boolean;
  competitivePlayerFloor?: number;
}

export interface UvsgamesTemplateRow {
  templateId: string;
  sourceName: string | null;
  watched: boolean;
  tier: MetaEventTier | null;
  eventCount: number;
  avgPlayers: number | null;
  ranEventCount: number;
  sampleEventName: string | null;
  lastStartAt: Date | null;
}

export interface UvsgamesFormatRow {
  sourceFormat: string;
  eventCount: number;
  mappedFormat: string | null;
}

export interface UvsgamesPlayerInput {
  id: number;
  displayName: string;
}

export interface UvsgamesTemplateInput {
  templateId: string;
  sourceName: string;
}

const SETTINGS_ID = 1;

const CATALOG_ORDER_COLUMNS = {
  startAt: sql`c.start_at`,
  name: sql`lower(c.name)`,
  playerCount: sql`c.player_count`,
};

/** Nulls always sort last, whichever direction the column runs. */
function catalogOrderBy(order: UvsgamesListOrder) {
  const column = CATALOG_ORDER_COLUMNS[order.sort ?? "startAt"];
  return order.direction === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
}

export function uvsgamesEventsRepo(db: Kysely<Database>) {
  /** Reused by the list, the counts, and the by-key read so all three agree on "accepted". */
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

  // Absence must be an anti-join here: reading a joined null makes the planner
  // sort the whole catalogue before taking one page. Presence reads the join.
  const notDismissed = sql<SqlBool>`not exists (
    select 1 from ignored_meta_source_events x
     where x.provider = ${UVSGAMES_PROVIDER} and x.external_id = c.external_id
  )`;
  const notLinked = sql<SqlBool>`not exists (
    select 1 from meta_event_sources y
     where y.provider = ${UVSGAMES_PROVIDER} and y.external_id = c.external_id
       and y.meta_event_id is not null
  )`;
  const pagedNew = sql<SqlBool>`${notDismissed} and ${notLinked}`;
  const pagedAccepted = sql<SqlBool>`${notDismissed} and src.meta_event_id is not null`;

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

  // Today's and future events are still taking registrations, so counting
  // them in would read every new template as averaging near zero.
  const RAN_EVENT = sql`e.player_count is not null and e.start_at < date_trunc('day', now())`;

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

  function pagedTriagePredicate(state: UvsgamesTriage) {
    if (state === "dismissed") {
      return dismissed;
    }
    return state === "accepted" ? pagedAccepted : pagedNew;
  }

  return {
    // `xmax = 0` distinguishes an insert from an update in the same
    // statement: Postgres leaves the transaction id zero on a fresh tuple.
    async upsertBatch(
      rows: readonly UvsgamesUpsertInput[],
      seenAt: Date,
    ): Promise<UvsgamesUpsertResult> {
      if (rows.length === 0) {
        return { inserted: [], changed: [], unchanged: [] };
      }

      // Store rows must exist before the events that reference them. A repeated
      // name updates the store in place, so renames propagate.
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

    // Rows are kept, not deleted, so an accepted event that vanishes
    // upstream stays visible in the archive's own history.
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

    async sweepBounds(): Promise<{ fromId: number; toId: number } | undefined> {
      const row = await sql<{ fromId: string | null; toId: string | null }>`
        select min(external_id::bigint)::text as "fromId",
               max(external_id::bigint)::text as "toId"
        from uvsgames_events
        where external_id ~ '^[0-9]+$'
      `.execute(db);
      const bounds = row.rows[0];
      if (bounds === undefined || bounds.fromId === null || bounds.toId === null) {
        return undefined;
      }
      return { fromId: Number(bounds.fromId), toId: Number(bounds.toId) };
    },

    // Cast the id to text, not the column to bigint, or the anti-joins
    // lose their primary-key index.
    async sweepCandidates(fromId: number, toId: number, limit: number): Promise<number[]> {
      const rows = await sql<{ id: string }>`
        select gs.id::text as id
        from generate_series(${fromId}::bigint, ${toId}::bigint) as gs(id)
        where not exists (
          select 1 from uvsgames_id_probes p where p.external_id = gs.id
        ) and not exists (
          select 1 from uvsgames_events e where e.external_id = gs.id::text
        )
        order by gs.id
        limit ${limit}
      `.execute(db);
      return rows.rows.map((row) => Number(row.id));
    },

    // Assumes the two tables never overlap.
    async sweepRemaining(fromId: number, toId: number): Promise<number> {
      const rows = await sql<{ remaining: string }>`
        select (
          (${toId}::bigint - ${fromId}::bigint + 1)
          - (
            select count(*) from uvsgames_id_probes
            where external_id between ${fromId}::bigint and ${toId}::bigint
          )
          - (
            select count(*) from uvsgames_events
            where external_id ~ '^[0-9]+$'
              and external_id::bigint between ${fromId}::bigint and ${toId}::bigint
          )
        )::text as remaining
      `.execute(db);
      return Number(rows.rows[0]?.remaining ?? 0);
    },

    async recordProbes(rows: readonly UvsgamesIdProbeInput[]): Promise<void> {
      for (const batch of rowBatches(rows.map((row) => ({ ...row })))) {
        await db
          .insertInto("uvsgamesIdProbes")
          .values(batch)
          .onConflict((oc) =>
            oc.column("externalId").doUpdateSet((eb) => ({
              outcome: eb.ref("excluded.outcome"),
              gameType: eb.ref("excluded.gameType"),
            })),
          )
          .execute();
      }
    },

    // Joined, not keyed by an id list: one template covers 180,000 mirror
    // rows, past the bind-parameter ceiling.
    tierInputsForLiveEvents(): Promise<UvsgamesTierInputRow[]> {
      return db
        .selectFrom("uvsgamesEvents as e")
        .innerJoin("metaEventSources as s", (join) =>
          join.onRef("s.externalId", "=", "e.externalId").on("s.provider", "=", UVSGAMES_PROVIDER),
        )
        .select([
          "s.metaEventId",
          "e.externalId",
          "e.eventConfigurationTemplate",
          "e.eventFormat",
          "e.playerCount",
        ])
        .execute();
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

    // Filters on the queue's own column, not on triage: only the accept
    // path ever arms a row, but that's not what's being checked here.
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

    // The recheck ladder reads this timestamp; a cancelled event legitimately has no mirror rows.
    async markResultsFetched(externalId: string, now: Date): Promise<void> {
      await db
        .updateTable("uvsgamesEvents")
        .set({ resultsFetchedAt: now })
        .where("externalId", "=", externalId)
        .execute();
    },

    // The row is kept after a null nextCheckAt (the ladder's terminal
    // state), so it still records that the event was accepted.
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

    // Keys, not rows: the catalogue holds six figures of them, and the
    // sweep reads their rows a page at a time.
    async newKeys(): Promise<string[]> {
      const rows = await triagedQuery()
        .select("c.externalId")
        .where(isNew)
        .orderBy("c.startAt", "desc")
        .execute();
      return rows.map((row) => row.externalId);
    },

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
        rowQuery = rowQuery.where(pagedAccepted).where(notFetched);
        countQuery = countQuery.where(pagedAccepted).where(notFetched);
      }
      if (filters.triage !== undefined) {
        const predicate = pagedTriagePredicate(filters.triage);
        rowQuery = rowQuery.where(predicate);
        countQuery = countQuery.where(predicate);
      }

      const [rows, countRow] = await Promise.all([
        rowQuery.execute(),
        countQuery.executeTakeFirstOrThrow(),
      ]);
      return { rows, total: Number(countRow.total) };
    },

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

    // The accepted bucket's problem states are only visible against the candidate link,
    // not off the catalogue alone.
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

    // Display name updates on conflict, so a rename reaches every standings row filed under that id.
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

    async playerDisplayNames(ids: readonly number[]): Promise<Map<number, string>> {
      const unique = [...new Set(ids)];
      if (unique.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("uvsgamesPlayers")
        .select(["id", "displayName"])
        .where("id", "in", unique)
        .execute();
      return new Map(rows.map((row) => [row.id, row.displayName]));
    },

    // Name is null for a template the source stopped publishing: the badge
    // has nothing to print, but the auto-accept rule still matches it.
    async watchedTemplates(): Promise<Map<string, string | null>> {
      const rows = await db
        .selectFrom("uvsgamesEventTemplates")
        .select(["templateId", "sourceName"])
        .where("watched", "=", true)
        .execute();
      return new Map(rows.map((row) => [row.templateId, row.sourceName]));
    },

    // Watched or not: the classifier needs every template's tier.
    async templateTiers(): Promise<Map<string, MetaEventTier | null>> {
      const rows = await db
        .selectFrom("uvsgamesEventTemplates")
        .select(["templateId", "tier"])
        .execute();
      return new Map(rows.map((row) => [row.templateId, row.tier]));
    },

    formatMappings(): Promise<Map<string, string>> {
      return loadFormatMappings();
    },

    listTemplates(): Promise<UvsgamesTemplateRow[]> {
      return templateQuery().execute();
    },

    // An unknown template updates nothing and returns undefined: rows are
    // the sync's to create, never a click's.
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

    // `watched` is never touched here; that column is the admin's alone.
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

    // Rows stay nameless: the source retired these templates, and nothing
    // can say what they were called.
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

    // Matched in TypeScript so normalization stays the one {@link normalizeFormatKey} defines.
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

    // A null mapping deletes the row. Stored under {@link normalizeFormatKey}'s
    // key so two spellings of the same format collapse to one row.
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
        .select([
          "autoAcceptMinPlayers",
          "autoAcceptNotable",
          "autoAcceptOfficial",
          "competitivePlayerFloor",
          "updatedAt",
        ])
        .where("id", "=", SETTINGS_ID)
        .executeTakeFirstOrThrow();
      return row;
    },

    async updateSettings(patch: MetaSyncSettingsPatch): Promise<MetaSyncSettingsRow> {
      const row = await db
        .updateTable("metaSyncSettings")
        .set(patch)
        .where("id", "=", SETTINGS_ID)
        .returning([
          "autoAcceptMinPlayers",
          "autoAcceptNotable",
          "autoAcceptOfficial",
          "competitivePlayerFloor",
          "updatedAt",
        ])
        .executeTakeFirstOrThrow();
      return row;
    },
  };
}
