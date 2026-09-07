import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Formats";

const FORMATS = "/api/admin/v1/formats";

const formatSchema = z.object({ id: z.string(), name: z.string() });

/**
 * Admin formats list, mounted at `/api/admin/v1/formats`. Read-only: derived
 * from the card-bans repository.
 */
export const adminFormatsContract = {
  list: authedRoute
    .route({ method: "GET", path: FORMATS, tags: [TAG] })
    .output(z.object({ formats: z.array(formatSchema) })),
};

export type AdminFormatsContract = typeof adminFormatsContract;
export interface AdminFormatsResponse {
  formats: z.infer<typeof formatSchema>[];
}
