import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { copyListResponseSchema, copyResponseSchema } from "@openrift/shared/response-schemas";
import { copiesQuerySchema } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const addCopiesSchema = z.object({
  copies: z
    .array(
      z.object({
        printingId: z.uuid(),
        collectionId: z.uuid().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const moveCopiesSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
  toCollectionId: z.uuid(),
});

export const disposeCopiesSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
});

export const copyListMembershipsSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
  // When set, that list is excluded from the result. Used by the "Sold" action
  // on a list page: the copy is necessarily on the current list, so the
  // cross-list warning should only name the *other* lists it also sits on.
  excludeListId: z.uuid().optional(),
});

/**
 * Response body for `POST /copies`: the copies just created, each carrying the
 * full {@link copyResponseSchema} shape including `groupId` (derived from the
 * owning collection). Additive — older clients read a subset and ignore the
 * extra fields.
 */
export const copyAddResponseSchema = z
  .object({ items: z.array(copyResponseSchema) })
  .openapi("CopyAddResponse");

/**
 * Response body for `POST /copies/list-memberships`: which of the viewer's own
 * lists reference the queried copies, with a per-list copy count, plus the
 * distinct number of queried copies that are on at least one list. Lets the
 * dispose confirmation warn that removing copies also strips them from these
 * lists (copies are hard-deleted and `list_entries` cascade away).
 */
export const copyListMembershipsResponseSchema = z
  .object({
    lists: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        copyCount: z.number().int().nonnegative(),
      }),
    ),
    copiesOnAnyList: z.number().int().nonnegative(),
  })
  .openapi("CopyListMembershipsResponse");

/**
 * oRPC contract for the authenticated copies endpoints. All require a session
 * (the mount applies `requireAuth`). `add` returns 201; `move` and `dispose`
 * return 204 with no body; `add` can return a typed BAD_REQUEST when a copy
 * references a non-existent printing.
 */
export const copiesContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/copies", tags: ["Copies"] })
    .input(copiesQuerySchema)
    .output(copyListResponseSchema),
  add: oc
    .route({ method: "POST", path: "/api/v1/copies", tags: ["Copies"], successStatus: 201 })
    .input(addCopiesSchema)
    .errors({ BAD_REQUEST: { message: "One or more printings do not exist" } })
    .output(copyAddResponseSchema),
  move: oc
    .route({ method: "POST", path: "/api/v1/copies/move", tags: ["Copies"], successStatus: 204 })
    .input(moveCopiesSchema),
  dispose: oc
    .route({ method: "POST", path: "/api/v1/copies/dispose", tags: ["Copies"], successStatus: 204 })
    .input(disposeCopiesSchema),
  listMemberships: oc
    .route({ method: "POST", path: "/api/v1/copies/list-memberships", tags: ["Copies"] })
    .input(copyListMembershipsSchema)
    .output(copyListMembershipsResponseSchema),
};

export type CopiesContract = typeof copiesContract;
