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

// Field pairing mirrors the `copies` table check constraints.
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

export const MAX_COPIES_PER_ADD = 500;

export const addCopiesSchema = z.object({
  batchId: z.uuid().optional(),
  copies: z
    .array(
      z
        .object({
          id: z.uuid().optional(),
          printingId: z.uuid(),
          collectionId: z.uuid().optional(),
          ...copyMetadataInputShape,
        })
        .refine(metadataConsistent, METADATA_CONSISTENCY_MESSAGE),
    )
    .min(1)
    .max(MAX_COPIES_PER_ADD)
    .superRefine((copies, ctx) => {
      const seen = new Set<string>();
      for (const [index, copy] of copies.entries()) {
        if (copy.id === undefined) {
          continue;
        }
        if (seen.has(copy.id)) {
          ctx.addIssue({
            code: "custom",
            message: "Duplicate copy id in one request",
            path: [index, "id"],
          });
        }
        seen.add(copy.id);
      }
    }),
});

// Absent keys stay untouched; explicit nulls clear.
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
  excludeListId: z.uuid().optional(),
});

export const copyAddResponseSchema = z
  .object({ items: z.array(copyResponseSchema) })
  .openapi("CopyAddResponse");

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
      CONFLICT: { message: "One or more copy ids already belong to someone else" },
    })
    .output(copyAddResponseSchema),
  move: authedRoute
    .route({ method: "POST", path: "/api/v1/copies/move", tags: ["Copies"], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Target collection or copies not found" } })
    .input(moveCopiesSchema),
  update: authedRoute
    .route({ method: "POST", path: "/api/v1/copies/update", tags: ["Copies"], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "One or more copies not found" },
      BAD_REQUEST: { message: "Unknown condition or grader" },
    })
    .input(updateCopiesSchema),
  dispose: authedRoute
    .route({ method: "POST", path: "/api/v1/copies/dispose", tags: ["Copies"], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "One or more copies not found" },
      CONFLICT: { message: "One or more copies could not be disposed" },
    })
    .input(disposeCopiesSchema),
  listMemberships: authedRoute
    .route({ method: "POST", path: "/api/v1/copies/list-memberships", tags: ["Copies"] })
    .input(copyListMembershipsSchema)
    .output(copyListMembershipsResponseSchema),
};

export type CopiesContract = typeof copiesContract;
