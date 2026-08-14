import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { overlayStateResponseSchema } from "./overlay.js";

extendZodWithOpenApi(z);

/**
 * oRPC contract for the OBS browser source's read. Authorised by the channel
 * token in the path and nothing else — the source runs inside OBS, which has
 * no session and cannot be asked to sign in.
 *
 * Polled about once a second for the length of a stream, so it is deliberately
 * the cheapest read in the API: one indexed row, `etag` for a 304 on every
 * unchanged tick, and `cache: "revalidate"` to keep the edge from ever holding
 * a card that has already been swapped out.
 *
 * An unknown token returns the default (empty) state rather than a 404. A
 * browser source pointed at a rotated token should go blank and stay quiet, not
 * paint an error into someone's scene.
 */
export const publicOverlayContract = {
  state: oc
    .route({ method: "GET", path: "/api/v1/overlay/{token}/state", tags: ["Overlay"] })
    .meta({ auth: "public", cache: "revalidate", etag: true })
    .input(z.object({ token: z.string().min(1).max(64) }))
    .output(overlayStateResponseSchema),
};

export type PublicOverlayContract = typeof publicOverlayContract;
