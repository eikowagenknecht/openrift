// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem path join
import { join } from "node:path";

import { adminCardImagesContract } from "@openrift/shared/contracts/admin/card-images";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { implement } from "@orpc/server";
import { v7 as uuidv7 } from "uuid";

import { AppError } from "../../../errors.js";
import { assertFound } from "../../../lib/assertions.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import {
  assertCandidatePrintingsInScope,
  reviewableProviderScope,
} from "../../candidates/services/card-review-scope.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";
import { rehostImageFile, rehostSingleImage } from "../services/images/jobs.js";
import { fetchOriginalImage } from "../services/images/original-source.js";
import { CARD_MEDIA_DIR, imageRehostedUrl } from "../services/images/paths.js";
import {
  deleteRehostFiles,
  ensureOriginalOnDisk,
  processAndSave,
  regenerateFromOrig,
} from "../services/images/variants.js";
import { assertDeskPrintingScope, assertImageUploader } from "../services/printing-desk.js";

const os = implement(adminCardImagesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin card-image tooling. Not-found / bad-request / payload-too-large states
 * are thrown as `AppError` (via {@link assertFound} or directly) and mapped by
 * the handler's appErrorInterceptor. `uploadImage` reads its `File` from the
 * multipart body.
 */
export const adminCardImagesRouter = {
  setImage: os.setImage.handler(async ({ input, context }): Promise<void> => {
    const { printingImages, candidateCards, providerSettings } = context.repos;
    const { id, mode } = input;

    const scope = await reviewableProviderScope(context.adminAccess, providerSettings);
    await assertCandidatePrintingsInScope(candidateCards, [id], scope);

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

    if (imageId) {
      await rehostSingleImage(context.io, printingImages, imageId);
    }

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.set-from-candidate",
      entityType: "image",
      entityId: imageId ?? null,
      entityLabel: ps.shortCode,
      newValues: {
        candidatePrintingId: id,
        printingId: ps.printingId,
        imageUrl: ps.imageUrl,
        mode,
      },
    });
  }),

  deleteImage: os.deleteImage.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { imageId } = input;

    const image = await printingImages.getIdAndRehostedUrl(imageId);
    assertFound(image, "Printing image not found");

    const { adminAccess, userId } = context;
    await assertDeskPrintingScope(context.repos, adminAccess, userId, image.printingId);
    await assertImageUploader(context.repos, adminAccess, userId, imageId);

    const imageFileId = await printingImages.getImageFileId(imageId);

    // A pin can outlive the scan it was taken from, so check pins too before deleting the file from disk.
    const othersUsingFiles = imageFileId
      ? (await printingImages.countOthersByImageFileId(imageFileId, imageId)) +
        (await printingImages.countPinsByImageFileId(imageFileId))
      : 0;

    await printingImages.deleteById(imageId);

    if (image.rehostedUrl && othersUsingFiles === 0) {
      await deleteRehostFiles(context.io, image.rehostedUrl);
      await printingImages.deleteOrphanedImageFiles();
    }

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.delete",
      entityType: "image",
      entityId: imageId,
      oldValues: { rehostedUrl: image.rehostedUrl, imageFileId },
    });
  }),

  activateImage: os.activateImage.handler(async ({ input, context }): Promise<void> => {
    const transact = context.transact;
    const { printingImages } = context.repos;
    const { imageId, active } = input;

    const image = await printingImages.getForActivate(imageId);
    assertFound(image, "Printing image not found");
    await assertDeskPrintingScope(
      context.repos,
      context.adminAccess,
      context.userId,
      image.printingId,
    );

    await transact(async (trxRepos) => {
      if (active) {
        await trxRepos.printingImages.deactivateActiveFace(image.printingId, image.face);
      }

      await trxRepos.printingImages.setActive(imageId, active);
    });

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.activate",
      entityType: "image",
      entityId: imageId,
      newValues: { active, printingId: image.printingId, face: image.face },
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

    const othersUsingFiles = await printingImages.countOthersByImageFileId(imageFileId, imageId);
    if (othersUsingFiles === 0) {
      await deleteRehostFiles(context.io, image.rehostedUrl);
    }

    await printingImages.updateRehostedUrl(imageFileId, null);

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.unrehost",
      entityType: "image",
      entityId: imageId,
      oldValues: { rehostedUrl: image.rehostedUrl },
    });
  }),

  rehostImage: os.rehostImage.handler(async ({ input, context }) => {
    const { printingImages } = context.repos;
    const { imageId } = input;

    const image = await printingImages.getForRehost(imageId);
    assertFound(image, "Printing image not found");

    if (!image.originalUrl) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Image has no original URL to rehost");
    }

    const { buffer, ext } = await fetchOriginalImage(context.io, image.originalUrl);
    const rehostedUrl = imageRehostedUrl(image.imageFileId);
    const outputDir = join(CARD_MEDIA_DIR, image.imageFileId.slice(-2));

    // allowOverwrite=true: accepting a printing auto-rehosts in the background, so files usually
    // already exist by the time an admin clicks Rehost.
    await processAndSave(
      context.io,
      buffer,
      ext,
      outputDir,
      image.imageFileId,
      image.rotation,
      image.needsTrim,
      image.quad,
      true,
    );

    await printingImages.updateRehostedUrl(image.imageFileId, rehostedUrl);

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.rehost",
      entityType: "image",
      entityId: imageId,
      newValues: { rehostedUrl },
    });

    return { rehostedUrl };
  }),

  rotateImage: os.rotateImage.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { imageId, rotation } = input;

    const image = await printingImages.getForRehost(imageId);
    assertFound(image, "Printing image not found");
    await assertDeskPrintingScope(
      context.repos,
      context.adminAccess,
      context.userId,
      image.printingId,
    );

    await printingImages.setRotation(image.imageFileId, rotation);
    await regenerateFromOrig(
      context.io,
      image.imageFileId,
      rotation,
      image.needsTrim,
      image.quad,
      image.originalUrl,
    );

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.rotate",
      entityType: "image",
      entityId: imageId,
      oldValues: { rotation: image.rotation },
      newValues: { rotation },
    });
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
      image.quad,
      image.originalUrl,
    );

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.set-needs-trim",
      entityType: "image",
      entityId: imageId,
      oldValues: { needsTrim: image.needsTrim },
      newValues: { needsTrim },
    });
  }),

  setQuad: os.setQuad.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { imageId, quad } = input;

    const image = await printingImages.getForRehost(imageId);
    assertFound(image, "Printing image not found");
    await assertDeskPrintingScope(
      context.repos,
      context.adminAccess,
      context.userId,
      image.printingId,
    );

    // Stored only once the pipeline accepted the corners, so a rejected quad
    // leaves the variants and the row agreeing with each other.
    await regenerateFromOrig(
      context.io,
      image.imageFileId,
      image.rotation,
      image.needsTrim,
      quad,
      image.originalUrl,
    );
    await printingImages.setQuad(image.imageFileId, quad);

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.quad",
      entityType: "image",
      entityId: imageId,
      oldValues: { quad: image.quad },
      newValues: { quad },
    });
  }),

  ensureOriginal: os.ensureOriginal.handler(async ({ input, context }) => {
    const { printingImages } = context.repos;
    const { imageId } = input;

    const image = await printingImages.getForRehost(imageId);
    assertFound(image, "Printing image not found");
    await assertDeskPrintingScope(
      context.repos,
      context.adminAccess,
      context.userId,
      image.printingId,
    );

    return ensureOriginalOnDisk(
      context.io,
      image.imageFileId,
      image.rotation,
      image.needsTrim,
      image.quad,
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

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.add-url",
      entityType: "image",
      entityId: printingId,
      newValues: { url, mode },
    });
  }),

  uploadImage: os.uploadImage.handler(async ({ input, context }) => {
    const { printingImages } = context.repos;
    const { printingId, file, mode: rawMode, face: rawFace, credit } = input;

    const printing = await printingImages.getPrintingById(printingId);
    assertFound(printing, "Printing not found");
    await assertDeskPrintingScope(context.repos, context.adminAccess, context.userId, printing.id);

    const requested = rawMode === "additional" ? ("additional" as const) : ("main" as const);
    // A grant holder's upload never takes over the live art; activating stays a separate step.
    const mode = context.adminAccess?.isAdmin ? requested : ("additional" as const);
    const face = rawFace ?? "front";

    const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, "File exceeds 50 MB limit");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name ? `.${file.name.split(".").pop()?.toLowerCase() ?? "png"}` : ".png";

    const imageId = uuidv7();
    const rehostedUrl = imageRehostedUrl(imageId);
    const outputDir = join(CARD_MEDIA_DIR, imageId.slice(-2));

    await processAndSave(context.io, buffer, ext, outputDir, imageId, 0, false, null);

    await context.transact((trxRepos) =>
      trxRepos.printingImages.insertUploadedImage({
        id: imageId,
        printingId: printing.id,
        rehostedUrl,
        mode,
        face,
        credit,
      }),
    );

    await recordAdminEvent(context.repos, context.userId, {
      action: "image.upload",
      entityType: "image",
      entityId: imageId,
      newValues: { printingId: printing.id, mode, face, rehostedUrl, credit: credit ?? null },
    });

    return { rehostedUrl };
  }),

  setFallbackArt: os.setFallbackArt.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { printingId, mode, imageFileId } = input;

    const current = await printingImages.getFallbackArt(printingId);
    assertFound(current, "Printing not found");

    if (mode === "pinned" && !imageFileId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "imageFileId is required to pin");
    }
    if (mode !== "pinned" && imageFileId) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        `imageFileId is only valid with mode "pinned"`,
      );
    }
    if (imageFileId) {
      const file = await printingImages.getImageFileForRehost(imageFileId);
      assertFound(file, "Image file not found");
    }

    await printingImages.setFallbackArt(printingId, mode, imageFileId ?? null);

    await recordAdminEvent(context.repos, context.userId, {
      action: "printing.fallback-art",
      entityType: "printing",
      entityId: printingId,
      entityLabel: current.shortCode,
      oldValues: {
        fallbackArtMode: current.fallbackArtMode,
        fallbackImageFileId: current.fallbackImageFileId,
      },
      newValues: { fallbackArtMode: mode, fallbackImageFileId: imageFileId ?? null },
    });
  }),

  addFallbackArtUrl: os.addFallbackArtUrl.handler(async ({ input, context }): Promise<void> => {
    const { printingImages } = context.repos;
    const { printingId, url: rawUrl } = input;

    if (!rawUrl?.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "url is required");
    }

    const current = await printingImages.getFallbackArt(printingId);
    assertFound(current, "Printing not found");

    const url = rawUrl.trim();
    const imageFileId = await printingImages.imageFileForUrl(url);
    await printingImages.setFallbackArt(printingId, "pinned", imageFileId);

    // Best-effort: the catalog reports fallbackArtMode "auto" until the retry lands if this fails.
    await rehostImageFile(context.io, printingImages, imageFileId);

    await recordAdminEvent(context.repos, context.userId, {
      action: "printing.fallback-art",
      entityType: "printing",
      entityId: printingId,
      entityLabel: current.shortCode,
      oldValues: {
        fallbackArtMode: current.fallbackArtMode,
        fallbackImageFileId: current.fallbackImageFileId,
      },
      newValues: { fallbackArtMode: "pinned", fallbackImageFileId: imageFileId, url },
    });
  }),

  uploadFallbackArt: os.uploadFallbackArt.handler(async ({ input, context }) => {
    const { printingImages } = context.repos;
    const { printingId, file } = input;

    const current = await printingImages.getFallbackArt(printingId);
    assertFound(current, "Printing not found");

    const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, "File exceeds 50 MB limit");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name ? `.${file.name.split(".").pop()?.toLowerCase() ?? "png"}` : ".png";

    // Same pre-computed id/path pairing as uploadImage — regenerateFromOrig
    // derives the on-disk path from the image_files id.
    const imageFileId = uuidv7();
    const rehostedUrl = imageRehostedUrl(imageFileId);
    const outputDir = join(CARD_MEDIA_DIR, imageFileId.slice(-2));
    await processAndSave(context.io, buffer, ext, outputDir, imageFileId, 0, false, null);

    await context.transact(async (trxRepos) => {
      await trxRepos.printingImages.insertUnattachedImageFile({ id: imageFileId, rehostedUrl });
      await trxRepos.printingImages.setFallbackArt(printingId, "pinned", imageFileId);
    });

    await recordAdminEvent(context.repos, context.userId, {
      action: "printing.fallback-art",
      entityType: "printing",
      entityId: printingId,
      entityLabel: current.shortCode,
      oldValues: {
        fallbackArtMode: current.fallbackArtMode,
        fallbackImageFileId: current.fallbackImageFileId,
      },
      newValues: { fallbackArtMode: "pinned", fallbackImageFileId: imageFileId, rehostedUrl },
    });

    return { rehostedUrl };
  }),
};
