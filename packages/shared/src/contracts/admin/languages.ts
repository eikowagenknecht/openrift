import { isoDateTime } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Languages";

const LANG = "/api/admin/v1/languages";

const languageSchema = z.object({
  code: z.string(),
  name: z.string(),
  sortOrder: z.number(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

const codeParamSchema = z.object({ code: z.string().min(1) });

/**
 * oRPC contract for the admin languages taxonomy CRUD (mounted at
 * `/api/admin/v1/languages`, admin-gated by the mount). Languages are keyed by
 * their `code`. Conflict / not-found / in-use states are thrown as `AppError`
 * and bridged to ORPCErrors in the implementation. The static `reorder` path
 * precedes `{code}`.
 */
export const adminLanguagesContract = {
  list: oc
    .route({ method: "GET", path: LANG, tags: [TAG] })
    .output(z.object({ languages: z.array(languageSchema) })),
  reorder: oc
    .route({ method: "PUT", path: `${LANG}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ codes: z.array(z.string().min(1)).min(1) })),
  create: oc
    .route({ method: "POST", path: LANG, tags: [TAG], successStatus: 201 })
    .input(
      z.object({
        code: z.string().min(1).max(5),
        name: z.string().min(1),
        sortOrder: z.number().int().optional(),
      }),
    )
    .output(z.object({ language: languageSchema })),
  update: oc
    .route({ method: "PATCH", path: `${LANG}/{code}`, tags: [TAG], successStatus: 204 })
    .input(
      codeParamSchema.extend({
        name: z.string().min(1).optional(),
        sortOrder: z.number().int().optional(),
      }),
    ),
  remove: oc
    .route({ method: "DELETE", path: `${LANG}/{code}`, tags: [TAG], successStatus: 204 })
    .input(codeParamSchema),
};

export type AdminLanguagesContract = typeof adminLanguagesContract;
export interface AdminLanguagesResponse {
  languages: z.infer<typeof languageSchema>[];
}
