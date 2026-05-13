import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Queries for printing images (the `printing_images` table and related joins).
 *
 * @returns An object with printing-image query methods bound to the given `db`.
 */
export function printingImagesRepo(db: Kysely<Database>) {
  async function findOrCreateImageFile(originalUrl: string): Promise<string> {
    const existing = await db
      .selectFrom("imageFiles")
      .select("id")
      .where("originalUrl", "=", originalUrl)
      .executeTakeFirst();
    if (existing) {
      return existing.id;
    }
    const row = await db
      .insertInto("imageFiles")
      .values({ originalUrl })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  return {
    /** @returns A printing image by ID with its image_file's rehostedUrl. */
    getIdAndRehostedUrl(
      imageId: string,
    ): Promise<{ id: string; rehostedUrl: string | null } | undefined> {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as imgf", "imgf.id", "printingImages.imageFileId")
        .select(["printingImages.id", "imgf.rehostedUrl"])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();
    },

    /** @returns A printing image by ID with its image_file's URLs. */
    getIdAndUrls(
      imageId: string,
    ): Promise<{ id: string; rehostedUrl: string | null; originalUrl: string | null } | undefined> {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as imgf", "imgf.id", "printingImages.imageFileId")
        .select(["printingImages.id", "imgf.rehostedUrl", "imgf.originalUrl"])
        .where("printingImages.id", "=", imageId)
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

    /** @returns A printing image with image_file info for the rehost endpoint. */
    getForRehost(imageId: string) {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as imgf", "imgf.id", "printingImages.imageFileId")
        .select([
          "printingImages.id",
          "printingImages.imageFileId",
          "imgf.originalUrl",
          "imgf.rotation",
          "imgf.needsTrim",
        ])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();
    },

    /**
     * Fetch rotation + needs_trim values for a batch of image_file IDs.
     * @returns Map of imageFileId → { rotation, needsTrim }.
     */
    async getRotationsAndTrimByIds(
      ids: string[],
    ): Promise<Map<string, { rotation: number; needsTrim: boolean }>> {
      if (ids.length === 0) {
        return new Map();
      }
      const rows = await db
        .selectFrom("imageFiles")
        .select(["id", "rotation", "needsTrim"])
        .where("id", "in", ids)
        .execute();
      return new Map(rows.map((r) => [r.id, { rotation: r.rotation, needsTrim: r.needsTrim }]));
    },

    /** Set the rotation on an image_file. */
    async setRotation(imageFileId: string, rotation: 0 | 90 | 180 | 270): Promise<void> {
      await db.updateTable("imageFiles").set({ rotation }).where("id", "=", imageFileId).execute();
    },

    /** Set the needs_trim flag on an image_file. */
    async setNeedsTrim(imageFileId: string, needsTrim: boolean): Promise<void> {
      await db.updateTable("imageFiles").set({ needsTrim }).where("id", "=", imageFileId).execute();
    },

    /** Deletes a printing image by ID. */
    async deleteById(imageId: string): Promise<void> {
      await db.deleteFrom("printingImages").where("id", "=", imageId).execute();
    },

    /**
     * Get the image_file_id for a printing image.
     * @returns The image_file_id, or undefined if not found.
     */
    async getImageFileId(imageId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("printingImages")
        .select("imageFileId")
        .where("id", "=", imageId)
        .executeTakeFirst();
      return row?.imageFileId;
    },

    /** Updates the rehosted URL on the image_files row. */
    async updateRehostedUrl(imageFileId: string, rehostedUrl: string | null): Promise<void> {
      await db
        .updateTable("imageFiles")
        .set({ rehostedUrl })
        .where("id", "=", imageFileId)
        .execute();
    },

    /** Sets the isActive flag on a printing image. */
    async setActive(imageId: string, active: boolean): Promise<void> {
      await db
        .updateTable("printingImages")
        .set({ isActive: active })
        .where("id", "=", imageId)
        .execute();
    },

    /** Deactivates the current active front image for a printing. */
    async deactivateActiveFront(printingId: string): Promise<void> {
      await db
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
     * @param mode - `'main'`: deactivate current active image, insert as active.
     *               `'additional'`: insert as inactive.
     * @returns The inserted image ID, or `null` if no imageUrl was provided.
     */
    async insertImage(
      printingId: string,
      imageUrl: string | null,
      mode: "main" | "additional" = "main",
    ): Promise<string | null> {
      if (!imageUrl) {
        return null;
      }

      const imageFileId = await findOrCreateImageFile(imageUrl);

      if (mode === "main") {
        await this.deactivateActiveFront(printingId);
      }

      const row = await db
        .insertInto("printingImages")
        .values({
          printingId,
          face: "front",
          imageFileId,
          isActive: mode === "main",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /**
     * Insert an uploaded image as a printing image, with a pre-computed rehostedUrl.
     * Creates an image_files row for the uploaded image.
     * Deactivates the current active front image first (when mode=main).
     */
    async insertUploadedImage(values: {
      id: string;
      printingId: string;
      rehostedUrl: string;
      mode: "main" | "additional";
    }): Promise<void> {
      if (values.mode === "main") {
        await this.deactivateActiveFront(values.printingId);
      }

      // Insert image_files with explicit id matching values.id (= the file path
      // basename). Keeping these aligned is required by regenerateFromOrig,
      // which derives the on-disk lookup path from image_file.id.
      await db
        .insertInto("imageFiles")
        .values({ id: values.id, rehostedUrl: values.rehostedUrl })
        .execute();

      await db
        .insertInto("printingImages")
        .values({
          id: values.id,
          printingId: values.printingId,
          face: "front",
          isActive: values.mode === "main",
          imageFileId: values.id,
        })
        .execute();
    },

    /**
     * Clears all rehosted URLs on image_files.
     * @returns The number of rows that were updated.
     */
    async clearAllRehostedUrls(): Promise<number> {
      const result = await db
        .updateTable("imageFiles")
        .set({ rehostedUrl: null })
        .where("rehostedUrl", "is not", null)
        .where("originalUrl", "is not", null)
        .execute();
      return Number(result[0].numUpdatedRows);
    },

    /** @returns Image files that need rehosting (no rehostedUrl, has originalUrl). */
    listUnrehosted(limit: number) {
      return db
        .selectFrom("printingImages as pi")
        .innerJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId")
        .select(["imgf.id as imageId", "imgf.originalUrl", "imgf.rotation", "imgf.needsTrim"])
        .where("pi.face", "=", "front")
        .where("imgf.rehostedUrl", "is", null)
        .where("imgf.originalUrl", "is not", null)
        .groupBy(["imgf.id", "imgf.originalUrl", "imgf.rotation", "imgf.needsTrim"])
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
        .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId")
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
                      wb("imgf.originalUrl", "is not", null),
                      wb("imgf.rehostedUrl", "is not", null),
                    ]),
                  ),
                "integer",
              )
              .as("total"),
          (eb) =>
            eb
              .cast<number>(
                eb.fn.count("pi.id").filterWhere("imgf.rehostedUrl", "is not", null),
                "integer",
              )
              .as("rehosted"),
        ])
        .groupBy(["sets.slug", "sets.name"])
        .orderBy("sets.name")
        .execute();
    },

    /**
     * List all rehosted image files.
     * @returns Images with their current rehosted URL.
     */
    listAllRehosted() {
      return db
        .selectFrom("imageFiles as imgf")
        .select(["imgf.id as imageId", "imgf.rehostedUrl"])
        .where("imgf.rehostedUrl", "is not", null)
        .orderBy("imgf.id")
        .execute() as Promise<{ imageId: string; rehostedUrl: string }[]>;
    },

    /**
     * Fetch an image_files row by ID.
     * @returns The image_file's ID, URLs, rotation, and needsTrim, or undefined if not found.
     */
    getImageFileById(imageFileId: string): Promise<
      | {
          id: string;
          originalUrl: string | null;
          rehostedUrl: string | null;
          rotation: 0 | 90 | 180 | 270;
          needsTrim: boolean;
        }
      | undefined
    > {
      return db
        .selectFrom("imageFiles")
        .select(["id", "originalUrl", "rehostedUrl", "rotation", "needsTrim"])
        .where("id", "=", imageFileId)
        .executeTakeFirst();
    },

    /**
     * Check whether any *other* printing image references the same image_file.
     * Used to guard file deletion: only remove disk files when no other row points to them.
     * @returns Number of other printing images sharing the same image_file.
     */
    async countOthersByImageFileId(
      imageFileId: string,
      excludePrintingImageId: string,
    ): Promise<number> {
      const result = await db
        .selectFrom("printingImages")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("imageFileId", "=", imageFileId)
        .where("id", "!=", excludePrintingImageId)
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /**
     * List all rehosted image files with card/printing context for broken-image checking.
     * @returns Images with rehosted URL, original URL, and navigation context.
     */
    listAllRehostedWithContext() {
      return db
        .selectFrom("imageFiles as imgf")
        .innerJoin("printingImages as pi", "pi.imageFileId", "imgf.id")
        .innerJoin("printings as p", "p.id", "pi.printingId")
        .innerJoin("sets as s", "s.id", "p.setId")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .select([
          "imgf.id as imageId",
          "imgf.rehostedUrl",
          "imgf.originalUrl",
          "c.slug as cardSlug",
          "c.name as cardName",
          "p.shortCode as printingShortCode",
          "s.slug as setSlug",
        ])
        .where("imgf.rehostedUrl", "is not", null)
        .groupBy([
          "imgf.id",
          "imgf.rehostedUrl",
          "imgf.originalUrl",
          "c.slug",
          "c.name",
          "p.shortCode",
          "s.slug",
        ])
        .orderBy("s.slug")
        .orderBy("c.name")
        .execute() as Promise<
        {
          imageId: string;
          rehostedUrl: string;
          originalUrl: string | null;
          cardSlug: string;
          cardName: string;
          printingShortCode: string;
          setSlug: string;
        }[]
      >;
    },

    /** @returns All non-null rehosted URLs from image_files as a flat list. */
    async allRehostedUrls(): Promise<string[]> {
      const rows = await db
        .selectFrom("imageFiles")
        .select("rehostedUrl")
        .where("rehostedUrl", "is not", null)
        .execute();
      return rows.map((r) => r.rehostedUrl as string);
    },

    /** @returns A candidate printing by ID (all columns). */
    getCandidatePrintingById(id: string) {
      return db
        .selectFrom("candidatePrintings")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** @returns A printing's ID by its primary key. */
    getPrintingById(id: string): Promise<{ id: string } | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },

    /**
     * Delete orphaned image_files rows that no printing_images reference.
     * @returns The number of deleted rows.
     */
    async deleteOrphanedImageFiles(): Promise<number> {
      const result = await sql`
        DELETE FROM image_files imgf
        WHERE NOT EXISTS (
          SELECT 1 FROM printing_images pi WHERE pi.image_file_id = imgf.id
        )
      `.execute(db);
      return Number(result.numAffectedRows ?? 0);
    },
  };
}
