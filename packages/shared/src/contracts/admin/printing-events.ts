import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { jobStartedResponseSchema } from "./shared.js";

const TAG = "Admin - Operations";

const PE = "/api/admin/v1/printing-events";

export const printingEventStatusSchema = z.enum(["pending", "sent", "failed"]);

const printingEventViewSchema = z.object({
  id: z.uuid(),
  status: printingEventStatusSchema,
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
  createdAt: isoDateTime,
});

export const adminPrintingEventsContract = {
  flush: authedRoute
    .route({ method: "POST", path: `${PE}/flush`, tags: [TAG], successStatus: 202 })
    .output(jobStartedResponseSchema),
  list: authedRoute
    .route({ method: "GET", path: PE, tags: [TAG] })
    .output(z.object({ events: z.array(printingEventViewSchema) })),
  retry: authedRoute
    .route({ method: "POST", path: `${PE}/retry`, tags: [TAG] })
    .input(z.object({ ids: z.array(z.uuid()).min(1) }))
    .output(z.object({ retried: z.number() })),
};

export type AdminPrintingEventsContract = typeof adminPrintingEventsContract;
export interface PrintingEventsListResponse {
  events: z.infer<typeof printingEventViewSchema>[];
}
export type PrintingEventView = z.infer<typeof printingEventViewSchema>;
