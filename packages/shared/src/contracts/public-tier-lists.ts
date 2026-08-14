import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { tierRowResponseSchema } from "./tier-lists.js";

extendZodWithOpenApi(z);

/**
 * The board as a viewer sees it: no owner-only fields (share token, is_public),
 * because reaching this response already proves the token was known.
 */
export const publicTierListResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    setId: z.string().nullable(),
    tiers: z.array(tierRowResponseSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PublicTierListResponse");

export const publicTierListDetailResponseSchema = z
  .object({
    tierList: publicTierListResponseSchema,
    owner: z.object({ displayName: z.string(), gravatarHash: z.string().nullable() }),
  })
  .openapi("PublicTierListDetailResponse");

/**
 * oRPC contract for the public (share-token) tier list view.
 * `GET /api/v1/tier-lists/share/{token}` — anonymous, or a typed NOT_FOUND for
 * an unknown or no-longer-public token.
 *
 * Cards are returned as bare ids: the viewer's client already holds the whole
 * catalogue (the same source every card-browser surface reads), so denormalizing
 * names and art here would ship a second copy of data the page has anyway.
 */
export const publicTierListsContract = {
  share: oc
    .route({ method: "GET", path: "/api/v1/tier-lists/share/{token}", tags: ["Tier lists"] })
    .meta({ auth: "public", cache: "short" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicTierListDetailResponseSchema),
};

export type PublicTierListsContract = typeof publicTierListsContract;
