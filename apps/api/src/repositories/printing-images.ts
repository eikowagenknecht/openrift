import type { Kysely, Selectable, Transaction } from "kysely";
import { sql } from "kysely";

import type { Database, PrintingImagesTable } from "../db/index.js";

type Trx = Transaction<Database> | Kysely<Database>;

/**
 * Queries for printing images (the `printing_images` table and related joins).
 *
 * @returns An object with printing-image query methods bound to the given `db`.
 */
export function printingImagesRepo(db: Kysely<Database>) {
  return {
    /** @returns A printing image by ID (id + rehostedUrl). */
    getIdAndRehostedUrl(
      imageId: string,
    ): Promise<Pick<Selectable<PrintingImagesTable>, "id" | "rehostedUrl"> | undefined> {
      return db
        .selectFrom("printingImages")
        .select(["id", "rehostedUrl"])
        .where("id", "=", imageId)
        .executeTakeFirst();
    },

    /** @returns A printing image by ID (id + rehostedUrl + originalUrl). */
    getIdAndUrls(
      imageId: string,
    ): Promise<
      Pick<Selectable<PrintingImagesTable>, "id" | "rehostedUrl" | "originalUrl"> | undefined
    > {
      return db
        .selectFrom("printingImages")
        .select(["id", "rehostedUrl", "originalUrl"])
        .where("id", "=", imageId)
        .executeTakeFirst();
    },

    /** @returns A printing image's printingId for the activate endpoint. */
    getForActivate(imageId: string) {
      return db
        .selectFrom("printingImages")
        .select(["printingImages.id", "printingImages.printingId"])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();
    },

    /** @returns A printing image with set slug info for the rehost endpoint. */
    getForRehost(imageId: string) {
      return db
        .selectFrom("printingImages")
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .innerJoin("sets", "sets.id", "printings.setId")
        .select(["printingImages.id", "printingImages.originalUrl", "sets.slug as setSlug"])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();
    },

    /** Deletes a printing image by ID. */
    async deleteById(imageId: string): Promise<void> {
      await db.deleteFrom("printingImages").where("id", "=", imageId).execute();
    },

    /** Updates the rehosted URL for a printing image. */
    async updateRehostedUrl(imageId: string, rehostedUrl: string | null): Promise<void> {
      await db
        .updateTable("printingImages")
        .set({ rehostedUrl })
        .where("id", "=", imageId)
        .execute();
    },

    /** Deactivates a printing image. Accepts an optional transaction. */
    async deactivate(imageId: string, trx?: Trx): Promise<void> {
      await (trx ?? db)
        .updateTable("printingImages")
        .set({ isActive: false })
        .where("id", "=", imageId)
        .execute();
    },

    /** Sets the isActive flag on a printing image. Accepts an optional transaction. */
    async setActive(imageId: string, active: boolean, trx?: Trx): Promise<void> {
      await (trx ?? db)
        .updateTable("printingImages")
        .set({ isActive: active })
        .where("id", "=", imageId)
        .execute();
    },

    /** Deactivates the current active front image for a printing. Accepts an optional transaction. */
    async deactivateActiveFront(printingId: string, trx?: Trx): Promise<void> {
      await (trx ?? db)
        .updateTable("printingImages")
        .set({ isActive: false })
        .where("printingId", "=", printingId)
        .where("face", "=", "front")
        .where("isActive", "=", true)
        .execute();
    },

    /**
     * Insert an image record into printing_images.
     *
     * @param mode - `'main'`: deactivate current active image, insert/update as active.
     *               `'additional'`: insert as inactive.
     * @returns The inserted/updated image ID, or `null` if no imageUrl was provided.
     */
    async insertImage(
      trx: Trx,
      printingId: string,
      imageUrl: string | null,
      provider: string,
      mode: "main" | "additional" = "main",
    ): Promise<string | null> {
      if (!imageUrl) {
        return null;
      }

      if (mode === "main") {
        await this.deactivateActiveFront(printingId, trx);

        const row = await trx
          .insertInto("printingImages")
          .values({
            printingId,
            face: "front",
            provider,
            originalUrl: imageUrl,
            isActive: true,
          })
          .onConflict((oc) =>
            oc.columns(["printingId", "face", "provider"]).doUpdateSet({
              originalUrl: imageUrl,
              isActive: true,
            }),
          )
          .returning("id")
          .executeTakeFirstOrThrow();
        return row.id;
      }

      const row = await trx
        .insertInto("printingImages")
        .values({
          printingId,
          face: "front",
          provider,
          originalUrl: imageUrl,
          isActive: false,
        })
        .onConflict((oc) =>
          oc.columns(["printingId", "face", "provider"]).doUpdateSet({
            originalUrl: imageUrl,
          }),
        )
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /**
     * Insert an uploaded image as a printing image, with a pre-computed rehostedUrl.
     * Optionally deactivates the current active front image first (when mode=main).
     */
    async insertUploadedImage(
      trx: Trx,
      values: {
        id: string;
        printingId: string;
        provider: string;
        rehostedUrl: string;
        mode: "main" | "additional";
      },
    ): Promise<void> {
      if (values.mode === "main") {
        await this.deactivateActiveFront(values.printingId, trx);
      }

      await trx
        .insertInto("printingImages")
        .values({
          id: values.id,
          printingId: values.printingId,
          face: "front",
          provider: values.provider,
          isActive: values.mode === "main",
          rehostedUrl: values.rehostedUrl,
        })
        .onConflict((oc) =>
          oc.columns(["printingId", "face", "provider"]).doUpdateSet({
            isActive: values.mode === "main",
            rehostedUrl: values.rehostedUrl,
          }),
        )
        .execute();
    },

    /**
     * Clears all rehosted URLs.
     * @returns The number of rows that were updated.
     */
    async clearAllRehostedUrls(): Promise<number> {
      const result = await db
        .updateTable("printingImages")
        .set({ rehostedUrl: null })
        .where("rehostedUrl", "is not", null)
        .where("originalUrl", "is not", null)
        .execute();
      return Number(result[0].numUpdatedRows);
    },

    /** @returns Front images that need rehosting (no rehostedUrl, has originalUrl). */
    listUnrehosted(limit: number) {
      return db
        .selectFrom("printingImages as pi")
        .innerJoin("printings as p", "p.id", "pi.printingId")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["pi.id as imageId", "pi.originalUrl", "s.slug as setSlug"])
        .where("pi.face", "=", "front")
        .where("pi.rehostedUrl", "is", null)
        .where("pi.originalUrl", "is not", null)
        .limit(limit)
        .execute();
    },

    /** @returns Per-set rehost statistics (total images, rehosted count). */
    rehostStatusBySet() {
      return db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.setId")
        .leftJoin("printingImages as pi", (jb) =>
          jb.onRef("pi.printingId", "=", "printings.id").on("pi.face", "=", "front"),
        )
        .select([
          "sets.slug as setId",
          "sets.name as setName",
          (eb) =>
            eb
              .cast<number>(
                eb.fn
                  .count("pi.id")
                  .filterWhere((wb) =>
                    wb.or([
                      wb("pi.originalUrl", "is not", null),
                      wb("pi.rehostedUrl", "is not", null),
                    ]),
                  ),
                "integer",
              )
              .as("total"),
          (eb) =>
            eb
              .cast<number>(
                eb.fn.count("pi.id").filterWhere("pi.rehostedUrl", "is not", null),
                "integer",
              )
              .as("rehosted"),
        ])
        .groupBy(["sets.slug", "sets.name"])
        .orderBy("sets.name")
        .execute();
    },

    /**
     * Bulk upsert printing_images from candidate_printings for a given provider.
     * Creates missing rows (face=front, is_active=true) and backfills original_url
     * where it's currently NULL.
     * @returns The number of affected rows.
     */
    async restoreFromSources(provider: string): Promise<number> {
      const result = await sql`
        INSERT INTO printing_images (printing_id, face, provider, original_url, is_active)
        SELECT ps.printing_id, 'front', cs.provider, ps.image_url, true
        FROM candidate_printings ps
        JOIN candidate_cards cs ON cs.id = ps.candidate_card_id
        WHERE ps.printing_id IS NOT NULL
          AND ps.image_url IS NOT NULL
          AND cs.provider = ${provider}
        ON CONFLICT (printing_id, face, provider) DO UPDATE
          SET original_url = EXCLUDED.original_url
          WHERE printing_images.original_url IS NULL
      `.execute(db);
      return Number(result.numAffectedRows ?? 0);
    },

    /**
     * List all rehosted images with their set slug.
     * @returns Images with their current rehosted URL and set slug.
     */
    listAllRehosted() {
      return db
        .selectFrom("printingImages as pi")
        .innerJoin("printings as p", "p.id", "pi.printingId")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["pi.id as imageId", "pi.rehostedUrl", "s.slug as setSlug"])
        .where("pi.rehostedUrl", "is not", null)
        .orderBy("pi.id")
        .execute() as Promise<{ imageId: string; rehostedUrl: string; setSlug: string }[]>;
    },

    /**
     * Check whether any *other* printing image shares the same rehosted URL.
     * Used to guard file deletion: only remove disk files when no other row points to them.
     * @returns Number of other printing images sharing the same rehosted URL.
     */
    async countOthersByRehostedUrl(rehostedUrl: string, excludeId: string): Promise<number> {
      const result = await db
        .selectFrom("printingImages")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("rehostedUrl", "=", rehostedUrl)
        .where("id", "!=", excludeId)
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /** @returns All non-null rehosted URLs as a flat list. */
    async allRehostedUrls(): Promise<string[]> {
      const rows = await db
        .selectFrom("printingImages")
        .select("rehostedUrl")
        .where("rehostedUrl", "is not", null)
        .execute();
      return rows.map((r) => r.rehostedUrl as string);
    },

    /** @returns Total count of rehosted images. */
    async countRehosted(): Promise<number> {
      const result = await db
        .selectFrom("printingImages")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("rehostedUrl", "is not", null)
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /** @returns A candidate printing by ID (all columns). */
    getCandidatePrintingById(id: string) {
      return db
        .selectFrom("candidatePrintings")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** @returns The provider name for a candidate card by ID. */
    getCandidateCardProvider(candidateCardId: string): Promise<{ provider: string } | undefined> {
      return db
        .selectFrom("candidateCards")
        .select("provider")
        .where("id", "=", candidateCardId)
        .executeTakeFirst();
    },

    /** @returns A printing's ID by its primary key. */
    getPrintingById(id: string): Promise<{ id: string } | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },

    /** @returns A printing's ID, slug, and set slug by printing ID. */
    getPrintingWithSetById(id: string) {
      return db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.setId")
        .select(["printings.id", "printings.slug", "sets.slug as setSlug"])
        .where("printings.id", "=", id)
        .executeTakeFirst();
    },

    /** @returns A printing's ID and set slug by printing slug. */
    getPrintingWithSetBySlug(slug: string) {
      return db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.setId")
        .select(["printings.id", "sets.slug as setSlug"])
        .where("printings.slug", "=", slug)
        .executeTakeFirst();
    },
  };
}
