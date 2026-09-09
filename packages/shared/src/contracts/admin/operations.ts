import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { marketplaceEnum } from "../../schemas.js";
import { authedRoute } from "../_base.js";
import { jobStartedResponseSchema } from "./shared.js";

extendZodWithOpenApi(z);

const TAG = "Admin - Operations";

const BASE = "/api/admin/v1";

export const clearPricesResponseSchema = z
  .object({
    marketplace: z.string(),
    deleted: z.object({
      prices: z.number(),
      variants: z.number(),
      products: z.number(),
    }),
  })
  .openapi("ClearPricesResponse");

export const siblingVariantDriftResponseSchema = z
  .object({
    missing: z.number(),
  })
  .openapi("SiblingVariantDriftResponse");

// Long-running operations return 202 + a run handle polled via job-runs,
// since a synchronous response would hold the socket past Bun's idle timeout.
export const adminOperationsContract = {
  clearPrices: authedRoute
    .route({ method: "POST", path: `${BASE}/clear-prices`, tags: [TAG] })
    .input(z.object({ marketplace: marketplaceEnum }))
    .output(clearPricesResponseSchema),
  refreshTcgplayer: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/refresh-tcgplayer-prices`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
  refreshCardmarket: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/refresh-cardmarket-prices`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
  refreshCardtrader: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/refresh-cardtrader-prices`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
  refreshMatviews: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/refresh-materialized-views`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
  recomputeCardTokens: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/recompute-card-tokens`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
  siblingVariantDrift: authedRoute
    .route({ method: "GET", path: `${BASE}/sibling-variant-drift`, tags: [TAG] })
    .output(siblingVariantDriftResponseSchema),
  backfillSiblingVariants: authedRoute
    .route({
      method: "POST",
      path: `${BASE}/backfill-sibling-variants`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
};

export type AdminOperationsContract = typeof adminOperationsContract;
