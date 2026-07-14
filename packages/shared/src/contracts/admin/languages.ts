import { isoDateTime, withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Languages";

const LANG = "/api/admin/v1/languages";

export const languageSchema = z.object({
  code: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const codeParamSchema = z.object({ code: z.string().min(1) });

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u)
  .nullable();

/**
 * oRPC contract for the admin languages taxonomy CRUD (mounted at
 * `/api/admin/v1/languages`, admin-gated by the mount). All procedures share
 * the `authedRoute` base (UNAUTHORIZED + FORBIDDEN). Languages are keyed by
 * their `code`. Domain codes per route: `reorder` → BAD_REQUEST (invalid
 * codes); `create` → CONFLICT (code taken); `update` → NOT_FOUND; `remove` →
 * NOT_FOUND + CONFLICT (in use). The static `reorder` path precedes `{code}`.
 */
export const adminLanguagesContract = {
  list: authedRoute
    .route({ method: "GET", path: LANG, tags: [TAG] })
    .output(z.object({ languages: z.array(languageSchema) })),
  reorder: authedRoute
    .route({ method: "PUT", path: `${LANG}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Invalid or incomplete list of language codes" } })
    .input(z.object({ codes: z.array(z.string().min(1)).min(1) })),
  create: authedRoute
    .route({ method: "POST", path: LANG, tags: [TAG], successStatus: 201 })
    .errors({ CONFLICT: { message: "A language with that code already exists" } })
    .input(
      z.object({
        code: z.string().min(1).max(5),
        name: z.string().min(1),
        color: hexColorSchema.optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .output(z.object({ language: languageSchema })),
  update: authedRoute
    .route({ method: "PATCH", path: `${LANG}/{code}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Language not found" } })
    .input(
      withParams(codeParamSchema, {
        name: z.string().min(1).optional(),
        color: hexColorSchema.optional(),
        sortOrder: z.number().int().optional(),
      }),
    ),
  remove: authedRoute
    .route({ method: "DELETE", path: `${LANG}/{code}`, tags: [TAG], successStatus: 204 })
    .errors({
      NOT_FOUND: { message: "Language not found" },
      CONFLICT: { message: "Language is in use by one or more printings" },
    })
    .input(codeParamSchema),
};

export type AdminLanguagesContract = typeof adminLanguagesContract;
export interface AdminLanguagesResponse {
  languages: z.infer<typeof languageSchema>[];
}
