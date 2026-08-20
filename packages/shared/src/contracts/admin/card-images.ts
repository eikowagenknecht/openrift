import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Cards";

const idParam = z.object({ id: z.uuid() });
const imageIdParam = z.object({ imageId: z.uuid() });
const printingIdParam = z.object({ printingId: z.uuid() });

const modeSchema = z.enum(["main", "additional"]);
const rehostedUrlOutput = z.object({ rehostedUrl: z.string() });

/**
 * oRPC contract for the admin card-image tooling (mounted under
 * `/api/admin/v1/cards`, admin-gated by the mount). Each verb carries its body
 * fields alongside its `{id}` / `{imageId}` / `{printingId}` path param (oRPC
 * compact input); `uploadImage` takes a `multipart/form-data` body with the
 * uploaded `File`. Domain codes per route: most image verbs → NOT_FOUND;
 * `setImage` / `unrehostImage` / `rehostImage` / `addImageUrl` → BAD_REQUEST;
 * `uploadImage` → PAYLOAD_TOO_LARGE (file over 50 MB).
 *
 * The three `fallbackArt` verbs manage the substitute artwork shown for a
 * printing that has no scan of its own (migration 257) — `setFallbackArt`
 * switches the mode and pins an image file the catalogue already holds, while
 * the `from-url` and `upload` pair ingest art from outside it and pin the
 * result. They never touch `printing_images`: a substitute is not a scan of the
 * printing showing it, and recording it as one would make the printing count as
 * photographed everywhere we track coverage.
 */
export const adminCardImagesContract = {
  setImage: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/candidate-printings/{id}/set-image",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Candidate printing not found" },
      BAD_REQUEST: { message: "Candidate printing is not ready for image assignment" },
    })
    .input(idParam.extend({ mode: modeSchema })),
  deleteImage: authedRoute
    .route({
      method: "DELETE",
      path: "/api/admin/v1/cards/printing-images/{imageId}",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Printing image not found" } })
    .input(imageIdParam),
  activateImage: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/activate",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Printing image not found" } })
    .input(imageIdParam.extend({ active: z.boolean() })),
  unrehostImage: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/unrehost",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Printing image not found" },
      BAD_REQUEST: { message: "Image cannot be un-rehosted" },
    })
    .input(imageIdParam),
  rehostImage: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/rehost",
      tags: [TAG],
    })
    .errors({
      NOT_FOUND: { message: "Printing image not found" },
      BAD_REQUEST: { message: "Image has no original URL to rehost" },
    })
    .input(imageIdParam)
    .output(rehostedUrlOutput),
  rotateImage: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/rotate",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Printing image not found" } })
    .input(
      imageIdParam.extend({
        rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      }),
    ),
  setNeedsTrim: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/set-needs-trim",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Printing image not found" } })
    .input(imageIdParam.extend({ needsTrim: z.boolean() })),
  addImageUrl: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing/{printingId}/add-image-url",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Printing not found" },
      BAD_REQUEST: { message: "Image URL is required" },
    })
    .input(printingIdParam.extend({ url: z.string(), mode: modeSchema.optional() })),
  uploadImage: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing/{printingId}/upload-image",
      tags: [TAG],
    })
    .errors({
      NOT_FOUND: { message: "Printing not found" },
      PAYLOAD_TOO_LARGE: { message: "File exceeds 50 MB limit" },
    })
    .input(printingIdParam.extend({ file: z.instanceof(File), mode: modeSchema.optional() }))
    .output(rehostedUrlOutput),
  setFallbackArt: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing/{printingId}/fallback-art",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Printing not found" },
      BAD_REQUEST: { message: "Pinned fallback art needs an image file" },
    })
    .input(
      printingIdParam.extend({
        mode: z.enum(["auto", "pinned", "none"]),
        /** Required for `pinned`, rejected otherwise. */
        imageFileId: z.uuid().optional(),
      }),
    ),
  addFallbackArtUrl: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing/{printingId}/fallback-art/from-url",
      tags: [TAG],
      successStatus: 204,
    })
    .errors({
      NOT_FOUND: { message: "Printing not found" },
      BAD_REQUEST: { message: "Image URL is required" },
    })
    .input(printingIdParam.extend({ url: z.string() })),
  uploadFallbackArt: authedRoute
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing/{printingId}/fallback-art/upload",
      tags: [TAG],
    })
    .errors({
      NOT_FOUND: { message: "Printing not found" },
      PAYLOAD_TOO_LARGE: { message: "File exceeds 50 MB limit" },
    })
    .input(printingIdParam.extend({ file: z.instanceof(File) }))
    .output(rehostedUrlOutput),
};

export type AdminCardImagesContract = typeof adminCardImagesContract;
