import { oc } from "@orpc/contract";
import { z } from "zod";

export const siteSettingsResponseSchema = z.object({
  settings: z.record(z.string(), z.string()),
});

export const siteSettingsContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/site-settings", tags: ["Site Settings"] })
    .meta({ auth: "public", cache: "short" })
    .output(siteSettingsResponseSchema),
};

export type SiteSettingsContract = typeof siteSettingsContract;
