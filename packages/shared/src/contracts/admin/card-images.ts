import { oc } from "@orpc/contract";
import { z } from "zod";

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
 * uploaded `File`. Not-found / bad-request / payload-too-large states are
 * thrown as `AppError` and bridged to ORPCErrors.
 */
export const adminCardImagesContract = {
  setImage: oc
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/candidate-printings/{id}/set-image",
      tags: [TAG],
      successStatus: 204,
    })
    .input(idParam.extend({ mode: modeSchema })),
  deleteImage: oc
    .route({
      method: "DELETE",
      path: "/api/admin/v1/cards/printing-images/{imageId}",
      tags: [TAG],
      successStatus: 204,
    })
    .input(imageIdParam),
  activateImage: oc
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/activate",
      tags: [TAG],
      successStatus: 204,
    })
    .input(imageIdParam.extend({ active: z.boolean() })),
  unrehostImage: oc
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/unrehost",
      tags: [TAG],
      successStatus: 204,
    })
    .input(imageIdParam),
  rehostImage: oc
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/rehost",
      tags: [TAG],
    })
    .input(imageIdParam)
    .output(rehostedUrlOutput),
  rotateImage: oc
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/rotate",
      tags: [TAG],
      successStatus: 204,
    })
    .input(
      imageIdParam.extend({
        rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      }),
    ),
  setNeedsTrim: oc
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing-images/{imageId}/set-needs-trim",
      tags: [TAG],
      successStatus: 204,
    })
    .input(imageIdParam.extend({ needsTrim: z.boolean() })),
  addImageUrl: oc
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing/{printingId}/add-image-url",
      tags: [TAG],
      successStatus: 204,
    })
    .input(printingIdParam.extend({ url: z.string(), mode: modeSchema.optional() })),
  uploadImage: oc
    .route({
      method: "POST",
      path: "/api/admin/v1/cards/printing/{printingId}/upload-image",
      tags: [TAG],
    })
    .input(printingIdParam.extend({ file: z.instanceof(File), mode: modeSchema.optional() }))
    .output(rehostedUrlOutput),
};

export type AdminCardImagesContract = typeof adminCardImagesContract;
