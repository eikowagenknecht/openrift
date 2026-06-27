import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Cache";

const CACHE = "/api/admin/v1/cache";

/**
 * oRPC contract for the admin Cloudflare cache controls (mounted under
 * `/api/admin/v1/cache`, admin-gated by the mount). `status` reports whether
 * Cloudflare credentials are configured; `purge` triggers a full zone purge.
 * The 503 (not configured) and 502 (upstream failure) faults from `purge` are
 * server-level and stay undefined; no domain codes are declared.
 */
export const adminCacheContract = {
  status: authedRoute
    .route({ method: "GET", path: `${CACHE}/status`, tags: [TAG] })
    .output(z.object({ configured: z.boolean() })),
  purge: authedRoute.route({
    method: "POST",
    path: `${CACHE}/purge`,
    tags: [TAG],
    successStatus: 204,
  }),
};

export type AdminCacheContract = typeof adminCacheContract;
