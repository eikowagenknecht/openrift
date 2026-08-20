import type { FallbackArtMode } from "@openrift/shared";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Queries for printing images (the `printing_images` table and related joins).
 *
 * @returns An object with printing-image query methods bound to the given `db`.
 */
export function printingImagesRepo(db: Kysely<Database>) {
  /**
   * Resolve the `image_files` row for an original URL, creating it if it is new.
   *
   * The insert leads and takes the deduping on itself, because a read-then-write
   * pair loses the race: two imports of the same URL both see no row and both
   * insert, and `idx_image_files_original_url` (a UNIQUE index on `original_url`
   * WHERE `original_url IS NOT NULL`) makes the loser throw instead of dedupe.
   * `ON CONFLICT` needs the index's own predicate to match that partial index,
   * so the `where` on the conflict target is load-bearing. A conflicting insert
   * returns nothing, which is when the select runs and picks up the winner's row.
   *
   * @returns The id of the existing or newly created `image_files` row.
   */
  async function findOrCreateImageFile(originalUrl: string): Promise<string> {
    const inserted = await db
      .insertInto("imageFiles")
      .values({ originalUrl })
      .onConflict((oc) => oc.column("originalUrl").where("originalUrl", "is not", null).doNothing())
      .returning("id")
      .executeTakeFirst();
    if (inserted) {
      return inserted.id;
    }
    const existing = await db
      .selectFrom("imageFiles")
      .select("id")
      .where("originalUrl", "=", originalUrl)
      .executeTakeFirstOrThrow();
    return existing.id;
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
     * @param scansOnly When true, only images with `needs_trim` set — the
     *   scanned uploads whose variants the crop/contrast pipeline touches.
     * @returns Images with their current rehosted URL.
     */
    listAllRehosted(scansOnly = false) {
      return db
        .selectFrom("imageFiles as imgf")
        .select(["imgf.id as imageId", "imgf.rehostedUrl"])
        .where("imgf.rehostedUrl", "is not", null)
        .$if(scansOnly, (qb) => qb.where("imgf.needsTrim", "=", true))
        .orderBy("imgf.id")
        .$narrowType<{ rehostedUrl: string }>()
        .execute();
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
        .$narrowType<{ rehostedUrl: string }>()
        .execute();
    },

    /** @returns All non-null rehosted URLs from image_files as a flat list. */
    async allRehostedUrls(): Promise<string[]> {
      const rows = await db
        .selectFrom("imageFiles")
        .select("rehostedUrl")
        .where("rehostedUrl", "is not", null)
        .$narrowType<{ rehostedUrl: string }>()
        .execute();
      return rows.map((r) => r.rehostedUrl);
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
     * @returns How many printings pin this image file as their substitute art.
     * Deleting a printing image consults this before removing the files behind
     * it: the `printing_images` row is going, but a pin on the same
     * `image_files` row keeps the file on screen somewhere else.
     */
    async countPinsByImageFileId(imageFileId: string): Promise<number> {
      const row = await db
        .selectFrom("printings")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("fallbackImageFileId", "=", imageFileId)
        .executeTakeFirstOrThrow();
      return Number(row.count);
    },

    /** @returns A printing's substitute-art override, or undefined if no such printing. */
    getFallbackArt(printingId: string): Promise<
      | {
          id: string;
          shortCode: string;
          fallbackArtMode: FallbackArtMode;
          fallbackImageFileId: string | null;
        }
      | undefined
    > {
      return db
        .selectFrom("printings")
        .select(["id", "shortCode", "fallbackArtMode", "fallbackImageFileId"])
        .where("id", "=", printingId)
        .executeTakeFirst();
    },

    /**
     * Point a printing's substitute art at `imageFileId`, or clear the override.
     *
     * Mode and file move together because `chk_printings_fallback_pinned_has_image`
     * requires them to agree, so writing one without the other is a constraint
     * violation rather than a half-applied state.
     */
    async setFallbackArt(
      printingId: string,
      mode: FallbackArtMode,
      imageFileId: string | null,
    ): Promise<void> {
      await db
        .updateTable("printings")
        .set({
          fallbackArtMode: mode,
          fallbackImageFileId: mode === "pinned" ? imageFileId : null,
        })
        .where("id", "=", printingId)
        .execute();
    },

    /**
     * Resolve an `image_files` row for a URL, creating it when the URL is new.
     * Shares {@link findOrCreateImageFile} with the printing-image path, so
     * pinning art already stored under another printing reuses that row instead
     * of duplicating the file.
     * @returns The id of the existing or newly created `image_files` row.
     */
    imageFileForUrl(originalUrl: string): Promise<string> {
      return findOrCreateImageFile(originalUrl);
    },

    /**
     * Insert an `image_files` row for an uploaded file with a pre-computed
     * rehosted URL, with no printing image attached to it.
     *
     * The unattached row is the point: a file pinned as substitute art is not a
     * scan of the printing that shows it, and giving it a `printing_images` row
     * would make the printing look scanned to the missing-images report, the
     * contribute prompt and the catalog alike. Same id-equals-path-basename rule
     * as {@link insertUploadedImage}, which `regenerateFromOrig` depends on.
     */
    async insertUnattachedImageFile(values: { id: string; rehostedUrl: string }): Promise<void> {
      await db
        .insertInto("imageFiles")
        .values({ id: values.id, rehostedUrl: values.rehostedUrl })
        .execute();
    },

    /** @returns An image_files row's rehost inputs, or undefined when it is gone. */
    getImageFileForRehost(imageFileId: string): Promise<
      | {
          id: string;
          originalUrl: string | null;
          rehostedUrl: string | null;
          rotation: number;
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
     * Delete orphaned image_files rows that nothing references — neither a
     * printing_images row nor a printing's pinned fallback art (migration 257).
     * A pinned file usually *is* some printing's image too, but one uploaded
     * purely as a substitute is not, and it is exactly as live as any other.
     * @returns The number of deleted rows.
     */
    async deleteOrphanedImageFiles(): Promise<number> {
      const result = await db
        .deleteFrom("imageFiles")
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("printingImages")
                .select("printingImages.id")
                .whereRef("printingImages.imageFileId", "=", "imageFiles.id"),
            ),
          ),
        )
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("printings")
                .select("printings.id")
                .whereRef("printings.fallbackImageFileId", "=", "imageFiles.id"),
            ),
          ),
        )
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
  };
}
