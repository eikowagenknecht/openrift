import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Cache";

const CACHE = "/api/admin/v1/cache";

/** `purge`'s 503/502 faults are deliberately left undefined, not declared as domain codes. */
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
