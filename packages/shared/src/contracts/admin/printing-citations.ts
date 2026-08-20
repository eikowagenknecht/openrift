import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Printing Citations";

const BASE = "/api/admin/v1/printings/{printingId}/citations";

const printingIdParamSchema = z.object({ printingId: z.uuid() });

export const adminPrintingCitationSchema = z.object({
  id: z.string(),
  label: z.string(),
  sourceUrl: z.string().nullable(),
});

/** Body fields for a new citation, kept separate from the path param. */
const createPrintingCitationFields = z.object({
  // 120 rather than the meta event's 60: a promo citation names the video and
  // the channel that posted it, not just a provider.
  label: z.string().trim().min(1).max(120),
  // A citation with no permalink is still worth having (a stream nobody
  // archived, a note read out on a podcast), so the link is optional. Protocol
  // is pinned because the value is rendered as an `href`.
  sourceUrl: z
    .url({ protocol: /^https?$/u })
    .max(2000)
    .nullable(),
});

/**
 * oRPC contract for the source citations on a promo printing (migration 258),
 * mounted under the admin-gated `/api/admin/v1` prefix, so no handler re-checks
 * the role. Full admin only: citing a printing is curation, not the accept-only
 * work a `card-review` grant covers.
 *
 * Named "citations", not "sources": a *printing source* already means a
 * provider's candidate row throughout the admin (`PrintingSourceActions`,
 * `printingSourceFields`), and reusing the word here would read as that. The
 * public card page still calls them Sources, as the meta event page does.
 *
 * Every citation is hand-entered — nothing ingests them — so unlike
 * `meta_event_sources` there is no provider-owned row to refuse a delete on.
 *
 * Domain codes: `list`, `create` → NOT_FOUND (unknown printing); `update`,
 * `remove` → NOT_FOUND (unknown citation); `create` and `update` → CONFLICT
 * (the same link cited twice on one printing).
 */
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

  // A real PATCH rather than delete-then-create, which is what a caller
  // without one has to do: that loses the row's id and lands the replacement at
  // the bottom of the list, and the two calls are not atomic, so a create that
  // fails after the delete simply loses the citation. Repointing a dead link at
  // an archived copy is the case that matters, and it must not move the row.
  update: authedRoute
    .route({ method: "PATCH", path: `${BASE}/{citationId}`, tags: [TAG], successStatus: 204 })
    // Both fields optional, and `sourceUrl` nullable on top of that, so the
    // three intents stay distinct: omit to leave a field alone, a string to
    // repoint it, `null` to drop the link while keeping the citation.
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

  // Nested under the printing rather than a flat `/citations/{id}`, so a
  // citation can only be deleted through the printing that owns it.
  remove: authedRoute
    .route({ method: "DELETE", path: `${BASE}/{citationId}`, tags: [TAG], successStatus: 204 })
    .input(printingIdParamSchema.extend({ citationId: z.uuid() }))
    .errors({ NOT_FOUND: { message: "Citation not found" } }),
};

export type AdminPrintingCitationsContract = typeof adminPrintingCitationsContract;
