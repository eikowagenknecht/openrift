import { isoDateTime } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { diffValueSchema } from "../../response-schemas.js";
import { jobStartedResponseSchema } from "./shared.js";

const TAG = "Admin - Operations";

const PE = "/api/admin/v1/printing-events";

const fieldChangeSchema = z.object({
  field: z.string(),
  // Heterogeneous field values (scalars / scalar arrays); serializable, typed.
  from: diffValueSchema,
  to: diffValueSchema,
});

const printingEventViewSchema = z.object({
  id: z.uuid(),
  eventType: z.enum(["new", "changed"]),
  status: z.enum(["pending", "sent", "failed"]),
  retryCount: z.number(),
  printingId: z.string(),
  cardName: z.string().nullable(),
  cardSlug: z.string().nullable(),
  setName: z.string().nullable(),
  shortCode: z.string().nullable(),
  rarity: z.string().nullable(),
  finish: z.string().nullable(),
  finishLabel: z.string().nullable(),
  artist: z.string().nullable(),
  language: z.string().nullable(),
  languageName: z.string().nullable(),
  frontImageId: z.string().nullable(),
  changes: z.array(fieldChangeSchema).nullable(),
  createdAt: isoDateTime,
});

/**
 * oRPC contract for the admin printing-events Discord queue (mounted under
 * `/api/admin/v1/printing-events`, admin-gated by the mount): start a flush job
 * (202 + run handle), list the pending/failed queue, and reset failed events to
 * pending for the next flush. The static `flush` / `retry` paths sit alongside
 * the bare list in one handler.
 */
export const adminPrintingEventsContract = {
  flush: oc
    .route({ method: "POST", path: `${PE}/flush`, tags: [TAG], successStatus: 202 })
    .output(jobStartedResponseSchema),
  list: oc
    .route({ method: "GET", path: PE, tags: [TAG] })
    .output(z.object({ events: z.array(printingEventViewSchema) })),
  retry: oc
    .route({ method: "POST", path: `${PE}/retry`, tags: [TAG] })
    .input(z.object({ ids: z.array(z.uuid()).min(1) }))
    .output(z.object({ retried: z.number() })),
};

export type AdminPrintingEventsContract = typeof adminPrintingEventsContract;
export interface PrintingEventsListResponse {
  events: z.infer<typeof printingEventViewSchema>[];
}
export type PrintingEventView = z.infer<typeof printingEventViewSchema>;
