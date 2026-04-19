import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

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

    listByKind(kind: DistributionChannelKind) {
      return db
        .selectFrom("distributionChannels")
        .selectAll()
        .where("kind", "=", kind)
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

    /**
     * Channels with no children. Printings can only link to leaves.
     *
     * @returns Leaf channels ordered for display.
     */
    listLeaves(kind?: DistributionChannelKind) {
      let query = db
        .selectFrom("distributionChannels as dc")
        .selectAll()
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("distributionChannels as child")
                .select(sql`1`.as("one"))
                .whereRef("child.parentId", "=", "dc.id"),
            ),
          ),
        );
      if (kind !== undefined) {
        query = query.where("dc.kind", "=", kind);
      }
      return query.orderBy("dc.kind").orderBy("dc.sortOrder").orderBy("dc.label").execute();
    },

    /**
     * Self plus all descendants. Used by the admin form to exclude invalid
     * parent choices from the dropdown.
     *
     * @returns Set of channel ids (self + transitive descendants).
     */
    async listDescendantIds(id: string): Promise<string[]> {
      const result = await sql<{ id: string }>`
        WITH RECURSIVE descendants AS (
          SELECT id FROM distribution_channels WHERE id = ${id}
          UNION ALL
          SELECT c.id FROM distribution_channels c
          JOIN descendants d ON c.parent_id = d.id
        )
        SELECT id FROM descendants
      `.execute(db);
      return result.rows.map((r) => r.id);
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

    async reorder(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      const values = sql.join(ids.map((id, i) => sql`(${id}::uuid, ${i}::int)`));
      await sql`
        update distribution_channels
        set sort_order = d.new_order
        from (values ${values}) as d(id, new_order)
        where distribution_channels.id = d.id
      `.execute(db);
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

    listForPrinting(printingId: string) {
      return db
        .selectFrom("printingDistributionChannels as pdc")
        .innerJoin("distributionChannels as dc", "dc.id", "pdc.channelId")
        .select([
          "dc.id as channelId",
          "dc.slug as channelSlug",
          "dc.label as channelLabel",
          "dc.description as channelDescription",
          "dc.kind as channelKind",
          "dc.parentId as channelParentId",
          "dc.childrenLabel as channelChildrenLabel",
          "pdc.distributionNote",
        ])
        .where("pdc.printingId", "=", printingId)
        .orderBy("dc.kind")
        .orderBy("dc.sortOrder")
        .orderBy("dc.label")
        .execute();
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

    async setForPrinting(
      printingId: string,
      links: readonly { channelId: string; distributionNote?: string | null }[],
    ): Promise<void> {
      await db
        .deleteFrom("printingDistributionChannels")
        .where("printingId", "=", printingId)
        .execute();
      if (links.length === 0) {
        return;
      }
      await db
        .insertInto("printingDistributionChannels")
        .values(
          links.map((link) => ({
            printingId,
            channelId: link.channelId,
            distributionNote: link.distributionNote ?? null,
          })),
        )
        .execute();
    },
  };
}
