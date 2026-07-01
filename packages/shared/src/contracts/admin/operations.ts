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

/**
 * oRPC contract for the admin operations (mounted under `/api/admin/v1`,
 * admin-gated by the mount): clear a marketplace's price data, fire-and-forget
 * price refreshes (202 + run handle, polled via job-runs), and a
 * materialized-view refresh. All procedures are session-gated (UNAUTHORIZED +
 * FORBIDDEN from `authedRoute`); no domain error codes are declared.
 */
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
  refreshMatviews: authedRoute.route({
    method: "POST",
    path: `${BASE}/refresh-materialized-views`,
    tags: [TAG],
    successStatus: 204,
  }),
};

export type AdminOperationsContract = typeof adminOperationsContract;
