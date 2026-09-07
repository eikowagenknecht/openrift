import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, TopdeckEventsTable } from "../../../db/index.js";
import { keyBatches, rowBatches } from "../../../lib/bind-batches.js";
import { TOPDECK_PROVIDER } from "../lib/topdeck-catalog.js";

type TopdeckEventRow = Selectable<TopdeckEventsTable>;

/** The projection one search row upserts, minus the crawl bookkeeping. */
export interface TopdeckUpsertInput {
  tid: string;
  name: string;
  format: string;
  startAt: Date;
  swissRounds: number | null;
  topCut: number | null;
  playerCount: number | null;
  isTeamEvent: boolean;
  teamSize: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  contentHash: string;
}

export interface TopdeckUpsertResult {
  inserted: string[];
  changed: string[];
  unchanged: string[];
}

export type TopdeckTriage = "new" | "accepted" | "dismissed";

export interface TopdeckTierInputRow {
  metaEventId: string;
  tid: string;
  playerCount: number | null;
}

export interface TopdeckListRow extends TopdeckEventRow {
  triage: TopdeckTriage;
  metaEventId: string | null;
  metaEventSlug: string | null;
  fetchedAt: Date | null;
  stagedPlayerCount: number;
  stagedLegendCount: number;
  stagedDeckCount: number;
  rivalProvider: string | null;
}

export interface TopdeckTriageCounts {
  new: number;
  accepted: number;
  dismissed: number;
}

export interface TopdeckListFilters {
  search?: string;
  format?: string;
  triage?: TopdeckTriage;
  minPlayers?: number;
  dateFrom?: string;
  dateTo?: string;
  missing?: boolean;
}

/** How one page of the catalogue is ordered. Defaults to newest events first. */
export interface TopdeckListOrder {
  sort?: "startAt" | "name" | "playerCount";
  direction?: "asc" | "desc";
}

type SqlBool = boolean;

const RESULTS_PENDING = "pending";

const CATALOG_ORDER_COLUMNS = {
  startAt: sql`c.start_at`,
  name: sql`lower(c.name)`,
  playerCount: sql`c.player_count`,
};

function catalogOrderBy(order: TopdeckListOrder) {
  const column = CATALOG_ORDER_COLUMNS[order.sort ?? "startAt"];
  return order.direction === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
}

