import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { copyMetadataResponseShape } from "@openrift/shared/response-schemas";
import { copiesQuerySchema } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const publicCollectionResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    copyCount: z.number(),
    totalValueCents: z.number().int().nullable(),
    unpricedCopyCount: z.number().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PublicCollectionResponse");

/** Deliberately narrower than {@link copyResponseSchema}: `groupId`/`collectionId` are owner-internal and `notesPrivate` never leaves authenticated surfaces. */
export const publicCopyResponseSchema = z
  .object({
    id: z.string(),
    printingId: z.string(),
    ...copyMetadataResponseShape,
  })
  .openapi("PublicCopyResponse");

export const publicCollectionDetailResponseSchema = z
  .object({
    collection: publicCollectionResponseSchema,
    items: z.array(publicCopyResponseSchema),
    nextCursor: z.string().nullable(),
    owner: z.object({ displayName: z.string(), gravatarHash: z.string().nullable() }),
  })
  .openapi("PublicCollectionDetailResponse");

export const publicCollectionsContract = {
  share: oc
    .route({ method: "GET", path: "/api/v1/collections/share/{token}", tags: ["Collections"] })
    .meta({ auth: "public", cache: "short" })
    .input(z.object({ token: z.string().min(1) }).extend(copiesQuerySchema.shape))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicCollectionDetailResponseSchema),
};

export type PublicCollectionsContract = typeof publicCollectionsContract;
