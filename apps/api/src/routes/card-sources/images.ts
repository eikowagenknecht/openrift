// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem path join
import { join } from "node:path";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { v7 as uuidv7 } from "uuid";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import {
  CARD_IMAGES_DIR,
  deleteRehostFiles,
  downloadImage,
  printingIdToFileBase,
  processAndSave,
  renameRehostFiles,
} from "../../services/image-rehost.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";
import { insertPrintingImage } from "./helpers.js";
import {
  activateImageSchema,
  addImageUrlSchema,
  setImageSchema,
  uploadImageFormSchema,
} from "./schemas.js";

// ── POST /printing-sources/:id/set-image ────────────────────────────────────
export const imagesRoute = new Hono<{ Variables: Variables }>()
  .post("/printing-sources/:id/set-image", zValidator("json", setImageSchema), async (c) => {
    const db = c.get("db");
    const { id } = c.req.param();
    const { mode } = c.req.valid("json");

    const ps = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!ps) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    if (!ps.printingId) {
      throw new AppError(400, "BAD_REQUEST", "Printing source not linked to a printing");
    }

    if (!ps.imageUrl) {
      throw new AppError(400, "BAD_REQUEST", "Printing source has no image URL");
    }

    const cs = await db
      .selectFrom("cardSources")
      .select("source")
      .where("id", "=", ps.cardSourceId)
      .executeTakeFirst();

    await db.transaction().execute(async (trx) => {
      await insertPrintingImage(
        trx,
        ps.printingId as string,
        ps.imageUrl,
        cs?.source ?? "import",
        mode,
      );
    });

    return c.body(null, 204);
  })

  // ── DELETE /printing-images/:imageId ──────────────────────────────────────
  .delete("/printing-images/:imageId", async (c) => {
    const db = c.get("db");
    const { imageId } = c.req.param();

    const image = await db
      .selectFrom("printingImages")
      .select(["id", "rehostedUrl"])
      .where("id", "=", imageId)
      .executeTakeFirst();

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    await db.deleteFrom("printingImages").where("id", "=", imageId).execute();

    if (image.rehostedUrl) {
      await deleteRehostFiles(image.rehostedUrl);
    }

    return c.body(null, 204);
  })

  // ── POST /printing-images/:imageId/activate ──────────────────────────────
  .post(
    "/printing-images/:imageId/activate",
    zValidator("json", activateImageSchema),
    async (c) => {
      const db = c.get("db");
      const { imageId } = c.req.param();
      const { active } = c.req.valid("json");

      const image = await db
        .selectFrom("printingImages")
        .innerJoin("printings", "printings.id", "printingImages.printingId")
        .innerJoin("sets", "sets.id", "printings.setId")
        .select([
          "printingImages.id",
          "printingImages.printingId",
          "printingImages.face",
          "printingImages.rehostedUrl",
          "printings.slug as printingSlug",
          "sets.slug as setSlug",
        ])
        .where("printingImages.id", "=", imageId)
        .executeTakeFirst();

      if (!image) {
        throw new AppError(404, "NOT_FOUND", "Printing image not found");
      }

      const baseFileBase = printingIdToFileBase(image.printingSlug);
      const mainPath = `/card-images/${image.setSlug}/${baseFileBase}`;

      // Find the currently active image (if any) for file rename purposes
      const currentActive = active
        ? await db
            .selectFrom("printingImages")
            .select(["id", "rehostedUrl"])
            .where("printingId", "=", image.printingId)
            .where("face", "=", image.face)
            .where("isActive", "=", true)
            .executeTakeFirst()
        : null;

      await db.transaction().execute(async (trx) => {
        if (active && currentActive) {
          // Deactivate the current active image
          await trx
            .updateTable("printingImages")
            .set({ isActive: false, updatedAt: new Date() })
            .where("id", "=", currentActive.id)
            .execute();

          // Rename current active's files: main path → ID-suffixed path
          if (currentActive.rehostedUrl) {
            const demotedPath = `${mainPath}-${currentActive.id}`;
            await renameRehostFiles(currentActive.rehostedUrl, demotedPath);
            await trx
              .updateTable("printingImages")
              .set({ rehostedUrl: demotedPath, updatedAt: new Date() })
              .where("id", "=", currentActive.id)
              .execute();
          }
        }

        await trx
          .updateTable("printingImages")
          .set({ isActive: active, updatedAt: new Date() })
          .where("id", "=", imageId)
          .execute();

        if (active && image.rehostedUrl) {
          // Rename newly active image's files: ID-suffixed path → main path
          await renameRehostFiles(image.rehostedUrl, mainPath);
          await trx
            .updateTable("printingImages")
            .set({ rehostedUrl: mainPath, updatedAt: new Date() })
            .where("id", "=", imageId)
            .execute();
        } else if (!active && image.rehostedUrl) {
          // Demoting: rename from main path → ID-suffixed path
          const demotedPath = `${mainPath}-${image.id}`;
          await renameRehostFiles(image.rehostedUrl, demotedPath);
          await trx
            .updateTable("printingImages")
            .set({ rehostedUrl: demotedPath, updatedAt: new Date() })
            .where("id", "=", imageId)
            .execute();
        }
      });

      return c.body(null, 204);
    },
  )

  // ── POST /printing-images/:imageId/unrehost ──────────────────────────────
  .post("/printing-images/:imageId/unrehost", async (c) => {
    const db = c.get("db");
    const { imageId } = c.req.param();

    const image = await db
      .selectFrom("printingImages")
      .select(["id", "rehostedUrl", "originalUrl"])
      .where("id", "=", imageId)
      .executeTakeFirst();

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    if (!image.rehostedUrl) {
      throw new AppError(400, "BAD_REQUEST", "Image is not rehosted");
    }

    await deleteRehostFiles(image.rehostedUrl);

    await db
      .updateTable("printingImages")
      .set({ rehostedUrl: null, updatedAt: new Date() })
      .where("id", "=", imageId)
      .execute();

    return c.body(null, 204);
  })

  // ── POST /printing-images/:imageId/rehost ────────────────────────────────
  .post("/printing-images/:imageId/rehost", async (c) => {
    const db = c.get("db");
    const { imageId } = c.req.param();

    const image = await db
      .selectFrom("printingImages")
      .innerJoin("printings", "printings.id", "printingImages.printingId")
      .innerJoin("sets", "sets.id", "printings.setId")
      .select([
        "printingImages.id",
        "printingImages.printingId",
        "printingImages.originalUrl",
        "printingImages.isActive",
        "printings.slug as printingSlug",
        "sets.slug as setSlug",
      ])
      .where("printingImages.id", "=", imageId)
      .executeTakeFirst();

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    if (!image.originalUrl) {
      throw new AppError(400, "BAD_REQUEST", "Image has no original URL to rehost");
    }

    const { buffer, ext } = await downloadImage(image.originalUrl);
    const baseFileBase = printingIdToFileBase(image.printingSlug);
    const fileBase = image.isActive ? baseFileBase : `${baseFileBase}-${image.id}`;
    const outputDir = join(CARD_IMAGES_DIR, image.setSlug);

    await processAndSave(buffer, ext, outputDir, fileBase);

    const rehostedUrl = `/card-images/${image.setSlug}/${fileBase}`;

    await db
      .updateTable("printingImages")
      .set({ rehostedUrl: rehostedUrl, updatedAt: new Date() })
      .where("id", "=", imageId)
      .execute();

    return c.json({ rehostedUrl });
  })

  // ── POST /printing/:printingId/add-image-url ─────────────────────────────
  .post("/printing/:printingId/add-image-url", zValidator("json", addImageUrlSchema), async (c) => {
    const db = c.get("db");
    const printingSlug = c.req.param("printingId");
    const body = c.req.valid("json");

    if (!body.url?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "url is required");
    }

    const printing = await db
      .selectFrom("printings")
      .select("id")
      .where("slug", "=", printingSlug)
      .executeTakeFirst();
    if (!printing) {
      throw new AppError(404, "NOT_FOUND", "Printing not found");
    }

    const mode = body.mode ?? "main";
    const source = body.source?.trim() || "manual";

    await db.transaction().execute(async (trx) => {
      await insertPrintingImage(trx, printing.id, body.url.trim(), source, mode);
    });

    return c.body(null, 204);
  })

  // ── POST /printing/:printingId/upload-image ──────────────────────────────
  .post(
    "/printing/:printingId/upload-image",
    zValidator("form", uploadImageFormSchema),
    async (c) => {
      const db = c.get("db");
      const printingSlug = c.req.param("printingId");

      const printing = await db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.setId")
        .select(["printings.id", "sets.slug as setSlug"])
        .where("printings.slug", "=", printingSlug)
        .executeTakeFirst();

      if (!printing) {
        throw new AppError(404, "NOT_FOUND", "Printing not found");
      }

      const body = c.req.valid("form");
      const file = body.file;
      const mode = body.mode === "additional" ? ("additional" as const) : ("main" as const);
      const source = body.source?.trim() || "upload";

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name ? `.${file.name.split(".").pop()?.toLowerCase() ?? "png"}` : ".png";
      const baseFileBase = printingIdToFileBase(printingSlug);
      const outputDir = join(CARD_IMAGES_DIR, printing.setSlug);

      // Pre-compute paths so rehostedUrl can be included in the INSERT
      // (chk_printing_images_has_url requires at least one URL at insert time)
      const imageId = mode === "additional" ? uuidv7() : undefined;
      const fileBase = mode === "main" ? baseFileBase : `${baseFileBase}-${imageId}`;
      const rehostedUrl = `/card-images/${printing.setSlug}/${fileBase}`;

      await processAndSave(buffer, ext, outputDir, fileBase);

      await db.transaction().execute(async (trx) => {
        if (mode === "main") {
          await trx
            .updateTable("printingImages")
            .set({ isActive: false, updatedAt: new Date() })
            .where("printingId", "=", printing.id)
            .where("face", "=", "front")
            .where("isActive", "=", true)
            .execute();
        }

        await trx
          .insertInto("printingImages")
          .values({
            ...(imageId ? { id: imageId } : {}),
            printingId: printing.id,
            face: "front",
            source,
            isActive: mode === "main",
            rehostedUrl,
          })
          .onConflict((oc) =>
            oc.columns(["printingId", "face", "source"]).doUpdateSet({
              isActive: mode === "main",
              rehostedUrl,
              updatedAt: new Date(),
            }),
          )
          .execute();
      });

      return c.json({ rehostedUrl });
    },
  );