export function topdeckEventsRepo(db: Kysely<Database>) {
  /** Joined once and reused, so the reads cannot disagree about what "accepted" means. */
  function triagedQuery() {
    return db
      .selectFrom("topdeckEvents as c")
      .leftJoin("metaEventSources as src", (join) =>
        join.on("src.provider", "=", TOPDECK_PROVIDER).onRef("src.externalId", "=", "c.tid"),
      )
      .leftJoin("metaEvents as me", "me.id", "src.metaEventId")
      .leftJoin("ignoredMetaSourceEvents as i", (join) =>
        join.on("i.provider", "=", TOPDECK_PROVIDER).onRef("i.externalId", "=", "c.tid"),
      );
  }

  const triage = sql<TopdeckTriage>`case
    when i.provider is not null then 'dismissed'
    when src.meta_event_id is not null then 'accepted'
    else 'new'
  end`;

  const fetchedAt = sql<Date | null>`(
    select max(st.fetched_at) from topdeck_event_standings st where st.tid = c.tid
  )`;

  // Correlated against the mirror: an index lookup per page row, not an aggregate over the whole archive.
  const stagedPlayerCount = sql<number>`(
    select count(*)::int from topdeck_event_standings st where st.tid = c.tid
  )`;

  const stagedLegendCount = sql<number>`(
    select count(*)::int from topdeck_event_standings st
     where st.tid = c.tid and st.legend_name is not null
  )`;

  const stagedDeckCount = sql<number>`(
    select count(*)::int from topdeck_decklists dl
     where dl.tid = c.tid and dl.fetch_status = 'fetched'
  )`;

  /**
   * Null until accepted, for an event only this source describes, or once the
   * cross-mirror review has let this citation contribute.
   */
  const rivalProvider = sql<string | null>`(
    case when src.contributes then null else (
      select min(o.provider) from meta_event_sources o
       where o.meta_event_id = src.meta_event_id
         and o.provider is not null
         and o.provider <> ${TOPDECK_PROVIDER}
    ) end
  )`;

  const isNew = sql<SqlBool>`i.provider is null and src.meta_event_id is null`;
  const accepted = sql<SqlBool>`i.provider is null and src.meta_event_id is not null`;

  // Absence must be an anti-join here: reading a joined null makes the planner
  // sort the whole catalogue before taking one page. Presence reads the join.
  const notDismissed = sql<SqlBool>`not exists (
    select 1 from ignored_meta_source_events x
     where x.provider = ${TOPDECK_PROVIDER} and x.external_id = c.tid
  )`;
  const notLinked = sql<SqlBool>`not exists (
    select 1 from meta_event_sources y
     where y.provider = ${TOPDECK_PROVIDER} and y.external_id = c.tid
       and y.meta_event_id is not null
  )`;
  const pagedNew = sql<SqlBool>`${notDismissed} and ${notLinked}`;
  const pagedAccepted = sql<SqlBool>`${notDismissed} and src.meta_event_id is not null`;
  const pagedDismissed = sql<SqlBool>`i.provider is not null`;

  function listSelect() {
    return triagedQuery()
      .selectAll("c")
      .select([
        triage.as("triage"),
        "src.metaEventId as metaEventId",
        "me.slug as metaEventSlug",
        fetchedAt.as("fetchedAt"),
        stagedPlayerCount.as("stagedPlayerCount"),
        stagedLegendCount.as("stagedLegendCount"),
        stagedDeckCount.as("stagedDeckCount"),
        rivalProvider.as("rivalProvider"),
      ]);
  }

  return {
    /** Hash-gated: an unchanged row costs one `last_seen_at` write. */
    async upsertBatch(
      rows: readonly TopdeckUpsertInput[],
      seenAt: Date,
    ): Promise<TopdeckUpsertResult> {
      if (rows.length === 0) {
        return { inserted: [], changed: [], unchanged: [] };
      }
      const inserted: string[] = [];
      const changed: string[] = [];
      for (const batch of rowBatches(
        rows.map((row) => ({ ...row, lastSeenAt: seenAt, missingSince: null })),
      )) {
        const written = await db
          .insertInto("topdeckEvents")
          .values(batch)
          .onConflict((oc) =>
            oc
              .columns(["tid"])
              .doUpdateSet((eb) => ({
                name: eb.ref("excluded.name"),
                format: eb.ref("excluded.format"),
                startAt: eb.ref("excluded.startAt"),
                swissRounds: eb.ref("excluded.swissRounds"),
                topCut: eb.ref("excluded.topCut"),
                playerCount: eb.ref("excluded.playerCount"),
                isTeamEvent: eb.ref("excluded.isTeamEvent"),
                teamSize: eb.ref("excluded.teamSize"),
                city: eb.ref("excluded.city"),
                state: eb.ref("excluded.state"),
                country: eb.ref("excluded.country"),
                address: eb.ref("excluded.address"),
                longitude: eb.ref("excluded.longitude"),
                latitude: eb.ref("excluded.latitude"),
                contentHash: eb.ref("excluded.contentHash"),
                lastSeenAt: eb.ref("excluded.lastSeenAt"),
                missingSince: eb.ref("excluded.missingSince"),
              }))
              .where(
                sql<SqlBool>`topdeck_events.content_hash is distinct from excluded.content_hash
                or topdeck_events.missing_since is not null`,
              ),
          )
          .returning(["tid", sql<boolean>`(xmax = 0)`.as("inserted")])
          .execute();

        for (const row of written) {
          (row.inserted ? inserted : changed).push(row.tid);
        }
      }

      const touched = new Set([...inserted, ...changed]);
      const unchanged = rows.map((row) => row.tid).filter((tid) => !touched.has(tid));
      for (const batch of keyBatches(unchanged)) {
        await db
          .updateTable("topdeckEvents")
          .set({ lastSeenAt: seenAt })
          .where("tid", "in", batch)
          .execute();
      }
      return { inserted, changed, unchanged };
    },

    /** A sentinel no real hash equals, so the next pass reads the row as changed and rewrites its results. */
    async requeueResults(tids: readonly string[]): Promise<void> {
      for (const batch of keyBatches(tids)) {
        await db
          .updateTable("topdeckEvents")
          .set({ contentHash: RESULTS_PENDING })
          .where("tid", "in", batch)
          .execute();
      }
    },

    async markMissing(params: {
      from: Date;
      to: Date;
      format: string;
      seenBefore: Date;
      at: Date;
    }): Promise<number> {
      const result = await db
        .updateTable("topdeckEvents")
        .set({ missingSince: params.at })
        .where("format", "=", params.format)
        .where("startAt", ">=", params.from)
        .where("startAt", "<=", params.to)
        .where("lastSeenAt", "<", params.seenBefore)
        .where("missingSince", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows ?? 0n);
    },

    async byKey(tid: string): Promise<TopdeckListRow | undefined> {
      return await listSelect().where("c.tid", "=", tid).executeTakeFirst();
    },

    tierInputsForLiveEvents(): Promise<TopdeckTierInputRow[]> {
      return db
        .selectFrom("topdeckEvents as e")
        .innerJoin("metaEventSources as s", (join) =>
          join.on("s.provider", "=", TOPDECK_PROVIDER).onRef("s.externalId", "=", "e.tid"),
        )
        .select(["s.metaEventId", "e.tid", "e.playerCount"])
        .execute();
    },

    async list(
      filters: TopdeckListFilters,
      pagination: { limit: number; offset: number },
      order: TopdeckListOrder = {},
    ): Promise<{ rows: TopdeckListRow[]; total: number }> {
      const applyFilters = <T extends ReturnType<typeof triagedQuery>>(q: T): T => {
        let base = q;
        if (filters.search !== undefined && filters.search.trim() !== "") {
          const like = `%${filters.search.trim()}%`;
          base = base.where((eb) =>
            eb.or([eb("c.name", "ilike", like), eb("c.city", "ilike", like)]),
          ) as T;
        }
        if (filters.format !== undefined) {
          base = base.where("c.format", "=", filters.format) as T;
        }
        if (filters.minPlayers !== undefined) {
          base = base.where("c.playerCount", ">=", filters.minPlayers) as T;
        }
        // `start_at` is an instant, so a day bound is a half-open range on it.
        if (filters.dateFrom !== undefined) {
          base = base.where(sql<SqlBool>`c.start_at >= ${filters.dateFrom}::date`) as T;
        }
        if (filters.dateTo !== undefined) {
          base = base.where(
            sql<SqlBool>`c.start_at < (${filters.dateTo}::date + interval '1 day')`,
          ) as T;
        }
        if (filters.missing === true) {
          base = base.where("c.missingSince", "is not", null) as T;
        }
        if (filters.triage === "new") {
          base = base.where(pagedNew) as T;
        } else if (filters.triage === "accepted") {
          base = base.where(pagedAccepted) as T;
        } else if (filters.triage === "dismissed") {
          base = base.where(pagedDismissed) as T;
        }
        return base;
      };

      const rows = await applyFilters(listSelect())
        .orderBy(catalogOrderBy(order))
        // Ties on the sort column are common (a locals night files every store
        // on the same day), so the key breaks them and keeps paging stable.
        .orderBy("c.tid", "desc")
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute();

      const countRow = await applyFilters(triagedQuery())
        .select(sql<string>`count(*)`.as("total"))
        .executeTakeFirstOrThrow();

      return { rows, total: Number(countRow.total) };
    },

    async newKeys(): Promise<string[]> {
      const rows = await triagedQuery()
        .select("c.tid")
        .where(isNew)
        .orderBy(sql`c.start_at desc nulls last`)
        .execute();
      return rows.map((row) => row.tid);
    },

    async unacceptedByKeys(tids: readonly string[]): Promise<TopdeckListRow[]> {
      const rows: TopdeckListRow[] = [];
      for (const batch of keyBatches(tids)) {
        rows.push(...(await listSelect().where("c.tid", "in", batch).where(isNew).execute()));
      }
      return rows;
    },

    /** The card bridge: a `short_code` resolves where a name does not, since our catalogue spells a legend by its epithet alone. */
    async cardsByShortCode(
      shortCodes: readonly string[],
    ): Promise<Map<string, { cardId: string; name: string; type: string }>> {
      if (shortCodes.length === 0) {
        return new Map();
      }
      const map = new Map<string, { cardId: string; name: string; type: string }>();
      for (const batch of keyBatches([...new Set(shortCodes)])) {
        const rows = await db
          .selectFrom("printings as p")
          .innerJoin("cards as c", "c.id", "p.cardId")
          .where("p.language", "=", "EN")
          .where("p.shortCode", "in", batch)
          .select([
            "p.shortCode as shortCode",
            "c.id as cardId",
            "c.name as name",
            "c.type as type",
          ])
          .execute();
        // Multiple printings share a short_code (finishes, variants); they are
        // the same card, so the first wins.
        for (const row of rows) {
          if (!map.has(row.shortCode)) {
            map.set(row.shortCode, { cardId: row.cardId, name: row.name, type: row.type });
          }
        }
      }
      return map;
    },

    /** The three queue counters are always zero, not a stub: one search writes an event's results with the event. */
    async syncOverview(): Promise<{
      total: number;
      completed: number;
      decklistPublished: number;
      missing: number;
      queued: number;
      dueRecheck: number;
      acceptedAwaitingResults: number;
      acceptedMissing: number;
      lastSeenAt: Date | null;
    }> {
      const row = await triagedQuery()
        .select((eb) => [
          eb.fn.countAll<string>().as("total"),
          // The search returns completed tournaments, so an event whose payload
          // carried standings is one whose results are published.
          sql<string>`count(*) filter (where c.player_count > 0)`.as("completed"),
          sql<string>`count(*) filter (where exists (
            select 1 from topdeck_decklists dl where dl.tid = c.tid
          ))`.as("decklistPublished"),
          sql<string>`count(*) filter (where c.missing_since is not null)`.as("missing"),
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
        queued: 0,
        dueRecheck: 0,
        acceptedAwaitingResults: 0,
        acceptedMissing: Number(row.acceptedMissing),
        lastSeenAt: row.lastSeenAt,
      };
    },

    async triageCounts(): Promise<TopdeckTriageCounts> {
      const row = await triagedQuery()
        .select([
          sql<number>`count(*) filter (where i.provider is null and src.meta_event_id is null)::int`.as(
            "new",
          ),
          sql<number>`count(*) filter (where i.provider is null and src.meta_event_id is not null)::int`.as(
            "accepted",
          ),
          sql<number>`count(*) filter (where i.provider is not null)::int`.as("dismissed"),
        ])
        .executeTakeFirstOrThrow();
      return {
        new: Number(row.new),
        accepted: Number(row.accepted),
        dismissed: Number(row.dismissed),
      };
    },
  };
}
