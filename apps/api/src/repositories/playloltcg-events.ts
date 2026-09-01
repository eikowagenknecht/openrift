import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, PlayloltcgEventsTable } from "../db/index.js";
import { PLAYLOLTCG_PROVIDER, PLAYLOLTCG_STATUS_FINISHED } from "../lib/playloltcg-catalog.js";

type PlayloltcgEventRow = Selectable<PlayloltcgEventsTable>;

/** The projection one listing row upserts, minus the crawl bookkeeping. `shopId` is not here — the listing never links the shop; the deep fetch sets it. */
export interface PlayloltcgUpsertInput {
  activityShopId: number;
  shopName: string | null;
  name: string;
  activityType: string | null;
  activityTypeName: string | null;
  battleMode: string | null;
  status: number | null;
  /** `YYYY-MM-DD`: `start_at` and `end_at` are `date` columns, not instants. */
  startAt: string | null;
  endAt: string | null;
  playerCount: number | null;
  maxUser: number | null;
  fee: number | null;
  province: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
  contentHash: string;
}

export interface PlayloltcgUpsertResult {
  inserted: number[];
  changed: number[];
  unchanged: number[];
}

/** A shop as the registry gives it, for the directory upsert. */
export interface PlayloltcgShopInput {
  id: number;
  name: string;
  province: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  longitude: number | null;
  latitude: number | null;
}

export type PlayloltcgTriage = "new" | "accepted" | "dismissed";

export interface PlayloltcgListRow extends PlayloltcgEventRow {
  triage: PlayloltcgTriage;
  metaEventId: string | null;
  metaEventSlug: string | null;
  /** The linked shop's current name over the row's own fallback. */
  shopDisplayName: string | null;
  nextCheckAt: Date | null;
  checkStage: number;
  /** When the deep fetch last landed; null before the first fetch. */
  fetchedAt: Date | null;
  /** Standings rows this source's mirror holds; zero before the first fetch. */
  stagedPlayerCount: number;
  /** The mirrored rows whose legend is known. */
  stagedLegendCount: number;
  /** The staged decks the fetch actually got back. */
  stagedDeckCount: number;
}

export interface PlayloltcgTriageCounts {
  new: number;
  accepted: number;
  dismissed: number;
}

export interface PlayloltcgListFilters {
  search?: string;
  status?: number;
  triage?: PlayloltcgTriage;
  minPlayers?: number;
  /** Inclusive `YYYY-MM-DD` bounds on `start_at`, which is a date column. */
  dateFrom?: string;
  dateTo?: string;
  /** True keeps only rows a covering crawl stopped returning. */
  missing?: boolean;
  /** True keeps only accepted rows whose results were never fetched. */
  awaitingResults?: boolean;
}

/** How one page of the catalogue is ordered. Defaults to newest events first. */
export interface PlayloltcgListOrder {
  sort?: "startAt" | "name" | "playerCount";
  direction?: "asc" | "desc";
}

type SqlBool = boolean;

// A crawl page carries up to MAX_PAGE_SIZE (10_000) rows and the event upsert
// binds 21 columns each, which is 210k parameters against postgres.js's ~65k
// limit. 1000 keeps the widest write here at 21k.
const BATCH_SIZE = 1000;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

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
function catalogOrderBy(order: PlayloltcgListOrder) {
  const column = CATALOG_ORDER_COLUMNS[order.sort ?? "startAt"];
  return order.direction === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
}

