import { oc } from "@orpc/contract";
import { z } from "zod";

import { marketplaceEnum } from "../../schemas.js";
import { jobStartedResponseSchema } from "./shared.js";

const TAG = "Admin - Operations";

const BASE = "/api/admin/v1";

const clearPricesResponseSchema = z.object({
  marketplace: z.string(),
  deleted: z.object({
    prices: z.number(),
    variants: z.number(),
    products: z.number(),
  }),
});

/**
 * oRPC contract for the admin operations (mounted under `/api/admin/v1`,
 * admin-gated by the mount): clear a marketplace's price data, fire-and-forget
 * price refreshes (202 + run handle, polled via job-runs), and a
 * materialized-view refresh.
 */
export const adminOperationsContract = {
  clearPrices: oc
    .route({ method: "POST", path: `${BASE}/clear-prices`, tags: [TAG] })
    .input(z.object({ marketplace: marketplaceEnum }))
    .output(clearPricesResponseSchema),
  refreshTcgplayer: oc
    .route({
      method: "POST",
      path: `${BASE}/refresh-tcgplayer-prices`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
  refreshCardmarket: oc
    .route({
      method: "POST",
      path: `${BASE}/refresh-cardmarket-prices`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
  refreshCardtrader: oc
    .route({
      method: "POST",
      path: `${BASE}/refresh-cardtrader-prices`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobStartedResponseSchema),
  refreshMatviews: oc.route({
    method: "POST",
    path: `${BASE}/refresh-materialized-views`,
    tags: [TAG],
    successStatus: 204,
  }),
};

export type AdminOperationsContract = typeof adminOperationsContract;
