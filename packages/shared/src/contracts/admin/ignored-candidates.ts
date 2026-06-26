import { isoDateTime } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Ignored Candidates";

const IC = "/api/admin/v1/ignored-candidates";

const ignoredCardSchema = z.object({
  id: z.string(),
  provider: z.string(),
  externalId: z.string(),
  createdAt: isoDateTime,
});

const ignoredPrintingSchema = z.object({
  id: z.string(),
  provider: z.string(),
  externalId: z.string(),
  finish: z.string().nullable(),
  createdAt: isoDateTime,
});

const cardInput = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
});

const ignorePrintingInput = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
  finish: z.string().min(1).nullable().optional(),
});

const unignorePrintingInput = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
  finish: z.string().min(1).nullable(),
});

/**
 * oRPC contract for the admin ignored-candidates controls (mounted under
 * `/api/admin/v1/ignored-candidates`, admin-gated by the mount). Cards and
 * printings each have an ignore (POST) and unignore (DELETE); the DELETEs carry
 * a body (compact mode reads it).
 */
export const adminIgnoredCandidatesContract = {
  list: oc.route({ method: "GET", path: IC, tags: [TAG] }).output(
    z.object({
      cards: z.array(ignoredCardSchema),
      printings: z.array(ignoredPrintingSchema),
    }),
  ),
  ignoreCard: oc
    .route({ method: "POST", path: `${IC}/cards`, tags: [TAG], successStatus: 204 })
    .input(cardInput),
  unignoreCard: oc
    .route({ method: "DELETE", path: `${IC}/cards`, tags: [TAG], successStatus: 204 })
    .input(cardInput),
  ignorePrinting: oc
    .route({ method: "POST", path: `${IC}/printings`, tags: [TAG], successStatus: 204 })
    .input(ignorePrintingInput),
  unignorePrinting: oc
    .route({ method: "DELETE", path: `${IC}/printings`, tags: [TAG], successStatus: 204 })
    .input(unignorePrintingInput),
};

export type AdminIgnoredCandidatesContract = typeof adminIgnoredCandidatesContract;
export interface IgnoredCandidatesResponse {
  cards: z.infer<typeof ignoredCardSchema>[];
  printings: z.infer<typeof ignoredPrintingSchema>[];
}
