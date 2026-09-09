import type { Kysely, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

export interface GroupShopRow {
  storeId: number;
  name: string;
  location: string | null;
  upcomingCount: number;
  nextEventAt: Date | null;
}

export interface ShopSearchRow {
  storeId: number;
  name: string;
  location: string | null;
  upcomingCount: number;
}

export interface ShopEventRow {
  externalId: string;
  name: string;
  startAt: Date;
  storeId: number;
  storeName: string;
  eventFormat: string | null;
}

const SEARCH_LIMIT = 20;

// The source publishes no address on the store record, only on each event
// row, so a shop's address is read off its newest listing.
export function friendGroupShopsRepo(db: Kysely<Database>) {
  return {
    async listShops(groupId: string): Promise<GroupShopRow[]> {
      const rows = await db
        .selectFrom("friendGroupShops as fgs")
        .innerJoin("uvsgamesStores as s", "s.id", "fgs.uvsgamesStoreId")
        .select((eb) => [
          "s.id as storeId",
          "s.name as name",
          eb
            .selectFrom("uvsgamesEvents as le")
            .select("le.location")
            .whereRef("le.storeId", "=", "s.id")
            .where("le.location", "is not", null)
            .orderBy("le.startAt", "desc")
            .limit(1)
            .as("location"),
          eb
            .selectFrom("uvsgamesEvents as ce")
            .select((inner) => inner.fn.countAll<string>().as("value"))
            .whereRef("ce.storeId", "=", "s.id")
            .where(sql<SqlBool>`ce.start_at >= now() and ce.missing_since is null`)
            .as("upcomingCount"),
          eb
            .selectFrom("uvsgamesEvents as ne")
            .select((inner) => inner.fn.min<Date | null>("ne.startAt").as("value"))
            .whereRef("ne.storeId", "=", "s.id")
            .where(sql<SqlBool>`ne.start_at >= now() and ne.missing_since is null`)
            .as("nextEventAt"),
        ])
        .where("fgs.groupId", "=", groupId)
        .orderBy("s.name", "asc")
        .execute();
      return rows.map((row) => ({
        storeId: row.storeId,
        name: row.name,
        location: row.location ?? null,
        upcomingCount: Number(row.upcomingCount ?? 0),
        nextEventAt: row.nextEventAt ?? null,
      }));
    },

    countShops(groupId: string): Promise<number> {
      return db
        .selectFrom("friendGroupShops")
        .select((eb) => eb.fn.countAll<string>().as("total"))
        .where("groupId", "=", groupId)
        .executeTakeFirstOrThrow()
        .then((row) => Number(row.total));
    },

    // Only shops with a listing ahead of them are offered: a store with no
    // upcoming Riftbound event would link to a permanently empty feed.
    async searchShops(term: string): Promise<ShopSearchRow[]> {
      const pattern = `%${term.trim()}%`;
      const rows = await db
        .selectFrom("uvsgamesStores as s")
        .select((eb) => [
          "s.id as storeId",
          "s.name as name",
          eb
            .selectFrom("uvsgamesEvents as le")
            .select("le.location")
            .whereRef("le.storeId", "=", "s.id")
            .where("le.location", "is not", null)
            .orderBy("le.startAt", "desc")
            .limit(1)
            .as("location"),
          eb
            .selectFrom("uvsgamesEvents as ce")
            .select((inner) => inner.fn.countAll<string>().as("value"))
            .whereRef("ce.storeId", "=", "s.id")
            .where(sql<SqlBool>`ce.start_at >= now() and ce.missing_since is null`)
            .as("upcomingCount"),
        ])
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("uvsgamesEvents as me")
              .select("me.externalId")
              .whereRef("me.storeId", "=", "s.id")
              .where(sql<SqlBool>`me.start_at >= now() and me.missing_since is null`)
              .where((inner) =>
                inner.or([
                  inner("s.name", "ilike", pattern),
                  inner("me.location", "ilike", pattern),
                ]),
              ),
          ),
        )
        .orderBy("s.name", "asc")
        .limit(SEARCH_LIMIT)
        .execute();
      return rows.map((row) => ({
        storeId: row.storeId,
        name: row.name,
        location: row.location ?? null,
        upcomingCount: Number(row.upcomingCount ?? 0),
      }));
    },

    async linkShop(values: {
      groupId: string;
      storeId: number;
      addedByUserId: string;
    }): Promise<void> {
      await db
        .insertInto("friendGroupShops")
        .values({
          groupId: values.groupId,
          uvsgamesStoreId: values.storeId,
          addedByUserId: values.addedByUserId,
        })
        .onConflict((oc) => oc.columns(["groupId", "uvsgamesStoreId"]).doNothing())
        .execute();
    },

    async unlinkShop(groupId: string, storeId: number): Promise<boolean> {
      const result = await db
        .deleteFrom("friendGroupShops")
        .where("groupId", "=", groupId)
        .where("uvsgamesStoreId", "=", storeId)
        .executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    storeExists(storeId: number): Promise<boolean> {
      return db
        .selectFrom("uvsgamesStores")
        .select("id")
        .where("id", "=", storeId)
        .executeTakeFirst()
        .then((row) => row !== undefined);
    },

    listEventsInWindow(
      groupId: string,
      pastDays: number,
      horizonDays: number,
    ): Promise<ShopEventRow[]> {
      return db
        .selectFrom("friendGroupShops as fgs")
        .innerJoin("uvsgamesStores as s", "s.id", "fgs.uvsgamesStoreId")
        .innerJoin("uvsgamesEvents as e", "e.storeId", "s.id")
        .select([
          "e.externalId as externalId",
          "e.name as name",
          "e.startAt as startAt",
          "s.id as storeId",
          "s.name as storeName",
          "e.eventFormat as eventFormat",
        ])
        .where("fgs.groupId", "=", groupId)
        .where("e.missingSince", "is", null)
        .where(sql<SqlBool>`e.start_at >= now() - make_interval(days => ${pastDays})`)
        .where(sql<SqlBool>`e.start_at < now() + make_interval(days => ${horizonDays})`)
        .orderBy("e.startAt", "asc")
        .orderBy("e.externalId", "asc")
        .execute();
    },
  };
}
