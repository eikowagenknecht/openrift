import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { tierRowResponseSchema } from "./tier-lists.js";

extendZodWithOpenApi(z);

/** No owner-only fields (share token, is_public): reaching this proves the token was known. */
export const publicTierListResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
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

/** Cards are bare ids: the client already holds the full catalogue to resolve them. */
export const publicTierListsContract = {
  share: oc
    .route({ method: "GET", path: "/api/v1/tier-lists/share/{token}", tags: ["Tier lists"] })
    .meta({ auth: "public", cache: "short" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicTierListDetailResponseSchema),
};

export type PublicTierListsContract = typeof publicTierListsContract;
