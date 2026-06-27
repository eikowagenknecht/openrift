import { withParams } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Admin - Provider Settings";

const PS = "/api/admin/v1/provider-settings";

const providerSettingSchema = z.object({
  provider: z.string(),
  sortOrder: z.number(),
  isHidden: z.boolean(),
  isFavorite: z.boolean(),
});

const providerParamSchema = z.object({ provider: z.string().min(1) });

/**
 * oRPC contract for the admin provider-settings (mounted at
 * `/api/admin/v1/provider-settings`, admin-gated by the mount). Provider
 * settings are keyed by `provider`; update upserts. Bad-request states are
 * thrown as `AppError` and bridged to ORPCErrors in the implementation. The
 * static `reorder` path precedes `{provider}`.
 */
export const adminProviderSettingsContract = {
  list: oc
    .route({ method: "GET", path: PS, tags: [TAG] })
    .output(z.object({ providerSettings: z.array(providerSettingSchema) })),
  reorder: oc
    .route({ method: "PUT", path: `${PS}/reorder`, tags: [TAG], successStatus: 204 })
    .input(z.object({ providers: z.array(z.string().min(1)).min(1) })),
  update: oc
    .route({ method: "PATCH", path: `${PS}/{provider}`, tags: [TAG], successStatus: 204 })
    .input(
      withParams(providerParamSchema, {
        sortOrder: z.number().int().optional(),
        isHidden: z.boolean().optional(),
        isFavorite: z.boolean().optional(),
      }),
    ),
};

export type AdminProviderSettingsContract = typeof adminProviderSettingsContract;
export interface ProviderSettingsResponse {
  providerSettings: z.infer<typeof providerSettingSchema>[];
}
