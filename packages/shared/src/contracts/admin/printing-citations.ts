import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Printing Citations";

const BASE = "/api/admin/v1/printings/{printingId}/citations";

const printingIdParamSchema = z.object({ printingId: z.uuid() });

/** `canEdit` is false for a link someone else added, unless the caller is an admin. */
export const adminPrintingCitationSchema = z.object({
  id: z.string(),
  label: z.string(),
  sourceUrl: z.string().nullable(),
  canEdit: z.boolean(),
});

const createPrintingCitationFields = z.object({
  label: z.string().trim().min(1).max(120),
  // Protocol restricted because the value is rendered as an `href`.
  sourceUrl: z
    .url({ protocol: /^https?$/u })
    .max(2000)
    .nullable(),
});

// Citations are hand-entered; there is no provider-owned row to protect from deletion.
export const adminPrintingCitationsContract = {
  list: authedRoute
    .route({ method: "GET", path: BASE, tags: [TAG] })
    .input(printingIdParamSchema)
    .errors({ NOT_FOUND: { message: "Printing not found" } })
    .output(z.object({ citations: z.array(adminPrintingCitationSchema) })),

  create: authedRoute
    .route({ method: "POST", path: BASE, tags: [TAG], successStatus: 201 })
    .input(printingIdParamSchema.extend(createPrintingCitationFields.shape).strict())
    .errors({
      NOT_FOUND: { message: "Printing not found" },
      CONFLICT: { message: "That link is already cited on this printing" },
    })
    .output(adminPrintingCitationSchema),

  update: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{citationId}`, tags: [TAG], successStatus: 204 })
    // Omit a field to leave it unchanged; `null` on sourceUrl drops the link
    // without deleting the citation.
    .input(
      printingIdParamSchema
        .extend({ citationId: z.uuid() })
        .extend(createPrintingCitationFields.partial().shape)
        .strict(),
    )
    .errors({
      NOT_FOUND: { message: "Citation not found" },
      CONFLICT: { message: "That link is already cited on this printing" },
    }),

  // Nested under the printing so removal is scoped to the printing that owns it.
  remove: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{citationId}`, tags: [TAG], successStatus: 204 })
    .input(printingIdParamSchema.extend({ citationId: z.uuid() }))
    .errors({ NOT_FOUND: { message: "Citation not found" } }),
};

export type AdminPrintingCitationsContract = typeof adminPrintingCitationsContract;
