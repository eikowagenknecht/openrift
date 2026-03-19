import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/** Row returned by `affectedImagesByPromoType`. */
interface AffectedImage {
  printingId: string;
  printingSlug: string;
  imageId: string;
  rehostedUrl: string;
  setSlug: string;
}

export function promoTypesRepo(db: Kysely<Database>) {
  return {
    listAll() {
      return db
        .selectFrom("promoTypes")
        .selectAll()
        .orderBy("sortOrder")
        .orderBy("label")
        .execute();
    },

    getById(id: string) {
      return db.selectFrom("promoTypes").selectAll().where("id", "=", id).executeTakeFirst();
    },

    getBySlug(slug: string) {
      return db.selectFrom("promoTypes").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    create(values: { slug: string; label: string; sortOrder?: number }) {
      return db
        .insertInto("promoTypes")
        .values({
          slug: values.slug,
          label: values.label,
          sortOrder: values.sortOrder ?? 0,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    update(
      id: string,
      updates: { slug?: string; label?: string; sortOrder?: number; updatedAt?: Date },
    ) {
      return db
        .updateTable("promoTypes")
        .set(updates)
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
    },

    deleteById(id: string) {
      return db.deleteFrom("promoTypes").where("id", "=", id).executeTakeFirstOrThrow();
    },

    isInUse(id: string) {
      return db
        .selectFrom("printings")
        .select("id")
        .where("promoTypeId", "=", id)
        .limit(1)
        .executeTakeFirst();
    },

    /** @returns Printings with rehosted images that use the given promo type. */
    async affectedImagesByPromoType(promoTypeId: string): Promise<AffectedImage[]> {
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("printingImages as pi", "pi.printingId", "p.id")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select([
          "p.id as printingId",
          "p.slug as printingSlug",
          "pi.id as imageId",
          "pi.rehostedUrl",
          "s.slug as setSlug",
        ])
        .where("p.promoTypeId", "=", promoTypeId)
        .where("pi.rehostedUrl", "is not", null)
        .execute();
      return rows as AffectedImage[];
    },

    /** Bulk-update printing slugs by replacing a suffix substring.
     * @returns Resolves when the update is complete. */
    async renamePrintingSlugs(
      promoTypeId: string,
      oldSuffix: string,
      newSuffix: string,
    ): Promise<void> {
      await db
        .updateTable("printings")
        .set({
          slug: sql<string>`replace(slug, ${oldSuffix}, ${newSuffix})`,
        })
        .where("promoTypeId", "=", promoTypeId)
        .execute();
    },

    /** Update a single printing image's rehosted URL.
     * @returns Resolves when the update is complete. */
    async updateImageRehostedUrl(imageId: string, rehostedUrl: string): Promise<void> {
      await db
        .updateTable("printingImages")
        .set({ rehostedUrl })
        .where("id", "=", imageId)
        .execute();
    },
  };
}
