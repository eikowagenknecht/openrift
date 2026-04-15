import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export type DistributionChannelKind = "event" | "product";

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

    async getMaxSortOrder(): Promise<number> {
      const row = await db
        .selectFrom("distributionChannels")
        .select((eb) => eb.fn.max("sortOrder").as("maxSortOrder"))
        .executeTakeFirst();
      return row?.maxSortOrder ?? -1;
    },

    create(values: {
      slug: string;
      label: string;
      description?: string | null;
      kind?: DistributionChannelKind;
      sortOrder?: number;
    }) {
      return db
        .insertInto("distributionChannels")
        .values({
          slug: values.slug,
          label: values.label,
          description: values.description ?? null,
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
