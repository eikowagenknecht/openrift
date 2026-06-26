import { oc } from "@orpc/contract";
import { z } from "zod";

import { publicListDetailResponseSchema } from "../response-schemas.js";

/**
 * oRPC contract for the public (share-token) list view.
 * `GET /api/v1/lists/share/{token}` — anonymous view of a shared list, or a
 * typed NOT_FOUND for an unknown / non-public token.
 */
export const publicListsContract = {
  share: oc
    .route({ method: "GET", path: "/api/v1/lists/share/{token}", tags: ["Lists"] })
    .meta({ auth: "public" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicListDetailResponseSchema),
};

export type PublicListsContract = typeof publicListsContract;