export function playloltcgEventsRepo(db: Kysely<Database>) {
  /**
   * Joined once and reused by the reads, so they can never disagree about what
   * "accepted" means. The citation side is provider-keyed on the event id as
   * text (`meta_event_sources.external_id` is text).
   */
  function triagedQuery() {
    return db
      .selectFrom("playloltcgEvents as c")
      .leftJoin("metaEventSources as src", (join) =>
        join
          .on("src.provider", "=", PLAYLOLTCG_PROVIDER)
          .on(sql<SqlBool>`src.external_id = c.activity_shop_id::text`),
      )
      .leftJoin("metaEvents as me", "me.id", "src.metaEventId")
      .leftJoin("ignoredMetaSourceEvents as i", (join) =>
        join
          .on("i.provider", "=", PLAYLOLTCG_PROVIDER)
          .on(sql<SqlBool>`i.external_id = c.activity_shop_id::text`),
      )
      .leftJoin("playloltcgShops as s", "s.id", "c.shopId")
      .leftJoin("playloltcgEventChecks as ck", "ck.activityShopId", "c.activityShopId");
  }

  const joinedColumns = [
    sql<string | null>`coalesce(s.name, c.shop_name)`.as("shopDisplayName"),
    sql<Date | null>`ck.next_check_at`.as("nextCheckAt"),
    sql<number>`coalesce(ck.check_stage, 0)`.as("checkStage"),
  ];

  const triage = sql<PlayloltcgTriage>`case
    when i.provider is not null then 'dismissed'
    when src.meta_event_id is not null then 'accepted'
    else 'new'
  end`;

  const fetchedAt = sql<Date | null>`(
    select max(st.fetched_at) from playloltcg_event_standings st
     where st.activity_shop_id = c.activity_shop_id
  )`;
  const notFetched = sql<SqlBool>`not exists (
    select 1 from playloltcg_event_standings st
     where st.activity_shop_id = c.activity_shop_id
  )`;

  // Correlated against the mirror, so each one is an index lookup on the page's
  // rows rather than an aggregate over every event the archive has fetched.
  const stagedPlayerCount = sql<number>`(
    select count(*)::int from playloltcg_event_standings st
     where st.activity_shop_id = c.activity_shop_id
  )`;

  const stagedLegendCount = sql<number>`(
    select count(*)::int from playloltcg_event_standings st
     where st.activity_shop_id = c.activity_shop_id and st.legend_name is not null
  )`;

  const stagedDeckCount = sql<number>`(
    select count(*)::int from playloltcg_decklists dl
     where dl.activity_shop_id = c.activity_shop_id and dl.fetch_status = 'fetched'
  )`;

  const isNew = sql<SqlBool>`i.provider is null and src.meta_event_id is null`;
  const accepted = sql<SqlBool>`i.provider is null and src.meta_event_id is not null`;

  function listSelect() {
    return triagedQuery()
      .selectAll("c")
      .select([
        triage.as("triage"),
        "src.metaEventId as metaEventId",
        fetchedAt.as("fetchedAt"),
        "me.slug as metaEventSlug",
        stagedPlayerCount.as("stagedPlayerCount"),
        stagedLegendCount.as("stagedLegendCount"),
        stagedDeckCount.as("stagedDeckCount"),
        ...joinedColumns,
      ]);
  }

  return {
    /** Upserts the registry rows the store directory is built from. */
    async upsertShops(shops: readonly PlayloltcgShopInput[]): Promise<number> {
      if (shops.length === 0) {
        return 0;
      }
      for (const batch of chunk(shops, BATCH_SIZE)) {
        await db
          .insertInto("playloltcgShops")
          .values(batch.map((shop) => ({ ...shop, name: shop.name.slice(0, 200) })))
          .onConflict((oc) =>
            oc.column("id").doUpdateSet((eb) => ({
              name: eb.ref("excluded.name"),
              province: eb.ref("excluded.province"),
              city: eb.ref("excluded.city"),
              area: eb.ref("excluded.area"),
              address: eb.ref("excluded.address"),
              longitude: eb.ref("excluded.longitude"),
              latitude: eb.ref("excluded.latitude"),
            })),
          )
          .execute();
      }
      return shops.length;
    },

    /**
     * Hash-gated batch upsert. An unchanged row costs one `last_seen_at` write.
     * `shop_id` is never written here — the listing does not carry it, and the
     * deep fetch owns it — so a re-catalogued row keeps the link it already has.
     */
    async upsertBatch(
      rows: readonly PlayloltcgUpsertInput[],
      seenAt: Date,
    ): Promise<PlayloltcgUpsertResult> {
      if (rows.length === 0) {
        return { inserted: [], changed: [], unchanged: [] };
      }
      const inserted: number[] = [];
      const changed: number[] = [];
      for (const batch of chunk(rows, BATCH_SIZE)) {
        const written = await db
          .insertInto("playloltcgEvents")
          .values(batch.map((row) => ({ ...row, lastSeenAt: seenAt, missingSince: null })))
          .onConflict((oc) =>
            oc
              .columns(["activityShopId"])
              .doUpdateSet((eb) => ({
                shopName: eb.ref("excluded.shopName"),
                name: eb.ref("excluded.name"),
                activityType: eb.ref("excluded.activityType"),
                activityTypeName: eb.ref("excluded.activityTypeName"),
                battleMode: eb.ref("excluded.battleMode"),
                status: eb.ref("excluded.status"),
                startAt: eb.ref("excluded.startAt"),
                endAt: eb.ref("excluded.endAt"),
                playerCount: eb.ref("excluded.playerCount"),
                maxUser: eb.ref("excluded.maxUser"),
                fee: eb.ref("excluded.fee"),
                province: eb.ref("excluded.province"),
                city: eb.ref("excluded.city"),
                area: eb.ref("excluded.area"),
                address: eb.ref("excluded.address"),
                longitude: eb.ref("excluded.longitude"),
                latitude: eb.ref("excluded.latitude"),
                contentHash: eb.ref("excluded.contentHash"),
                lastSeenAt: eb.ref("excluded.lastSeenAt"),
                missingSince: eb.ref("excluded.missingSince"),
              }))
              .where(
                sql<SqlBool>`playloltcg_events.content_hash is distinct from excluded.content_hash
                or playloltcg_events.missing_since is not null`,
              ),
          )
          .returning(["activityShopId", sql<boolean>`(xmax = 0)`.as("inserted")])
          .execute();

        for (const row of written) {
          (row.inserted ? inserted : changed).push(row.activityShopId);
        }
      }

      const touched = new Set([...inserted, ...changed]);
      const unchanged = rows.map((row) => row.activityShopId).filter((id) => !touched.has(id));
      for (const batch of chunk(unchanged, BATCH_SIZE)) {
        await db
          .updateTable("playloltcgEvents")
          .set({ lastSeenAt: seenAt })
          .where("activityShopId", "in", batch)
          .execute();
      }
      return { inserted, changed, unchanged };
    },

    /** Flags rows a covering crawl no longer returned, over a start-date range. */
    async markMissing(params: {
      /** `YYYY-MM-DD` bounds, inclusive, against the `start_at` date column. */
      from: string;
      to: string;
      seenBefore: Date;
      at: Date;
    }): Promise<number> {
      const result = await db
        .updateTable("playloltcgEvents")
        .set({ missingSince: params.at })
        .where("startAt", ">=", params.from)
        .where("startAt", "<=", params.to)
        .where("lastSeenAt", "<", params.seenBefore)
        .where("missingSince", "is", null)
        .executeTakeFirst();
      return Number(result.numUpdatedRows ?? 0n);
    },

    /**
     * Links an event to its shop from the `activityShop/info` detail, the only
     * place the source exposes the id. The shop row is upserted first so the FK
     * always holds, even for a store the registry sweep has not caught yet.
     */
    async linkShopFromDetail(
      activityShopId: number,
      shop: { id: number; name: string },
    ): Promise<void> {
      await db
        .insertInto("playloltcgShops")
        .values({ id: shop.id, name: shop.name.slice(0, 200) })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet((eb) => ({ name: eb.ref("excluded.name") })),
        )
        .execute();
      await db
        .updateTable("playloltcgEvents")
        .set({ shopId: shop.id })
        .where("activityShopId", "=", activityShopId)
        .execute();
    },

    async byKey(activityShopId: number): Promise<PlayloltcgListRow | undefined> {
      return await listSelect().where("c.activityShopId", "=", activityShopId).executeTakeFirst();
    },

    /** The catalogue triage list: filtered, triaged, ordered, paginated. */
    async list(
      filters: PlayloltcgListFilters,
      pagination: { limit: number; offset: number },
      order: PlayloltcgListOrder = {},
    ): Promise<{ rows: PlayloltcgListRow[]; total: number }> {
      const applyFilters = <T extends ReturnType<typeof triagedQuery>>(q: T): T => {
        let base = q;
        if (filters.search !== undefined && filters.search.trim() !== "") {
          const like = `%${filters.search.trim()}%`;
          base = base.where((eb) =>
            eb.or([eb("c.name", "ilike", like), eb("c.shopName", "ilike", like)]),
          ) as T;
        }
        if (filters.status !== undefined) {
          base = base.where("c.status", "=", filters.status) as T;
        }
        if (filters.minPlayers !== undefined) {
          base = base.where("c.playerCount", ">=", filters.minPlayers) as T;
        }
        if (filters.dateFrom !== undefined) {
          base = base.where("c.startAt", ">=", filters.dateFrom) as T;
        }
        if (filters.dateTo !== undefined) {
          base = base.where("c.startAt", "<=", filters.dateTo) as T;
        }
        if (filters.missing === true) {
          base = base.where("c.missingSince", "is not", null) as T;
        }
        if (filters.awaitingResults === true) {
          base = base.where(accepted).where(notFetched) as T;
        }
        if (filters.triage === "new") {
          base = base.where(isNew) as T;
        } else if (filters.triage === "accepted") {
          base = base.where(accepted) as T;
        } else if (filters.triage === "dismissed") {
          base = base.where(sql<SqlBool>`i.provider is not null`) as T;
        }
        return base;
      };

      const rows = await applyFilters(listSelect())
        .orderBy(catalogOrderBy(order))
        // Ties on the sort column are common (a locals night files every store
        // on the same day), so the key breaks them and keeps paging stable.
        .orderBy("c.activityShopId", "desc")
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute();

      const countRow = await applyFilters(triagedQuery())
        .select(sql<string>`count(*)`.as("total"))
        .executeTakeFirstOrThrow();

      return { rows, total: Number(countRow.total) };
    },

    /** Accepted events whose next visit is due, oldest first. */
    async dueForRecheck(now: Date, limit: number): Promise<PlayloltcgListRow[]> {
      return await listSelect()
        .where("ck.nextCheckAt", "is not", null)
        .where("ck.nextCheckAt", "<=", now)
        .orderBy("ck.nextCheckAt", "asc")
        .limit(limit)
        .execute();
    },

    /** Arms or advances one event's place in the recheck queue. */
    async setRecheck(
      activityShopId: number,
      values: { nextCheckAt: Date | null; checkStage: number },
    ): Promise<void> {
      await db
        .insertInto("playloltcgEventChecks")
        .values({ activityShopId, ...values })
        .onConflict((oc) => oc.column("activityShopId").doUpdateSet(values))
        .execute();
    },

    /** The keys a crawl touched that are neither accepted nor dismissed. */
    async unacceptedByKeys(activityShopIds: readonly number[]): Promise<PlayloltcgListRow[]> {
      const rows: PlayloltcgListRow[] = [];
      for (const batch of chunk(activityShopIds, BATCH_SIZE)) {
        rows.push(
          ...(await listSelect().where("c.activityShopId", "in", batch).where(isNew).execute()),
        );
      }
      return rows;
    },

    /**
     * The card bridge: the source's normalized `cardNo` (`short_code`) to our
     * Simplified-Chinese card identity. The deep fetch resolves decks through
     * this — deterministic, unlike matching Chinese names — and passes the
     * canonical card name on to the shared ingest.
     */
    async cardsByShortCode(
      shortCodes: readonly string[],
    ): Promise<Map<string, { cardId: string; name: string; type: string }>> {
      if (shortCodes.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .where("p.language", "=", "SC")
        .where("p.shortCode", "in", [...new Set(shortCodes)])
        .select(["p.shortCode as shortCode", "c.id as cardId", "c.name as name", "c.type as type"])
        .execute();
      // Multiple printings share a short_code (finishes, variants); they are the
      // same card, so the first wins.
      const map = new Map<string, { cardId: string; name: string; type: string }>();
      for (const row of rows) {
        if (!map.has(row.shortCode)) {
          map.set(row.shortCode, { cardId: row.cardId, name: row.name, type: row.type });
        }
      }
      return map;
    },

    /** The mirror + queue overview, parallel to uvsgames `syncOverview`. */
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
          // The source has no decklist_status column. A finished event (status 5)
          // is the closest "results could exist" signal, and because the source
          // publishes standings and decks in one act, an event whose deep fetch
          // landed is one whose decklists are published as far as we can know.
          sql<string>`count(*) filter (where c.status = ${PLAYLOLTCG_STATUS_FINISHED})`.as(
            "completed",
          ),
          sql<string>`count(*) filter (where not (${notFetched}))`.as("decklistPublished"),
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

    async triageCounts(): Promise<PlayloltcgTriageCounts> {
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
