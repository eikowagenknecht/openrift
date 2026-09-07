import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { PlayloltcgEventsTable } from "../../../db/tables/meta-sources.js";
import { keyBatches, rowBatches } from "../../../lib/bind-batches.js";
import { PLAYLOLTCG_PROVIDER, PLAYLOLTCG_STATUS_FINISHED } from "../lib/playloltcg-catalog.js";

type PlayloltcgEventRow = Selectable<PlayloltcgEventsTable>;

/** `shopId` is not here: the listing never links the shop, the deep fetch sets it. */
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

export interface PlayloltcgTierInputRow {
  metaEventId: string;
  activityShopId: number;
  playerCount: number | null;
}

export interface PlayloltcgListRow extends PlayloltcgEventRow {
  triage: PlayloltcgTriage;
  metaEventId: string | null;
  metaEventSlug: string | null;
  shopDisplayName: string | null;
  nextCheckAt: Date | null;
  checkStage: number;
  fetchedAt: Date | null;
  stagedPlayerCount: number;
  stagedLegendCount: number;
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
  dateFrom?: string;
  dateTo?: string;
  missing?: boolean;
  awaitingResults?: boolean;
}

/** Defaults to newest events first. */
export interface PlayloltcgListOrder {
  sort?: "startAt" | "name" | "playerCount";
  direction?: "asc" | "desc";
}

type SqlBool = boolean;

const CATALOG_ORDER_COLUMNS = {
  startAt: sql`c.start_at`,
  name: sql`lower(c.name)`,
  playerCount: sql`c.player_count`,
};

/** Nulls sort last whichever way the column runs. */
function catalogOrderBy(order: PlayloltcgListOrder) {
  const column = CATALOG_ORDER_COLUMNS[order.sort ?? "startAt"];
  return order.direction === "asc" ? sql`${column} asc nulls last` : sql`${column} desc nulls last`;
}

export function playloltcgEventsRepo(db: Kysely<Database>) {
  /** Joined once and reused by the reads, so they can never disagree about what "accepted" means. */
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

  // Absence must be an anti-join here: reading a joined null makes the planner
  // sort the whole catalogue before taking one page. Presence reads the join.
  const notDismissed = sql<SqlBool>`not exists (
    select 1 from ignored_meta_source_events x
     where x.provider = ${PLAYLOLTCG_PROVIDER} and x.external_id = c.activity_shop_id::text
  )`;
  const notLinked = sql<SqlBool>`not exists (
    select 1 from meta_event_sources y
     where y.provider = ${PLAYLOLTCG_PROVIDER} and y.external_id = c.activity_shop_id::text
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
        fetchedAt.as("fetchedAt"),
        "me.slug as metaEventSlug",
        stagedPlayerCount.as("stagedPlayerCount"),
        stagedLegendCount.as("stagedLegendCount"),
        stagedDeckCount.as("stagedDeckCount"),
        ...joinedColumns,
      ]);
  }

  return {
    async upsertShops(shops: readonly PlayloltcgShopInput[]): Promise<number> {
      if (shops.length === 0) {
        return 0;
      }
      for (const batch of rowBatches(
        shops.map((shop) => ({ ...shop, name: shop.name.slice(0, 200) })),
      )) {
        await db
          .insertInto("playloltcgShops")
          .values(batch)
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
     * `shop_id` is never written here: the listing does not carry it, so a
     * re-catalogued row keeps the link it already has.
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
      for (const batch of rowBatches(
        rows.map((row) => ({ ...row, lastSeenAt: seenAt, missingSince: null })),
      )) {
        const written = await db
          .insertInto("playloltcgEvents")
          .values(batch)
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
      for (const batch of keyBatches(unchanged)) {
        await db
          .updateTable("playloltcgEvents")
          .set({ lastSeenAt: seenAt })
          .where("activityShopId", "in", batch)
          .execute();
      }
      return { inserted, changed, unchanged };
    },

    async markMissing(params: {
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

    /** The shop row is upserted first so the FK always holds, even for a store the registry sweep has not caught yet. */
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

    /** This source maps no template, so field size is the whole rule. */
    tierInputsForLiveEvents(): Promise<PlayloltcgTierInputRow[]> {
      return db
        .selectFrom("playloltcgEvents as e")
        .innerJoin("metaEventSources as s", (join) =>
          join
            .on("s.provider", "=", PLAYLOLTCG_PROVIDER)
            .on(sql<SqlBool>`s.external_id = e.activity_shop_id::text`),
        )
        .select(["s.metaEventId", "e.activityShopId", "e.playerCount"])
        .execute();
    },

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
          base = base.where(pagedAccepted).where(notFetched) as T;
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
        .orderBy("c.activityShopId", "desc")
        .limit(pagination.limit)
        .offset(pagination.offset)
        .execute();

      const countRow = await applyFilters(triagedQuery())
        .select(sql<string>`count(*)`.as("total"))
        .executeTakeFirstOrThrow();

      return { rows, total: Number(countRow.total) };
    },

    async dueForRecheck(now: Date, limit: number): Promise<PlayloltcgListRow[]> {
      return await listSelect()
        .where("ck.nextCheckAt", "is not", null)
        .where("ck.nextCheckAt", "<=", now)
        .orderBy("ck.nextCheckAt", "asc")
        .limit(limit)
        .execute();
    },

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

    async newKeys(): Promise<number[]> {
      const rows = await triagedQuery()
        .select("c.activityShopId")
        .where(isNew)
        .orderBy(sql`c.start_at desc nulls last`)
        .execute();
      return rows.map((row) => row.activityShopId);
    },

    async unacceptedByKeys(activityShopIds: readonly number[]): Promise<PlayloltcgListRow[]> {
      const rows: PlayloltcgListRow[] = [];
      for (const batch of keyBatches(activityShopIds)) {
        rows.push(
          ...(await listSelect().where("c.activityShopId", "in", batch).where(isNew).execute()),
        );
      }
      return rows;
    },

    /** Bridges the source's `short_code` to our card identity; deterministic, unlike matching Chinese names. */
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
      // An aggregate FILTER cannot become an anti-join, so `notFetched` here
      // would probe the mirror once per catalogue row. Pre-aggregate instead.
      const row = await triagedQuery()
        .leftJoin(
          (eb) =>
            eb
              .selectFrom("playloltcgEventStandings")
              .select("activityShopId")
              .distinct()
              .as("fetched"),
          (join) => join.onRef("fetched.activityShopId", "=", "c.activityShopId"),
        )
        .select((eb) => [
          eb.fn.countAll<string>().as("total"),
          // The source has no decklist_status column, so a finished event
          // (status 5) is the closest "results could exist" signal.
          sql<string>`count(*) filter (where c.status = ${PLAYLOLTCG_STATUS_FINISHED})`.as(
            "completed",
          ),
          sql<string>`count(*) filter (where fetched.activity_shop_id is not null)`.as(
            "decklistPublished",
          ),
          sql<string>`count(*) filter (where c.missing_since is not null)`.as("missing"),
          sql<string>`count(*) filter (where ck.next_check_at is not null and ck.next_check_at <= now())`.as(
            "dueRecheck",
          ),
          sql<string>`count(*) filter (where ck.next_check_at is not null)`.as("queued"),
          sql<string>`count(*) filter (where (${accepted}) and fetched.activity_shop_id is null)`.as(
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
