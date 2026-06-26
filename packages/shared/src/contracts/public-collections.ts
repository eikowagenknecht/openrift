import { oc } from "@orpc/contract";
import { z } from "zod";

import { publicCollectionDetailResponseSchema } from "../response-schemas.js";
import { copiesQuerySchema } from "../schemas.js";

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
