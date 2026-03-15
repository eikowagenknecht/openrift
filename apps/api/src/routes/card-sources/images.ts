// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem path join
import { join } from "node:path";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
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
    const { id } = c.req.param();
    const { mode } = c.req.valid("json");

    const ps = await db
      .selectFrom("printing_sources")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!ps) {
      throw new AppError(404, "NOT_FOUND", "Printing source not found");
    }

    if (!ps.printing_id) {
      throw new AppError(400, "BAD_REQUEST", "Printing source not linked to a printing");
    }

    if (!ps.image_url) {
      throw new AppError(400, "BAD_REQUEST", "Printing source has no image URL");
    }

    const cs = await db
      .selectFrom("card_sources")
      .select("source")
      .where("id", "=", ps.card_source_id)
      .executeTakeFirst();

    await db.transaction().execute(async (trx) => {
      await insertPrintingImage(
        trx,
        ps.printing_id as string,
        ps.image_url,
        cs?.source ?? "import",
        mode,
      );
    });

    return c.json({ ok: true });
  })

  // ── DELETE /printing-images/:imageId ──────────────────────────────────────
  .delete("/printing-images/:imageId", async (c) => {
    const { imageId } = c.req.param();

    const image = await db
      .selectFrom("printing_images")
      .select(["id", "rehosted_url"])
      .where("id", "=", imageId)
      .executeTakeFirst();

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    await db.deleteFrom("printing_images").where("id", "=", imageId).execute();

    if (image.rehosted_url) {
      await deleteRehostFiles(image.rehosted_url);
    }

    return c.json({ ok: true });
  })

  // ── POST /printing-images/:imageId/activate ──────────────────────────────
  .post(
    "/printing-images/:imageId/activate",
    zValidator("json", activateImageSchema),
    async (c) => {
      const { imageId } = c.req.param();
      const { active } = c.req.valid("json");

      const image = await db
        .selectFrom("printing_images")
        .innerJoin("printings", "printings.id", "printing_images.printing_id")
        .innerJoin("sets", "sets.id", "printings.set_id")
        .select([
          "printing_images.id",
          "printing_images.printing_id",
          "printing_images.face",
          "printing_images.rehosted_url",
          "printings.slug as printing_slug",
          "sets.slug as set_slug",
        ])
        .where("printing_images.id", "=", imageId)
        .executeTakeFirst();

      if (!image) {
        throw new AppError(404, "NOT_FOUND", "Printing image not found");
      }

      const baseFileBase = printingIdToFileBase(image.printing_slug);
      const mainPath = `/card-images/${image.set_slug}/${baseFileBase}`;

      // Find the currently active image (if any) for file rename purposes
      const currentActive = active
        ? await db
            .selectFrom("printing_images")
            .select(["id", "rehosted_url"])
            .where("printing_id", "=", image.printing_id)
            .where("face", "=", image.face)
            .where("is_active", "=", true)
            .executeTakeFirst()
        : null;

      await db.transaction().execute(async (trx) => {
        if (active && currentActive) {
          // Deactivate the current active image
          await trx
            .updateTable("printing_images")
            .set({ is_active: false, updated_at: new Date() })
            .where("id", "=", currentActive.id)
            .execute();

          // Rename current active's files: main path → ID-suffixed path
          if (currentActive.rehosted_url) {
            const demotedPath = `${mainPath}-${currentActive.id}`;
            await renameRehostFiles(currentActive.rehosted_url, demotedPath);
            await trx
              .updateTable("printing_images")
              .set({ rehosted_url: demotedPath, updated_at: new Date() })
              .where("id", "=", currentActive.id)
              .execute();
          }
        }

        await trx
          .updateTable("printing_images")
          .set({ is_active: active, updated_at: new Date() })
          .where("id", "=", imageId)
          .execute();

        if (active && image.rehosted_url) {
          // Rename newly active image's files: ID-suffixed path → main path
          await renameRehostFiles(image.rehosted_url, mainPath);
          await trx
            .updateTable("printing_images")
            .set({ rehosted_url: mainPath, updated_at: new Date() })
            .where("id", "=", imageId)
            .execute();
        } else if (!active && image.rehosted_url) {
          // Demoting: rename from main path → ID-suffixed path
          const demotedPath = `${mainPath}-${image.id}`;
          await renameRehostFiles(image.rehosted_url, demotedPath);
          await trx
            .updateTable("printing_images")
            .set({ rehosted_url: demotedPath, updated_at: new Date() })
            .where("id", "=", imageId)
            .execute();
        }
      });

      return c.json({ ok: true });
    },
  )

  // ── POST /printing-images/:imageId/unrehost ──────────────────────────────
  .post("/printing-images/:imageId/unrehost", async (c) => {
    const { imageId } = c.req.param();

    const image = await db
      .selectFrom("printing_images")
      .select(["id", "rehosted_url", "original_url"])
      .where("id", "=", imageId)
      .executeTakeFirst();

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    if (!image.rehosted_url) {
      throw new AppError(400, "BAD_REQUEST", "Image is not rehosted");
    }

    await deleteRehostFiles(image.rehosted_url);

    await db
      .updateTable("printing_images")
      .set({ rehosted_url: null, updated_at: new Date() })
      .where("id", "=", imageId)
      .execute();

    return c.json({ ok: true });
  })

  // ── POST /printing-images/:imageId/rehost ────────────────────────────────
  .post("/printing-images/:imageId/rehost", async (c) => {
    const { imageId } = c.req.param();

    const image = await db
      .selectFrom("printing_images")
      .innerJoin("printings", "printings.id", "printing_images.printing_id")
      .innerJoin("sets", "sets.id", "printings.set_id")
      .select([
        "printing_images.id",
        "printing_images.printing_id",
        "printing_images.original_url",
        "printing_images.is_active",
        "printings.slug as printing_slug",
        "sets.slug as set_slug",
      ])
      .where("printing_images.id", "=", imageId)
      .executeTakeFirst();

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    if (!image.original_url) {
      throw new AppError(400, "BAD_REQUEST", "Image has no original URL to rehost");
    }

    const { buffer, ext } = await downloadImage(image.original_url);
    const baseFileBase = printingIdToFileBase(image.printing_slug);
    const fileBase = image.is_active ? baseFileBase : `${baseFileBase}-${image.id}`;
    const outputDir = join(CARD_IMAGES_DIR, image.set_slug);

    await processAndSave(buffer, ext, outputDir, fileBase);

    const rehostedUrl = `/card-images/${image.set_slug}/${fileBase}`;

    await db
      .updateTable("printing_images")
      .set({ rehosted_url: rehostedUrl, updated_at: new Date() })
      .where("id", "=", imageId)
      .execute();

    return c.json({ ok: true, rehostedUrl });
  })

  // ── POST /printing/:printingId/add-image-url ─────────────────────────────
  .post("/printing/:printingId/add-image-url", zValidator("json", addImageUrlSchema), async (c) => {
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

    return c.json({ ok: true });
  })

  // ── POST /printing/:printingId/upload-image ──────────────────────────────
  .post(
    "/printing/:printingId/upload-image",
    zValidator("form", uploadImageFormSchema),
    async (c) => {
      const printingSlug = c.req.param("printingId");

      const printing = await db
        .selectFrom("printings")
        .innerJoin("sets", "sets.id", "printings.set_id")
        .select(["printings.id", "sets.slug as set_slug"])
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
      const outputDir = join(CARD_IMAGES_DIR, printing.set_slug);

      // Insert the DB row first so we have the ID for non-main file paths
      const imageRow = await db.transaction().execute(async (trx) => {
        if (mode === "main") {
          await trx
            .updateTable("printing_images")
            .set({ is_active: false, updated_at: new Date() })
            .where("printing_id", "=", printing.id)
            .where("face", "=", "front")
            .where("is_active", "=", true)
            .execute();
        }

        return trx
          .insertInto("printing_images")
          .values({
            printing_id: printing.id,
            face: "front",
            source,
            is_active: mode === "main",
          })
          .onConflict((oc) =>
            oc.columns(["printing_id", "face", "source"]).doUpdateSet({
              is_active: mode === "main",
              updated_at: new Date(),
            }),
          )
          .returning("id")
          .executeTakeFirstOrThrow();
      });

      const fileBase = mode === "main" ? baseFileBase : `${baseFileBase}-${imageRow.id}`;
      await processAndSave(buffer, ext, outputDir, fileBase);

      const rehostedUrl = `/card-images/${printing.set_slug}/${fileBase}`;

      await db
        .updateTable("printing_images")
        .set({ rehosted_url: rehostedUrl, updated_at: new Date() })
        .where("id", "=", imageRow.id)
        .execute();

      return c.json({ ok: true, rehostedUrl });
    },
  );
