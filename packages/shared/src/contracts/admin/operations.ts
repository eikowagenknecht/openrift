import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Operations";

const BASE = "/api/admin/v1";

const marketplaceEnum = z.enum(["tcgplayer", "cardmarket", "cardtrader"]);

const jobRunStartedResponseSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["running", "already_running"]),
});

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
    .output(jobRunStartedResponseSchema),
  refreshCardmarket: oc
    .route({
      method: "POST",
      path: `${BASE}/refresh-cardmarket-prices`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobRunStartedResponseSchema),
  refreshCardtrader: oc
    .route({
      method: "POST",
      path: `${BASE}/refresh-cardtrader-prices`,
      tags: [TAG],
      successStatus: 202,
    })
    .output(jobRunStartedResponseSchema),
  refreshMatviews: oc.route({
    method: "POST",
    path: `${BASE}/refresh-materialized-views`,
    tags: [TAG],
    successStatus: 204,
  }),
};

export type AdminOperationsContract = typeof adminOperationsContract;
