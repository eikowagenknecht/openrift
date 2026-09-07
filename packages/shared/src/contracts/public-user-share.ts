import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  listIntentResponseSchema,
  listKindResponseSchema,
  publicListDetailResponseSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const publicUserBundleListResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    intent: listIntentResponseSchema,
    kind: listKindResponseSchema,
    entryCount: z.number().int().nonnegative(),
    isPublic: z.boolean(),
    viaGroups: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
      }),
    ),
    createdAt: z.string(),
    updatedAt: z.string(),
    hasRule: z.boolean(),
  })
  .openapi("PublicUserBundleListResponse");

export const publicUserBundleCollectionResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    viaGroups: z.array(
      z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
      }),
    ),
  })
  .openapi("PublicUserBundleCollectionResponse");

export const publicUserBundleResponseSchema = z
  .object({
    owner: z.object({
      displayName: z.string(),
      gravatarHash: z.string(),
    }),
    lists: z.array(publicUserBundleListResponseSchema),
    collections: z.array(publicUserBundleCollectionResponseSchema),
  })
  .openapi("PublicUserBundleResponse");

/**
 * The bundle token resolves the owner; per-list visibility additionally needs
 * a per-list share token or a friend-group share with the viewer's groups.
 */
export const publicUserShareContract = {
  bundle: oc
    .route({ method: "GET", path: "/api/v1/users/share/{token}", tags: ["User Share"] })
    .meta({ auth: "public", cache: "short", cacheVary: "viewer" })
    .input(z.object({ token: z.string().min(1) }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicUserBundleResponseSchema),

  bundleList: oc
    .route({
      method: "GET",
      path: "/api/v1/users/share/{token}/lists/{listId}",
      tags: ["User Share"],
    })
    .meta({ auth: "public", cache: "short", cacheVary: "viewer" })
    .input(z.object({ token: z.string().min(1), listId: z.uuid() }))
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(publicListDetailResponseSchema),
};

export type PublicUserShareContract = typeof publicUserShareContract;
