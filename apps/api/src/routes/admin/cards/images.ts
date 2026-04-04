// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem path join
import { join } from "node:path";

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../../errors.js";
import {
  CARD_IMAGES_DIR,
  deleteRehostFiles,
  downloadImage,
  imageRehostedUrl,
  processAndSave,
  rehostSingleImage,
} from "../../../services/image-rehost.js";
import type { Variables } from "../../../types.js";
import {
  activateImageSchema,
  addImageUrlSchema,
  setImageSchema,
  uploadImageFormSchema,
} from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const setImage = createRoute({
  method: "post",
  path: "/candidate-printings/{id}/set-image",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: setImageSchema } } },
  },
  responses: {
    204: { description: "Image set" },
  },
});

const deleteImage = createRoute({
  method: "delete",
  path: "/printing-images/{imageId}",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ imageId: z.string() }),
  },
  responses: {
    204: { description: "Image deleted" },
  },
});

const activateImage = createRoute({
  method: "post",
  path: "/printing-images/{imageId}/activate",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ imageId: z.string() }),
    body: { content: { "application/json": { schema: activateImageSchema } } },
  },
  responses: {
    204: { description: "Image activation toggled" },
  },
});

const unrehostImage = createRoute({
  method: "post",
  path: "/printing-images/{imageId}/unrehost",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ imageId: z.string() }),
  },
  responses: {
    204: { description: "Image unrehosted" },
  },
});

const rehostImage = createRoute({
  method: "post",
  path: "/printing-images/{imageId}/rehost",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ imageId: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ rehostedUrl: z.string() }) },
      },
      description: "Image rehosted",
    },
  },
});

const addImageUrl = createRoute({
  method: "post",
  path: "/printing/{printingId}/add-image-url",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ printingId: z.string() }),
    body: { content: { "application/json": { schema: addImageUrlSchema } } },
  },
  responses: {
    204: { description: "Image URL added" },
  },
});

