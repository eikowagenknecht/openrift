import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

/**
 * Queries for printing images (the `printing_images` table and related joins).
 *
 * @returns An object with printing-image query methods bound to the given `db`.
 */
export function printingImagesRepo(db: Kysely<Database>) {
  return {
    /** @returns A printing image by ID with its card_image's rehostedUrl. */
    getIdAndRehostedUrl(
      imageId: string,
    ): Promise<{ id: string; rehostedUrl: string | null } | undefined> {
      return db
        .selectFrom("printingImages")
        .innerJoin("cardImages as ci", "ci.id", "printingImages.cardImageId")
        .select(["printingImages.id", "ci.rehostedUrl"])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();
    },

    /** @returns A printing image by ID with its card_image's URLs. */
    getIdAndUrls(
      imageId: string,
    ): Promise<{ id: string; rehostedUrl: string | null; originalUrl: string | null } | undefined> {
      return db
        .selectFrom("printingImages")
        .innerJoin("cardImages as ci", "ci.id", "printingImages.cardImageId")
        .select(["printingImages.id", "ci.rehostedUrl", "ci.originalUrl"])
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

    /** @returns A printing image with set slug and card_image info for the rehost endpoint. */
    getForRehost(imageId: string) {
      return db
        .selectFrom("printingImages")
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .innerJoin("sets", "sets.id", "printings.setId")
        .innerJoin("cardImages as ci", "ci.id", "printingImages.cardImageId")
        .select([
          "printingImages.id",
          "printingImages.cardImageId",
          "ci.originalUrl",
          "sets.slug as setSlug",
        ])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();
    },

    /** Deletes a printing image by ID. */
    async deleteById(imageId: string): Promise<void> {
      await db.deleteFrom("printingImages").where("id", "=", imageId).execute();
    },

    /**
     * Get the card_image_id for a printing image.
     * @returns The card_image_id, or undefined if not found.
     */
    async getCardImageId(imageId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("printingImages")
        .select("cardImageId")
        .where("id", "=", imageId)
        .executeTakeFirst();
      return row?.cardImageId;
    },

    /** Updates the rehosted URL on the card_images row. */
    async updateRehostedUrl(cardImageId: string, rehostedUrl: string | null): Promise<void> {
      await db
        .updateTable("cardImages")
        .set({ rehostedUrl })
        .where("id", "=", cardImageId)
        .execute();
    },

    /** Deactivates a printing image. */
    async deactivate(imageId: string): Promise<void> {
      await db
        .updateTable("printingImages")
        .set({ isActive: false })
        .where("id", "=", imageId)
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
     * Find or create a card_images row for a given original URL.
     * @returns The card_image ID.
     */
    async findOrCreateCardImage(originalUrl: string): Promise<string> {
      const existing = await db
        .selectFrom("cardImages")
        .select("id")
        .where("originalUrl", "=", originalUrl)
        .executeTakeFirst();
      if (existing) {
        return existing.id;
      }
      const row = await db
        .insertInto("cardImages")
        .values({ originalUrl })
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /**
     * Insert an image record into printing_images.
     *
     * @param mode - `'main'`: deactivate current active image, insert/update as active.
     *               `'additional'`: insert as inactive.
     * @returns The inserted/updated image ID, or `null` if no imageUrl was provided.
     */
    async insertImage(
      printingId: string,
      imageUrl: string | null,
      provider: string,
      mode: "main" | "additional" = "main",
    ): Promise<string | null> {
      if (!imageUrl) {
        return null;
      }

      const cardImageId = await this.findOrCreateCardImage(imageUrl);

      if (mode === "main") {
        await this.deactivateActiveFront(printingId);

        const row = await db
          .insertInto("printingImages")
          .values({
            printingId,
            face: "front",
            provider,
            cardImageId,
            isActive: true,
          })
          .onConflict((oc) =>
            oc.columns(["printingId", "face", "provider"]).doUpdateSet({
              cardImageId,
              isActive: true,
            }),
          )
          .returning("id")
          .executeTakeFirstOrThrow();
        return row.id;
      }

      const row = await db
        .insertInto("printingImages")
        .values({
          printingId,
          face: "front",
          provider,
          cardImageId,
          isActive: false,
        })
        .onConflict((oc) =>
          oc.columns(["printingId", "face", "provider"]).doUpdateSet({
            cardImageId,
          }),
        )
        .returning("id")
        .executeTakeFirstOrThrow();
      return row.id;
    },

    /**
     * Insert an uploaded image as a printing image, with a pre-computed rehostedUrl.
     * Creates a card_images row for the uploaded image.
     * Optionally deactivates the current active front image first (when mode=main).
     */
    async insertUploadedImage(values: {
      id: string;
      printingId: string;
      provider: string;
      rehostedUrl: string;
      mode: "main" | "additional";
    }): Promise<void> {
      if (values.mode === "main") {
        await this.deactivateActiveFront(values.printingId);
      }

      // Create card_images row with only rehostedUrl (uploaded images have no original URL)
      const cardImage = await db
        .insertInto("cardImages")
        .values({ rehostedUrl: values.rehostedUrl })
        .returning("id")
        .executeTakeFirstOrThrow();

      await db
        .insertInto("printingImages")
        .values({
          id: values.id,
          printingId: values.printingId,
          face: "front",
          provider: values.provider,
          isActive: values.mode === "main",
          cardImageId: cardImage.id,
        })
        .onConflict((oc) =>
          oc.columns(["printingId", "face", "provider"]).doUpdateSet({
            isActive: values.mode === "main",
            cardImageId: cardImage.id,
          }),
        )
        .execute();
    },

    /**
     * Clears all rehosted URLs on card_images.
     * @returns The number of rows that were updated.
     */
    async clearAllRehostedUrls(): Promise<number> {
      const result = await db
        .updateTable("cardImages")
        .set({ rehostedUrl: null })
        .where("rehostedUrl", "is not", null)
        .where("originalUrl", "is not", null)
        .execute();
      return Number(result[0].numUpdatedRows);
    },

    /** @returns Card images that need rehosting (no rehostedUrl, has originalUrl), with set slug. */
    listUnrehosted(limit: number) {
      return db
        .selectFrom("printingImages as pi")
        .innerJoin("cardImages as ci", "ci.id", "pi.cardImageId")
        .innerJoin("printings as p", "p.id", "pi.printingId")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["ci.id as imageId", "ci.originalUrl", "s.slug as setSlug"])
        .where("pi.face", "=", "front")
        .where("ci.rehostedUrl", "is", null)
        .where("ci.originalUrl", "is not", null)
        .groupBy(["ci.id", "ci.originalUrl", "s.slug"])
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
        .leftJoin("cardImages as ci", "ci.id", "pi.cardImageId")
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
                      wb("ci.originalUrl", "is not", null),
                      wb("ci.rehostedUrl", "is not", null),
                    ]),
                  ),
                "integer",
              )
              .as("total"),
          (eb) =>
            eb
              .cast<number>(
                eb.fn.count("pi.id").filterWhere("ci.rehostedUrl", "is not", null),
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
     * Creates missing card_images rows and links them.
     * @returns The number of affected rows.
     */
    async restoreFromSources(provider: string): Promise<number> {
      // First, ensure card_images exist for all candidate image URLs
      await sql`
        INSERT INTO card_images (original_url)
        SELECT DISTINCT ps.image_url
        FROM candidate_printings ps
        JOIN candidate_cards cs ON cs.id = ps.candidate_card_id
        WHERE ps.printing_id IS NOT NULL
          AND ps.image_url IS NOT NULL
          AND cs.provider = ${provider}
        ON CONFLICT (original_url) WHERE original_url IS NOT NULL DO NOTHING
      `.execute(db);

      // Then insert/update printing_images with the card_image_id
      const result = await sql`
        INSERT INTO printing_images (printing_id, face, provider, card_image_id, is_active)
        SELECT ps.printing_id, 'front', cs.provider, ci.id, true
        FROM candidate_printings ps
        JOIN candidate_cards cs ON cs.id = ps.candidate_card_id
        JOIN card_images ci ON ci.original_url = ps.image_url
        WHERE ps.printing_id IS NOT NULL
          AND ps.image_url IS NOT NULL
          AND cs.provider = ${provider}
        ON CONFLICT (printing_id, face, provider) DO UPDATE
          SET card_image_id = EXCLUDED.card_image_id
          WHERE printing_images.card_image_id != EXCLUDED.card_image_id
      `.execute(db);
      return Number(result.numAffectedRows ?? 0);
    },

    /**
     * List all rehosted card images with their set slug.
     * @returns Images with their current rehosted URL and set slug.
     */
    listAllRehosted() {
      return db
        .selectFrom("cardImages as ci")
        .innerJoin("printingImages as pi", "pi.cardImageId", "ci.id")
        .innerJoin("printings as p", "p.id", "pi.printingId")
        .innerJoin("sets as s", "s.id", "p.setId")
        .select(["ci.id as imageId", "ci.rehostedUrl", "s.slug as setSlug"])
        .where("ci.rehostedUrl", "is not", null)
        .groupBy(["ci.id", "ci.rehostedUrl", "s.slug"])
        .orderBy("ci.id")
        .execute() as Promise<{ imageId: string; rehostedUrl: string; setSlug: string }[]>;
    },

    /**
     * Check whether any *other* printing image references the same card_image.
     * Used to guard file deletion: only remove disk files when no other row points to them.
     * @returns Number of other printing images sharing the same card_image.
     */
    async countOthersByCardImageId(
      cardImageId: string,
      excludePrintingImageId: string,
    ): Promise<number> {
      const result = await db
        .selectFrom("printingImages")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("cardImageId", "=", cardImageId)
        .where("id", "!=", excludePrintingImageId)
        .executeTakeFirstOrThrow();
      return Number(result.count);
    },

    /**
     * List all rehosted card images with card/printing context for broken-image checking.
     * @returns Images with rehosted URL, original URL, and navigation context.
     */
    listAllRehostedWithContext() {
      return db
        .selectFrom("cardImages as ci")
        .innerJoin("printingImages as pi", "pi.cardImageId", "ci.id")
        .innerJoin("printings as p", "p.id", "pi.printingId")
        .innerJoin("sets as s", "s.id", "p.setId")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .select([
          "ci.id as imageId",
          "ci.rehostedUrl",
          "ci.originalUrl",
          "c.slug as cardSlug",
          "c.name as cardName",
          "p.shortCode as printingShortCode",
          "s.slug as setSlug",
        ])
        .where("ci.rehostedUrl", "is not", null)
        .groupBy([
          "ci.id",
          "ci.rehostedUrl",
          "ci.originalUrl",
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

    /** @returns All non-null rehosted URLs from card_images as a flat list. */
    async allRehostedUrls(): Promise<string[]> {
      const rows = await db
        .selectFrom("cardImages")
        .select("rehostedUrl")
        .where("rehostedUrl", "is not", null)
        .execute();
      return rows.map((r) => r.rehostedUrl as string);
    },

    /** @returns Total count of rehosted card images. */
    async countRehosted(): Promise<number> {
      const result = await db
        .selectFrom("cardImages")
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

    /** @returns A printing's ID and set slug by printing ID. */
    getPrintingWithSetById(id: string) {
      return db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.setId")
        .select(["printings.id", "sets.slug as setSlug"])
        .where("printings.id", "=", id)
        .executeTakeFirst();
    },

    /**
     * Delete orphaned card_images rows that no printing_images reference.
     * @returns The number of deleted rows.
     */
    async deleteOrphanedCardImages(): Promise<number> {
      const result = await sql`
        DELETE FROM card_images ci
        WHERE NOT EXISTS (
          SELECT 1 FROM printing_images pi WHERE pi.card_image_id = ci.id
        )
      `.execute(db);
      return Number(result.numAffectedRows ?? 0);
    },
  };
}
