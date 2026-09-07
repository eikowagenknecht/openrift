import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { oc } from "@orpc/contract";
import { z } from "zod";

import { overlayStateResponseSchema } from "./overlay.js";

extendZodWithOpenApi(z);

/**
 * Authorized by the channel token in the path only; OBS has no session.
 * An unknown token returns the default state, not a 404; a rotated token goes blank.
 */
export const publicOverlayContract = {
  state: oc
    .route({ method: "GET", path: "/api/v1/overlay/{token}/state", tags: ["Overlay"] })
    .meta({ auth: "public", cache: "revalidate", etag: true })
    .input(
      z.object({
        token: z.string().min(1).max(64),
        presetId: z.string().max(64).optional(),
      }),
    )
    .output(overlayStateResponseSchema),
};

export type PublicOverlayContract = typeof publicOverlayContract;
