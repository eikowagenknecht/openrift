import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  copyLinkSchema,
  copyListResponseSchema,
  copyResponseSchema,
} from "@openrift/shared/response-schemas";
import { copiesQuerySchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

/**
 * Metadata fields settable on a copy (ADR-038), shared between `add` items
 * (so CSV import persists condition at insert time) and the `update` patch.
 * Field pairing mirrors the `copies` check constraints so violations fail at
 * the contract instead of as a database error.
 */
const copyMetadataInputShape = {
  condition: z.string().max(50).nullish(),
  grader: z.string().max(50).nullish(),
  grade: z.number().min(1).max(10).multipleOf(0.5).nullish(),
  notesPublic: z.string().max(2000).nullish(),
  notesPrivate: z.string().max(2000).nullish(),
  isAltered: z.boolean().optional(),
  links: z.array(copyLinkSchema).max(10).optional(),
};

const unset = (value: unknown): boolean => value === null || value === undefined;

const metadataConsistent = (value: {
  condition?: string | null;
  grader?: string | null;
  grade?: number | null;
}) => unset(value.grader) === unset(value.grade) && (unset(value.condition) || unset(value.grader));

const METADATA_CONSISTENCY_MESSAGE =
  "grader and grade must be set together, and a graded copy cannot also carry a condition";

export const addCopiesSchema = z.object({
  copies: z
    .array(
      z
        .object({
          // Client-generated copy id (ADR-027 step 2): the synced client mints the
          // row's uuid so the optimistic row and the replicated row are the same
          // row. Required — letting the server assign a fallback id would silently
          // diverge the optimistic overlay from the row that comes back on the
          // Electric stream.
          id: z.uuid(),
          printingId: z.uuid(),
          collectionId: z.uuid().optional(),
          ...copyMetadataInputShape,
        })
        .refine(metadataConsistent, METADATA_CONSISTENCY_MESSAGE),
    )
    .min(1)
    .max(500),
});

/**
 * Partial metadata patch. Absent keys stay untouched; explicit nulls clear.
 * The service normalizes cross-field state (setting a condition clears
 * grading and vice versa), so a patch only has to be internally consistent.
 */
export const copyMetadataPatchSchema = z
  .object(copyMetadataInputShape)
  .refine(metadataConsistent, METADATA_CONSISTENCY_MESSAGE);

export const updateCopiesSchema = z.object({
  copyIds: z.array(z.uuid()).min(1).max(500),
  patch: copyMetadataPatchSchema,
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
 * owning collection), plus the Postgres transaction id of the insert so the
 * client can await the change on the Electric stream (ADR-027 step 2). Additive
 * — older clients read a subset and ignore the extra fields.
 */
export const copyAddResponseSchema = z
  .object({ items: z.array(copyResponseSchema), txid: z.number().int() })
  .openapi("CopyAddResponse");

/**
 * Response body for copy mutations that previously returned 204 (`move`,
 * `dispose`): the Postgres transaction id of the change, so the client can
 * await it on the Electric stream (ADR-027 step 2).
 */
export const copyMutationResponseSchema = z
  .object({ txid: z.number().int() })
  .openapi("CopyMutationResponse");

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
 * (the mount applies `requireAuth`), so they share the `authedRoute` base
 * (UNAUTHORIZED + FORBIDDEN). `add` returns 201; `move` and `dispose` return the
 * Postgres txid of the write (ADR-027) so the client's optimistic overlay holds
 * until the change arrives back on the Electric stream. `update` (the ADR-038
 * metadata patch) returns the txid as well: the metadata columns ride the
 * copies shape, so the patch goes through the same durable outbox path as
 * every other copy write. Domain codes per route: `add` → BAD_REQUEST (a copy
 * references a non-existent printing) + CONFLICT (a client-supplied copy id
 * already exists); `move` → NOT_FOUND (target collection or copies missing);
 * `update` → NOT_FOUND + BAD_REQUEST (unknown condition or grader slug);
 * `dispose` → NOT_FOUND + CONFLICT.
 */
export const copiesContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/copies", tags: ["Copies"] })
    .input(copiesQuerySchema)
    .output(copyListResponseSchema),
  add: authedRoute
    .route({ method: "POST", path: "/api/v1/copies", tags: ["Copies"], successStatus: 201 })
    .input(addCopiesSchema)
    .errors({
      BAD_REQUEST: { message: "One or more printings do not exist" },
      CONFLICT: { message: "One or more copies already exist" },
    })
    .output(copyAddResponseSchema),
  move: authedRoute
    .route({ method: "POST", path: "/api/v1/copies/move", tags: ["Copies"] })
    .errors({ NOT_FOUND: { message: "Target collection or copies not found" } })
    .input(moveCopiesSchema)
    .output(copyMutationResponseSchema),
  update: authedRoute
    .route({ method: "POST", path: "/api/v1/copies/update", tags: ["Copies"] })
    .errors({
      NOT_FOUND: { message: "One or more copies not found" },
      BAD_REQUEST: { message: "Unknown condition or grader" },
    })
    .input(updateCopiesSchema)
    .output(copyMutationResponseSchema),
  dispose: authedRoute
    .route({ method: "POST", path: "/api/v1/copies/dispose", tags: ["Copies"] })
    .errors({
      NOT_FOUND: { message: "One or more copies not found" },
      CONFLICT: { message: "One or more copies could not be disposed" },
    })
    .input(disposeCopiesSchema)
    .output(copyMutationResponseSchema),
  listMemberships: authedRoute
    .route({ method: "POST", path: "/api/v1/copies/list-memberships", tags: ["Copies"] })
    .input(copyListMembershipsSchema)
    .output(copyListMembershipsResponseSchema),
};

export type CopiesContract = typeof copiesContract;
