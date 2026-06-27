import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  listIntentResponseSchema,
  listKindResponseSchema,
  publicListDetailResponseSchema,
} from "@openrift/shared/response-schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

const publicUserBundleListResponseSchema = z
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
  })
  .openapi("PublicUserBundleListResponse");

const publicUserBundleCollectionResponseSchema = z
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
 * oRPC contract for the public user-share bundle reads (ADR-018). The bundle
 * token resolves to the owner; per-list visibility additionally requires either
 * a per-list share token or a friend-group share with the viewer's groups. The
 * mount applies `loadSession` so an authenticated viewer sees their
 * group-shared lists; anonymous viewers see public-only.
 *
 * An unknown token / list is a typed NOT_FOUND. The bundle-list `listId` is a
 * UUID — a malformed id is a clean 400 (BAD_REQUEST) from input validation.
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
