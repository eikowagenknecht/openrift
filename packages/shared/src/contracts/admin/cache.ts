import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Cache";

const CACHE = "/api/admin/v1/cache";

/**
 * oRPC contract for the admin Cloudflare cache controls (mounted under
 * `/api/admin/v1/cache`, admin-gated by the mount). `status` reports whether
 * Cloudflare credentials are configured; `purge` triggers a full zone purge and
 * throws 503 (not configured) / 502 (upstream failure) as `AppError`, bridged
 * to ORPCErrors in the implementation.
 */
export const adminCacheContract = {
  status: oc
    .route({ method: "GET", path: `${CACHE}/status`, tags: [TAG] })
    .output(z.object({ configured: z.boolean() })),
  purge: oc.route({ method: "POST", path: `${CACHE}/purge`, tags: [TAG], successStatus: 204 }),
};

export type AdminCacheContract = typeof adminCacheContract;
