// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem path join
import { join } from "node:path";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { v7 as uuidv7 } from "uuid";

import { AppError } from "../../../errors.js";
import {
  CARD_IMAGES_DIR,
  deleteRehostFiles,
  downloadImage,
  printingIdToFileBase,
  processAndSave,
  renameRehostFiles,
} from "../../../services/image-rehost.js";
import type { Variables } from "../../../types.js";
import {
  activateImageSchema,
  addImageUrlSchema,
  setImageSchema,
  uploadImageFormSchema,
} from "./schemas.js";

// ── POST /candidate-printings/:id/set-image ────────────────────────────────────
export const imagesRoute = new Hono<{ Variables: Variables }>()
  .post("/candidate-printings/:id/set-image", zValidator("json", setImageSchema), async (c) => {
    const db = c.get("db");
    const { printingImages } = c.get("repos");
    const { id } = c.req.param();
    const { mode } = c.req.valid("json");

    const ps = await printingImages.getCandidatePrintingById(id);

    if (!ps) {
      throw new AppError(404, "NOT_FOUND", "Candidate printing not found");
    }

    if (!ps.printingId) {
      throw new AppError(400, "BAD_REQUEST", "Candidate printing not linked to a printing");
    }

    if (!ps.imageUrl) {
      throw new AppError(400, "BAD_REQUEST", "Candidate printing has no image URL");
    }

    const cs = await printingImages.getCandidateCardProvider(ps.candidateCardId);

    await db.transaction().execute(async (trx) => {
      await printingImages.insertImage(
        trx,
        ps.printingId as string,
        ps.imageUrl,
        cs?.provider ?? "import",
        mode,
      );
    });

    return c.body(null, 204);
  })

  // ── DELETE /printing-images/:imageId ──────────────────────────────────────
  .delete("/printing-images/:imageId", async (c) => {
    const { printingImages } = c.get("repos");
    const { imageId } = c.req.param();

    const image = await printingImages.getIdAndRehostedUrl(imageId);

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    await printingImages.deleteById(imageId);

    if (image.rehostedUrl) {
      await deleteRehostFiles(c.get("io"), image.rehostedUrl);
    }

    return c.body(null, 204);
  })

  // ── POST /printing-images/:imageId/activate ──────────────────────────────
  .post(
    "/printing-images/:imageId/activate",
    zValidator("json", activateImageSchema),
    async (c) => {
      const db = c.get("db");
      const { printingImages } = c.get("repos");
      const { imageId } = c.req.param();
      const { active } = c.req.valid("json");

      const image = await printingImages.getWithPrintingAndSetForActivate(imageId);

      if (!image) {
        throw new AppError(404, "NOT_FOUND", "Printing image not found");
      }

      const baseFileBase = printingIdToFileBase(image.printingSlug);
      const mainPath = `/card-images/${image.setSlug}/${baseFileBase}`;

      // Find the currently active image (if any) for file rename purposes
      const currentActive = active
        ? await printingImages.getActiveFrontImage(image.printingId, image.face)
        : null;

      await db.transaction().execute(async (trx) => {
        if (active && currentActive) {
          // Deactivate the current active image
          await printingImages.deactivate(currentActive.id, trx);

          // Rename current active's files: main path → ID-suffixed path
          if (currentActive.rehostedUrl) {
            const demotedPath = `${mainPath}-${currentActive.id}`;
            await renameRehostFiles(c.get("io"), currentActive.rehostedUrl, demotedPath);
            await printingImages.updateRehostedUrlTrx(currentActive.id, demotedPath, trx);
          }
        }

        await printingImages.setActive(imageId, active, trx);

        if (active && image.rehostedUrl) {
          // Rename newly active image's files: ID-suffixed path → main path
          await renameRehostFiles(c.get("io"), image.rehostedUrl, mainPath);
          await printingImages.updateRehostedUrlTrx(imageId, mainPath, trx);
        } else if (!active && image.rehostedUrl) {
          // Demoting: rename from main path → ID-suffixed path
          const demotedPath = `${mainPath}-${image.id}`;
          await renameRehostFiles(c.get("io"), image.rehostedUrl, demotedPath);
          await printingImages.updateRehostedUrlTrx(imageId, demotedPath, trx);
        }
      });

      return c.body(null, 204);
    },
  )

  // ── POST /printing-images/:imageId/unrehost ──────────────────────────────
  .post("/printing-images/:imageId/unrehost", async (c) => {
    const { printingImages } = c.get("repos");
    const { imageId } = c.req.param();

    const image = await printingImages.getIdAndUrls(imageId);

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    if (!image.rehostedUrl) {
      throw new AppError(400, "BAD_REQUEST", "Image is not rehosted");
    }

    await deleteRehostFiles(c.get("io"), image.rehostedUrl);

    await printingImages.updateRehostedUrl(imageId, null);

    return c.body(null, 204);
  })

  // ── POST /printing-images/:imageId/rehost ────────────────────────────────
  .post("/printing-images/:imageId/rehost", async (c) => {
    const { printingImages } = c.get("repos");
    const { imageId } = c.req.param();

    const image = await printingImages.getWithPrintingAndSetForRehost(imageId);

    if (!image) {
      throw new AppError(404, "NOT_FOUND", "Printing image not found");
    }

    if (!image.originalUrl) {
      throw new AppError(400, "BAD_REQUEST", "Image has no original URL to rehost");
    }

    const { buffer, ext } = await downloadImage(c.get("io"), image.originalUrl);
    const baseFileBase = printingIdToFileBase(image.printingSlug);
    const fileBase = image.isActive ? baseFileBase : `${baseFileBase}-${image.id}`;
    const outputDir = join(CARD_IMAGES_DIR, image.setSlug);

    await processAndSave(c.get("io"), buffer, ext, outputDir, fileBase);

    const rehostedUrl = `/card-images/${image.setSlug}/${fileBase}`;

    await printingImages.updateRehostedUrl(imageId, rehostedUrl);

    return c.json({ rehostedUrl });
  })

  // ── POST /printing/:printingId/add-image-url ─────────────────────────────
  .post("/printing/:printingId/add-image-url", zValidator("json", addImageUrlSchema), async (c) => {
    const db = c.get("db");
    const { printingImages } = c.get("repos");
    const printingSlug = c.req.param("printingId");
    const body = c.req.valid("json");

    if (!body.url?.trim()) {
      throw new AppError(400, "BAD_REQUEST", "url is required");
    }

    const printing = await printingImages.getPrintingIdBySlug(printingSlug);
    if (!printing) {
      throw new AppError(404, "NOT_FOUND", "Printing not found");
    }

    const mode = body.mode ?? "main";
    const provider = body.provider?.trim() || "manual";

    await db.transaction().execute(async (trx) => {
      await printingImages.insertImage(trx, printing.id, body.url.trim(), provider, mode);
    });

    return c.body(null, 204);
  })

  // ── POST /printing/:printingId/upload-image ──────────────────────────────
  .post(
    "/printing/:printingId/upload-image",
    zValidator("form", uploadImageFormSchema),
    async (c) => {
      const db = c.get("db");
      const { printingImages } = c.get("repos");
      const printingSlug = c.req.param("printingId");

      const printing = await printingImages.getPrintingWithSetBySlug(printingSlug);

      if (!printing) {
        throw new AppError(404, "NOT_FOUND", "Printing not found");
      }

      const body = c.req.valid("form");
      const file = body.file;
      const mode = body.mode === "additional" ? ("additional" as const) : ("main" as const);
      const provider = body.provider?.trim() || "upload";

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name ? `.${file.name.split(".").pop()?.toLowerCase() ?? "png"}` : ".png";
      const baseFileBase = printingIdToFileBase(printingSlug);
      const outputDir = join(CARD_IMAGES_DIR, printing.setSlug);

      // Pre-compute paths so rehostedUrl can be included in the INSERT
      // (chk_printing_images_has_url requires at least one URL at insert time)
      const imageId = mode === "additional" ? uuidv7() : undefined;
      const fileBase = mode === "main" ? baseFileBase : `${baseFileBase}-${imageId}`;
      const rehostedUrl = `/card-images/${printing.setSlug}/${fileBase}`;

      await processAndSave(c.get("io"), buffer, ext, outputDir, fileBase);

      await db.transaction().execute(async (trx) => {
        await printingImages.insertUploadedImage(trx, {
          id: imageId,
          printingId: printing.id,
          provider,
          rehostedUrl,
          mode,
        });
      });

      return c.json({ rehostedUrl });
    },
  );
