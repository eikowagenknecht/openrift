import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";

const TAG = "Admin - Provider Settings";

const PS = "/api/admin/v1/provider-settings";

export const providerSettingSchema = z.object({
  provider: z.string(),
  sortOrder: z.number(),
  isHidden: z.boolean(),
  isFavorite: z.boolean(),
  helperReviewable: z.boolean(),
});

const providerParamSchema = z.object({ provider: z.string().min(1) });

export const adminProviderSettingsContract = {
  list: authedRoute
    .route({ method: "GET", path: PS, tags: [TAG] })
    .output(z.object({ providerSettings: z.array(providerSettingSchema) })),
  reorder: authedRoute
    .route({ method: "PUT", path: `${PS}/reorder`, tags: [TAG], successStatus: 204 })
    .errors({ BAD_REQUEST: { message: "Duplicate providers in reorder list" } })
    .input(z.object({ providers: z.array(z.string().min(1)).min(1) })),
  update: authedRoute
    .route({ method: "PATCH", path: `${PS}/{provider}`, tags: [TAG], successStatus: 204 })
    .input(
      withParams(providerParamSchema, {
        sortOrder: z.number().int().optional(),
        isHidden: z.boolean().optional(),
        isFavorite: z.boolean().optional(),
        helperReviewable: z.boolean().optional(),
      }),
    ),
};

export type AdminProviderSettingsContract = typeof adminProviderSettingsContract;
export interface ProviderSettingsResponse {
  providerSettings: z.infer<typeof providerSettingSchema>[];
}
