// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem path join
import { join } from "node:path";

import { ERROR_CODES } from "@openrift/shared";
import { adminCardImagesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";
import { v7 as uuidv7 } from "uuid";

import { AppError } from "../../../errors.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import {
  CARD_MEDIA_DIR,
  deleteRehostFiles,
  downloadImage,
  imageRehostedUrl,
  processAndSave,
  regenerateFromOrig,
  rehostSingleImage,
} from "../../../services/image-rehost.js";
import { assertFound } from "../../../utils/assertions.js";

const os = implement(adminCardImagesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin card-image tooling. Not-found / bad-request / payload-too-large states
 * are thrown as `AppError` (via {@link assertFound} or directly) and mapped by
 * the handler's appErrorInterceptor. `uploadImage` reads its `File` from the
 * multipart body.
 */
export const adminCardImagesRouter = {
  setImage: os.setImage.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { id, mode } = input;

    const ps = await printingImages.getCandidatePrintingById(id);
    assertFound(ps, "Candidate printing not found");

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

    const imageId = await context.transact((trxRepos) =>
      trxRepos.printingImages.insertImage(ps.printingId as string, ps.imageUrl, mode),
    );

    // Auto-rehost the accepted image (best-effort, non-blocking)
    if (imageId) {
      await rehostSingleImage(context.io, printingImages, imageId);
    }
  }),

  deleteImage: os.deleteImage.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { imageId } = input;

    const image = await printingImages.getIdAndRehostedUrl(imageId);
    assertFound(image, "Printing image not found");

    const imageFileId = await printingImages.getImageFileId(imageId);

    // Check if another printing_image shares the same image_file before deleting files
    const othersUsingFiles = imageFileId
      ? await printingImages.countOthersByImageFileId(imageFileId, imageId)
      : 0;

    await printingImages.deleteById(imageId);

    if (image.rehostedUrl && othersUsingFiles === 0) {
      await deleteRehostFiles(context.io, image.rehostedUrl);
      // Clean up the orphaned image_files row
      await printingImages.deleteOrphanedImageFiles();
    }
  }),

  activateImage: os.activateImage.handler(async ({ input, context }): Promise<void> => {
    const transact = context.transact;
    const { printingImages } = context.repos;
    const { imageId, active } = input;

    const image = await printingImages.getForActivate(imageId);
    assertFound(image, "Printing image not found");

    await transact(async (trxRepos) => {
      if (active) {
        // Deactivate the current active image (if any)
        await trxRepos.printingImages.deactivateActiveFront(image.printingId);
      }

      await trxRepos.printingImages.setActive(imageId, active);
    });
  }),

  unrehostImage: os.unrehostImage.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { imageId } = input;

    const image = await printingImages.getIdAndUrls(imageId);
    assertFound(image, "Printing image not found");

    if (!image.rehostedUrl) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Image is not rehosted");
    }

    if (!image.originalUrl) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "Cannot un-rehost: image has no original URL to fall back to",
      );
    }

    const imageFileId = await printingImages.getImageFileId(imageId);
    if (!imageFileId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Image has no associated image file");
    }

    // Only delete files if no other printing_image shares the same image_file
    const othersUsingFiles = await printingImages.countOthersByImageFileId(imageFileId, imageId);
    if (othersUsingFiles === 0) {
      await deleteRehostFiles(context.io, image.rehostedUrl);
    }

    await printingImages.updateRehostedUrl(imageFileId, null);
  }),

  rehostImage: os.rehostImage.handler(async ({ input, context }) => {
    const { printingImages } = context.repos;
    const { imageId } = input;

    const image = await printingImages.getForRehost(imageId);
    assertFound(image, "Printing image not found");

    if (!image.originalUrl) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Image has no original URL to rehost");
    }

    const { buffer, ext } = await downloadImage(context.io, image.originalUrl);
    const rehostedUrl = imageRehostedUrl(image.imageFileId);
    const outputDir = join(CARD_MEDIA_DIR, image.imageFileId.slice(-2));

    await processAndSave(
      context.io,
      buffer,
      ext,
      outputDir,
      image.imageFileId,
      image.rotation,
      image.needsTrim,
    );

    await printingImages.updateRehostedUrl(image.imageFileId, rehostedUrl);

    return { rehostedUrl };
  }),

  rotateImage: os.rotateImage.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { imageId, rotation } = input;

    const image = await printingImages.getForRehost(imageId);
    assertFound(image, "Printing image not found");

    await printingImages.setRotation(image.imageFileId, rotation);
    await regenerateFromOrig(
      context.io,
      image.imageFileId,
      rotation,
      image.needsTrim,
      image.originalUrl,
    );
  }),

  setNeedsTrim: os.setNeedsTrim.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { imageId, needsTrim } = input;

    const image = await printingImages.getForRehost(imageId);
    assertFound(image, "Printing image not found");

    await printingImages.setNeedsTrim(image.imageFileId, needsTrim);
    await regenerateFromOrig(
      context.io,
      image.imageFileId,
      image.rotation,
      needsTrim,
      image.originalUrl,
    );
  }),

  addImageUrl: os.addImageUrl.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { printingId, url: rawUrl, mode: rawMode } = input;

    if (!rawUrl?.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "url is required");
    }

    const printing = await printingImages.getPrintingById(printingId);
    assertFound(printing, "Printing not found");

    const mode = rawMode ?? "main";
    const url = rawUrl.trim();

    await context.transact(async (trxRepos) => {
      await trxRepos.printingImages.insertImage(printing.id, url, mode);
    });
  }),

  uploadImage: os.uploadImage.handler(async ({ input, context }) => {
    const { printingImages } = context.repos;
    const { printingId, file, mode: rawMode } = input;

    const printing = await printingImages.getPrintingById(printingId);
    assertFound(printing, "Printing not found");

    const mode = rawMode === "additional" ? ("additional" as const) : ("main" as const);

    const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, "File exceeds 50 MB limit");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name ? `.${file.name.split(".").pop()?.toLowerCase() ?? "png"}` : ".png";

    // Pre-compute paths so rehostedUrl can be included in the INSERT
    const imageId = uuidv7();
    const rehostedUrl = imageRehostedUrl(imageId);
    const outputDir = join(CARD_MEDIA_DIR, imageId.slice(-2));

    // New uploads default to needsTrim=false (digital). Admin opts in via the
    // needs-trim toggle after upload — see set-needs-trim route.
    await processAndSave(context.io, buffer, ext, outputDir, imageId, 0, false);

    await context.transact((trxRepos) =>
      trxRepos.printingImages.insertUploadedImage({
        id: imageId,
        printingId: printing.id,
        rehostedUrl,
        mode,
      }),
    );

    return { rehostedUrl };
  }),
};