const uploadImage = createRoute({
  method: "post",
  path: "/printing/{printingId}/upload-image",
  tags: ["Admin - Cards"],
  request: {
    params: z.object({ printingId: z.string() }),
    body: { content: { "multipart/form-data": { schema: uploadImageFormSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ rehostedUrl: z.string() }) },
      },
      description: "Image uploaded",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

// ── POST /candidate-printings/:id/set-image ────────────────────────────────────
export const imagesRoute = new OpenAPIHono<{ Variables: Variables }>()
  .openapi(setImage, async (c) => {
    const { printingImages } = c.get("repos");
    const { id } = c.req.valid("param");
    const { mode } = c.req.valid("json");

    const ps = await printingImages.getCandidatePrintingById(id);

    if (!ps) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Candidate printing not found");
    }

    if (!ps.printingId) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "Candidate printing not linked to a printing",
      );
    }

    if (!ps.imageUrl) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Candidate printing has no image URL");
    }

    const cs = await printingImages.getCandidateCardProvider(ps.candidateCardId);

    const imageId = await c.get("transact")((trxRepos) =>
      trxRepos.printingImages.insertImage(
        ps.printingId as string,
        ps.imageUrl,
        cs?.provider ?? "import",
        mode,
      ),
    );

    // Auto-rehost the accepted image (best-effort, non-blocking)
    if (imageId) {
      await rehostSingleImage(c.get("io"), printingImages, imageId);
    }

    return c.body(null, 204);
  })

  // ── DELETE /printing-images/:imageId ──────────────────────────────────────
  .openapi(deleteImage, async (c) => {
    const { printingImages } = c.get("repos");
    const { imageId } = c.req.valid("param");

    const image = await printingImages.getIdAndRehostedUrl(imageId);

    if (!image) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Printing image not found");
    }

    // Check if another image shares the same rehosted files before deleting
    const othersUsingFiles = image.rehostedUrl
      ? await printingImages.countOthersByRehostedUrl(image.rehostedUrl, imageId)
      : 0;

    await printingImages.deleteById(imageId);

    if (image.rehostedUrl && othersUsingFiles === 0) {
      await deleteRehostFiles(c.get("io"), image.rehostedUrl);
    }

    return c.body(null, 204);
  })

  // ── POST /printing-images/:imageId/activate ──────────────────────────────
  .openapi(activateImage, async (c) => {
    const transact = c.get("transact");
    const { printingImages } = c.get("repos");
    const { imageId } = c.req.valid("param");
    const { active } = c.req.valid("json");

    const image = await printingImages.getForActivate(imageId);

    if (!image) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Printing image not found");
    }

    await transact(async (trxRepos) => {
      if (active) {
        // Deactivate the current active image (if any)
        await trxRepos.printingImages.deactivateActiveFront(image.printingId);
      }

      await trxRepos.printingImages.setActive(imageId, active);
    });

    return c.body(null, 204);
  })

  // ── POST /printing-images/:imageId/unrehost ──────────────────────────────
  .openapi(unrehostImage, async (c) => {
    const { printingImages } = c.get("repos");
    const { imageId } = c.req.valid("param");

    const image = await printingImages.getIdAndUrls(imageId);

    if (!image) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Printing image not found");
    }

    if (!image.rehostedUrl) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Image is not rehosted");
    }

    if (!image.originalUrl) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        "Cannot un-rehost: image has no original URL to fall back to",
      );
    }

    // Only delete files if no other image shares the same rehosted URL
    const othersUsingFiles = await printingImages.countOthersByRehostedUrl(
      image.rehostedUrl,
      imageId,
    );
    if (othersUsingFiles === 0) {
      await deleteRehostFiles(c.get("io"), image.rehostedUrl);
    }

    await printingImages.updateRehostedUrl(imageId, null);

    return c.body(null, 204);
  })

  // ── POST /printing-images/:imageId/rehost ────────────────────────────────
  .openapi(rehostImage, async (c) => {
    const { printingImages } = c.get("repos");
    const { imageId } = c.req.valid("param");

    const image = await printingImages.getForRehost(imageId);

    if (!image) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Printing image not found");
    }

    if (!image.originalUrl) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Image has no original URL to rehost");
    }

    const { buffer, ext } = await downloadImage(c.get("io"), image.originalUrl);
    const outputDir = join(CARD_IMAGES_DIR, image.setSlug);

    await processAndSave(c.get("io"), buffer, ext, outputDir, imageId);

    const rehostedUrl = imageRehostedUrl(image.setSlug, imageId);

    await printingImages.updateRehostedUrl(imageId, rehostedUrl);

    return c.json({ rehostedUrl });
  })

  // ── POST /printing/:printingId/add-image-url ─────────────────────────────
  .openapi(addImageUrl, async (c) => {
    const { printingImages } = c.get("repos");
    const printingId = c.req.valid("param").printingId;
    const body = c.req.valid("json");

    if (!body.url?.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "url is required");
    }

    const printing = await printingImages.getPrintingById(printingId);
    if (!printing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Printing not found");
    }

    const mode = body.mode ?? "main";
    const provider = body.provider?.trim() || "manual";

    await c.get("transact")(async (trxRepos) => {
      await trxRepos.printingImages.insertImage(printing.id, body.url.trim(), provider, mode);
    });

    return c.body(null, 204);
  })

  // ── POST /printing/:printingId/upload-image ──────────────────────────────
  .openapi(uploadImage, async (c) => {
    const { printingImages } = c.get("repos");
    const printingId = c.req.valid("param").printingId;

    const printing = await printingImages.getPrintingWithSetById(printingId);

    if (!printing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Printing not found");
    }

    const body = c.req.valid("form");
    const file = body.file;
    const mode = body.mode === "additional" ? ("additional" as const) : ("main" as const);
    const provider = body.provider?.trim() || "upload";

    const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, "File exceeds 50 MB limit");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name ? `.${file.name.split(".").pop()?.toLowerCase() ?? "png"}` : ".png";
    const outputDir = join(CARD_IMAGES_DIR, printing.setSlug);

    // Pre-compute paths so rehostedUrl can be included in the INSERT
    // (chk_printing_images_has_url requires at least one URL at insert time)
    const imageId = uuidv7();
    const rehostedUrl = imageRehostedUrl(printing.setSlug, imageId);

    await processAndSave(c.get("io"), buffer, ext, outputDir, imageId);

    await c.get("transact")(async (trxRepos) => {
      await trxRepos.printingImages.insertUploadedImage({
        id: imageId,
        printingId: printing.id,
        provider,
        rehostedUrl,
        mode,
      });
    });

    return c.json({ rehostedUrl });
  });
