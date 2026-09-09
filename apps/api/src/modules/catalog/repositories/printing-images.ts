import type { CardFace, FallbackArtMode } from "@openrift/shared/types/enums";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

export function printingImagesRepo(db: Kysely<Database>) {
  /** `ON CONFLICT`'s `where` must match `idx_image_files_original_url`'s partial predicate. */
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
    getIdAndRehostedUrl(
      imageId: string,
    ): Promise<{ id: string; printingId: string; rehostedUrl: string | null } | undefined> {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as imgf", "imgf.id", "printingImages.imageFileId")
        .select(["printingImages.id", "printingImages.printingId", "imgf.rehostedUrl"])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();
    },

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

    getForActivate(imageId: string) {
      return db
        .selectFrom("printingImages")
        .select(["printingImages.id", "printingImages.printingId", "printingImages.face"])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();
    },

    getForRehost(imageId: string) {
      return db
        .selectFrom("printingImages")
        .innerJoin("imageFiles as imgf", "imgf.id", "printingImages.imageFileId")
        .select([
          "printingImages.id",
          "printingImages.printingId",
          "printingImages.imageFileId",
          "imgf.originalUrl",
          "imgf.rotation",
          "imgf.needsTrim",
        ])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();
    },

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

    async setRotation(imageFileId: string, rotation: 0 | 90 | 180 | 270): Promise<void> {
      await db.updateTable("imageFiles").set({ rotation }).where("id", "=", imageFileId).execute();
    },

    async setNeedsTrim(imageFileId: string, needsTrim: boolean): Promise<void> {
      await db.updateTable("imageFiles").set({ needsTrim }).where("id", "=", imageFileId).execute();
    },

    async deleteById(imageId: string): Promise<void> {
      await db.deleteFrom("printingImages").where("id", "=", imageId).execute();
    },

    async getImageFileId(imageId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("printingImages")
        .select("imageFileId")
        .where("id", "=", imageId)
        .executeTakeFirst();
      return row?.imageFileId;
    },

    async updateRehostedUrl(imageFileId: string, rehostedUrl: string | null): Promise<void> {
      await db
        .updateTable("imageFiles")
        .set({ rehostedUrl })
        .where("id", "=", imageFileId)
        .execute();
    },

    async setActive(imageId: string, active: boolean): Promise<void> {
      await db
        .updateTable("printingImages")
        .set({ isActive: active })
        .where("id", "=", imageId)
        .execute();
    },

    /** Keeps the active flag unless the target face already has an active image. */
    async setFace(imageId: string, face: CardFace): Promise<void> {
      await db
        .updateTable("printingImages")
        .set({
          face,
          isActive: sql<boolean>`is_active AND NOT EXISTS (
            SELECT 1 FROM printing_images other
            WHERE other.printing_id = printing_images.printing_id
              AND other.face = ${face}
              AND other.is_active
              AND other.id <> printing_images.id
          )`,
        })
        .where("id", "=", imageId)
        .where("face", "!=", face)
        .execute();
    },

    /** One active image per printing and face, which is what `idx_printing_images_active` enforces. */
    async deactivateActiveFace(printingId: string, face: CardFace = "front"): Promise<void> {
      await db
        .updateTable("printingImages")
        .set({ isActive: false })
        .where("printingId", "=", printingId)
        .where("face", "=", face)
        .where("isActive", "=", true)
        .execute();
    },

    async insertImage(
      printingId: string,
      imageUrl: string | null,
      mode: "main" | "additional" = "main",
      face: CardFace = "front",
    ): Promise<string | null> {
      if (!imageUrl) {
        return null;
      }

      const imageFileId = await findOrCreateImageFile(imageUrl);

      if (mode === "main") {
        await this.deactivateActiveFace(printingId, face);
      }

      const row = await db
        .insertInto("printingImages")
        .values({
          printingId,
          face,
          imageFileId,
          isActive: mode === "main",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    async insertUploadedImage(values: {
      id: string;
      printingId: string;
      rehostedUrl: string;
      mode: "main" | "additional";
      face?: CardFace;
      credit?: string;
    }): Promise<void> {
      const face = values.face ?? "front";
      if (values.mode === "main") {
        await this.deactivateActiveFace(values.printingId, face);
      }

      // The image_files id must equal values.id (= the file path basename):
      // regenerateFromOrig derives the on-disk lookup path from image_file.id.
      await db
        .insertInto("imageFiles")
        .values({
          id: values.id,
          rehostedUrl: values.rehostedUrl,
          credit: values.credit ?? null,
        })
        .execute();

      await db
        .insertInto("printingImages")
        .values({
          id: values.id,
          printingId: values.printingId,
          face,
          isActive: values.mode === "main",
          imageFileId: values.id,
        })
        .execute();
    },

    async clearAllRehostedUrls(): Promise<number> {
      const result = await db
        .updateTable("imageFiles")
        .set({ rehostedUrl: null })
        .where("rehostedUrl", "is not", null)
        .where("originalUrl", "is not", null)
        .executeTakeFirstOrThrow();
      return Number(result.numUpdatedRows);
    },

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
     * `scansOnly` keeps only images with `needs_trim` set — the scanned
     * uploads whose variants the crop/contrast pipeline touches.
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
     * Guards file deletion: disk files are only removed when no *other*
     * printing image still points at the same image_file.
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

    async allRehostedUrls(): Promise<string[]> {
      const rows = await db
        .selectFrom("imageFiles")
        .select("rehostedUrl")
        .where("rehostedUrl", "is not", null)
        .$narrowType<{ rehostedUrl: string }>()
        .execute();
      return rows.map((r) => r.rehostedUrl);
    },

    getCandidatePrintingById(id: string) {
      return db
        .selectFrom("candidatePrintings")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();
    },

    getPrintingById(id: string): Promise<{ id: string } | undefined> {
      return db.selectFrom("printings").select("id").where("id", "=", id).executeTakeFirst();
    },

    /**
     * How many printings pin this image file as their substitute art.
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

    /** `chk_printings_fallback_pinned_has_image` requires mode and file to agree; write both together. */
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
     * Shares {@link findOrCreateImageFile} with the printing-image path, so
     * pinning art already stored under another printing reuses that row instead
     * of duplicating the file.
     */
    imageFileForUrl(originalUrl: string): Promise<string> {
      return findOrCreateImageFile(originalUrl);
    },

    async originalUrlsInUse(originalUrls: string[]): Promise<Set<string>> {
      if (originalUrls.length === 0) {
        return new Set();
      }
      const rows = await db
        .selectFrom("imageFiles")
        .select("originalUrl")
        .where("originalUrl", "in", originalUrls)
        .execute();
      return new Set(rows.map((row) => row.originalUrl as string));
    },

    /**
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
     * printing_images row nor a printing's pinned fallback art. A pinned file
     * usually *is* some printing's image too, but one uploaded purely as a
     * substitute is not, and it is exactly as live as any other.
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
