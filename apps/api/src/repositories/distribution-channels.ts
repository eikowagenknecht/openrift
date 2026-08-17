import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { reorderBySortOrder } from "./sort-order.js";

type DistributionChannelKind = "event" | "product";

export function distributionChannelsRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db
        .selectFrom("distributionChannels")
        .selectAll()
        .orderBy("kind")
        .orderBy("sortOrder")
        .orderBy("label")
        .execute();
    },

    listBySlugs(slugs: readonly string[]) {
      if (slugs.length === 0) {
        return Promise.resolve([]);
      }
      return db.selectFrom("distributionChannels").selectAll().where("slug", "in", slugs).execute();
    },

    getById(id: string) {
      return db
        .selectFrom("distributionChannels")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    getBySlug(slug: string) {
      return db
        .selectFrom("distributionChannels")
        .selectAll()
        .where("slug", "=", slug)
        .executeTakeFirst();
    },

    /**
     * Max sort order among siblings of a given parent (NULL = root level).
     * Scoped per-parent so new roots and new children don't collide on ordering.
     *
     * @returns The largest sort_order among siblings, or -1 if the group is empty.
     */
    async getMaxSortOrderForParent(parentId: string | null): Promise<number> {
      let query = db
        .selectFrom("distributionChannels")
        .select((eb) => eb.fn.max("sortOrder").as("maxSortOrder"));
      query =
        parentId === null
          ? query.where("parentId", "is", null)
          : query.where("parentId", "=", parentId);
      const row = await query.executeTakeFirst();
      return row?.maxSortOrder ?? -1;
    },

    create(values: {
      slug: string;
      label: string;
      description?: string | null;
      kind?: DistributionChannelKind;
      sortOrder?: number;
      parentId?: string | null;
      childrenLabel?: string | null;
    }) {
      return db
        .insertInto("distributionChannels")
        .values({
          slug: values.slug,
          label: values.label,
          description: values.description ?? null,
          parentId: values.parentId ?? null,
          childrenLabel: values.childrenLabel ?? null,
          ...(values.kind === undefined ? {} : { kind: values.kind }),
          ...(values.sortOrder === undefined ? {} : { sortOrder: values.sortOrder }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    reorder(ids: readonly string[]): Promise<void> {
      return reorderBySortOrder(db, {
        table: "distributionChannels",
        keyColumn: "id",
        keys: ids,
        keyType: "uuid",
      });
    },

    update(
      id: string,
      updates: {
        slug?: string;
        label?: string;
        description?: string | null;
        kind?: DistributionChannelKind;
        parentId?: string | null;
        childrenLabel?: string | null;
        sortOrder?: number;
        updatedAt?: Date;
      },
    ) {
      return db
        .updateTable("distributionChannels")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
    },

    deleteById(id: string) {
      return db.deleteFrom("distributionChannels").where("id", "=", id).executeTakeFirstOrThrow();
    },

    isInUse(id: string) {
      return db
        .selectFrom("printingDistributionChannels")
        .select("printingId")
        .where("channelId", "=", id)
        .limit(1)
        .executeTakeFirst();
    },

    async countInUse(id: string): Promise<number> {
      const row = await db
        .selectFrom("printingDistributionChannels")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("channelId", "=", id)
        .executeTakeFirst();
      return Number(row?.count ?? 0);
    },

    /**
     * Printing counts grouped by channel id. Channels with zero printings are
     * omitted — callers should default missing entries to 0.
     *
     * @returns Array of `{ channelId, count }` rows.
     */
    async usageCountsByChannel() {
      const rows = await db
        .selectFrom("printingDistributionChannels")
        .select((eb) => ["channelId", eb.fn.countAll<string>().as("count")])
        .groupBy("channelId")
        .execute();
      return rows.map((r) => ({ channelId: r.channelId, count: Number(r.count) }));
    },

    async deleteLinksForChannel(id: string): Promise<void> {
      await db.deleteFrom("printingDistributionChannels").where("channelId", "=", id).execute();
    },

    /**
     * Whether this channel has at least one direct child.
     *
     * @returns A row when a child exists, undefined otherwise.
     */
    hasChildren(id: string) {
      return db
        .selectFrom("distributionChannels")
        .select("id")
        .where("parentId", "=", id)
        .limit(1)
        .executeTakeFirst();
    },

    listForPrintingIds(printingIds: readonly string[]) {
      if (printingIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("printingDistributionChannels as pdc")
        .innerJoin("distributionChannels as dc", "dc.id", "pdc.channelId")
        .select([
          "pdc.printingId",
          "dc.id as channelId",
          "dc.slug as channelSlug",
          "dc.label as channelLabel",
          "dc.description as channelDescription",
          "dc.kind as channelKind",
          "dc.parentId as channelParentId",
          "dc.childrenLabel as channelChildrenLabel",
          "pdc.distributionNote",
        ])
        .where("pdc.printingId", "in", printingIds)
        .orderBy("dc.kind")
        .orderBy("dc.sortOrder")
        .orderBy("dc.label")
        .execute();
    },

    /**
     * Replace a printing's channel links. The delete and the insert share a
     * transaction, so a failure between them cannot strip a printing of every
     * channel. Two of the callers in `printing-admin.ts` hand in a
     * non-transactional repo set, hence the guard rather than a bare
     * `db.transaction()` — an already-open transaction is reused.
     */
    async setForPrinting(
      printingId: string,
      links: readonly { channelId: string; distributionNote?: string | null }[],
    ): Promise<void> {
      const run = async (trx: Kysely<Database>): Promise<void> => {
        await trx
          .deleteFrom("printingDistributionChannels")
          .where("printingId", "=", printingId)
          .execute();
        if (links.length === 0) {
          return;
        }
        await trx
          .insertInto("printingDistributionChannels")
          .values(
            links.map((link) => ({
              printingId,
              channelId: link.channelId,
              distributionNote: link.distributionNote ?? null,
            })),
          )
          .execute();
      };
      await (db.isTransaction ? run(db) : db.transaction().execute(run));
    },
  };
}
