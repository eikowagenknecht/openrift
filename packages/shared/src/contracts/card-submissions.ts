import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { contributionCardSchema, contributionPrintingSchema } from "../contribute-schema.js";
import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * A user submission carries the same card/printing fields as an openrift-data
 * contribution, minus `external_id` — the server generates a per-submission
 * external_id (`<slug>--<dateStamp>--<userId>`, ADR-036) so it never trusts the
 * client for the natural key.
 */
export const cardSubmissionCardSchema = contributionCardSchema.omit({ external_id: true });
export const cardSubmissionPrintingSchema = contributionPrintingSchema.omit({ external_id: true });

export const cardSubmissionSchema = z
  .object({
    slug: z.string().regex(SLUG_PATTERN, {
      message: "Slug must be lowercase letters, digits, and hyphens.",
    }),
    card: cardSubmissionCardSchema,
    printings: z.array(cardSubmissionPrintingSchema).min(1).max(50),
    submissionNote: z.string().trim().min(1).max(2000).nullable().optional().default(null),
  })
  .strict();

export const cardSubmissionResponseSchema = z
  .object({ ok: z.literal(true) })
  .openapi("CardSubmissionResponse");

/**
 * oRPC contract for the in-app card-submission endpoint (ADR-036). Session-gated
 * (base carries UNAUTHORIZED). `TOO_MANY_REQUESTS` is the per-user daily cap;
 * `BAD_REQUEST` surfaces DB-constraint validation failures the client schema
 * didn't already catch.
 */
export const cardSubmissionsContract = {
  submit: authedRoute
    .route({ method: "POST", path: "/api/v1/card-submissions", tags: ["Card Submissions"] })
    .errors({
      TOO_MANY_REQUESTS: { message: "Daily submission limit reached" },
      BAD_REQUEST: { message: "Submission failed validation" },
    })
    .input(cardSubmissionSchema)
    .output(cardSubmissionResponseSchema),
};

export type CardSubmissionsContract = typeof cardSubmissionsContract;
export type CardSubmissionInput = z.infer<typeof cardSubmissionSchema>;
