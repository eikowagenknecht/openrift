import { META_CATALOG_PROVIDERS } from "@openrift/shared/types/enums";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { MetaEventSourcesTable } from "../../../db/tables/meta.js";

/**
 * One citation on an event: where a slice of its data came from. Public, and
 * never a contributor — a person is credited through {@link MetaContributorRow}
 * instead.
 */
export type MetaEventSourceRow = Selectable<MetaEventSourcesTable>;

/** The providers promotion reads a mirror for, as opposed to a push provider. */
const MIRROR_PROVIDERS: ReadonlySet<string> = new Set(META_CATALOG_PROVIDERS);

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

export function metaSourcesRepo(db: Kysely<Database>) {
  return {
    /** Every citation there is, for a pass that walks the whole archive. */
    allSources(): Promise<MetaEventSourceRow[]> {
      return db.selectFrom("metaEventSources").selectAll().execute();
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

    /** The only link between a mirror and live event; accept and promotion resolve through it. */
    sourceByKey(provider: string, externalId: string): Promise<MetaEventSourceRow | undefined> {
      return db
        .selectFrom("metaEventSources")
        .selectAll()
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
    },

    eventSourceById(id: string): Promise<MetaEventSourceRow | undefined> {
      return db.selectFrom("metaEventSources").selectAll().where("id", "=", id).executeTakeFirst();
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

    /** A second mirror on an event is cited but not read, since nothing merges a player across two mirrors yet. */
    async insertEventSource(input: MetaEventSourceInput): Promise<MetaEventSourceRow> {
      const provider = input.provider;
      const rival =
        provider !== null && MIRROR_PROVIDERS.has(provider)
          ? await db
              .selectFrom("metaEventSources")
              .select("id")
              .where("metaEventId", "=", input.metaEventId)
              .where("provider", "is not", null)
              .where("provider", "!=", provider)
              .where("provider", "in", [...MIRROR_PROVIDERS])
              .where("contributes", "=", true)
              .executeTakeFirst()
          : undefined;
      return await db
        .insertInto("metaEventSources")
        .values({ ...input, contributes: rival === undefined })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** Turns a cited-but-unread source back on, once its players are linked. */
    async setEventSourceContributes(id: string, contributes: boolean): Promise<boolean> {
      const result = await db
        .updateTable("metaEventSources")
        .set({ contributes })
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numUpdatedRows ?? 0n) > 0;
    },

    async deleteEventSource(id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("metaEventSources")
        .where("id", "=", id)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },

    async deleteEventSourceByKey(provider: string, externalId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("metaEventSources")
        .where("provider", "=", provider)
        .where("externalId", "=", externalId)
        .executeTakeFirst();
      return (result.numDeletedRows ?? 0n) > 0n;
    },
  };
}
