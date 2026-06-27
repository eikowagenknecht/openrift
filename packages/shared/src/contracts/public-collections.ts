import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
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

/**
 * Copy projection for anonymous share viewers — deliberately narrower than
 * {@link copyResponseSchema}: `groupId`/`collectionId` are owner-internal and
 * are withheld from unauthenticated viewers.
 */
export const publicCopyResponseSchema = z
  .object({
    id: z.string(),
    printingId: z.string(),
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

/**
 * oRPC contract for the public (share-token) collection view.
 * `GET /api/v1/collections/share/{token}?cursor&limit` — anonymous, paginated
 * view of a shared collection, or a typed NOT_FOUND for an unknown token. The
 * `{token}` path segment merges into the input alongside the copies query.
 */
export const publicCollectionsContract = {
  share: oc
    .route({ method: "GET", path: "/api/v1/collections/share/{token}", tags: ["Collections"] })
    .meta({ auth: "public" })
    .input(z.object({ token: z.string().min(1) }).extend(copiesQuerySchema.shape))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicCollectionDetailResponseSchema),
};

export type PublicCollectionsContract = typeof publicCollectionsContract;
