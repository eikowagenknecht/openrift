import { isoDateTime } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

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
 * Admin ignored-candidates controls, mounted under
 * `/api/admin/v1/ignored-candidates`. The unignore DELETEs carry a body
 * (compact mode reads it; only query params are dropped).
 */
export const adminIgnoredCandidatesContract = {
  list: authedRoute.route({ method: "GET", path: IC, tags: [TAG] }).output(
    z.object({
      cards: z.array(ignoredCardSchema),
      printings: z.array(ignoredPrintingSchema),
    }),
  ),
  ignoreCard: authedRoute
    .route({ method: "POST", path: `${IC}/cards`, tags: [TAG], successStatus: 204 })
    .input(cardInput),
  unignoreCard: authedRoute
    .route({ method: "DELETE", path: `${IC}/cards`, tags: [TAG], successStatus: 204 })
    .input(cardInput),
  ignorePrinting: authedRoute
    .route({ method: "POST", path: `${IC}/printings`, tags: [TAG], successStatus: 204 })
    .input(ignorePrintingInput),
  unignorePrinting: authedRoute
    .route({ method: "DELETE", path: `${IC}/printings`, tags: [TAG], successStatus: 204 })
    .input(unignorePrintingInput),
};

export type AdminIgnoredCandidatesContract = typeof adminIgnoredCandidatesContract;
export interface IgnoredCandidatesResponse {
  cards: z.infer<typeof ignoredCardSchema>[];
  printings: z.infer<typeof ignoredPrintingSchema>[];
}
