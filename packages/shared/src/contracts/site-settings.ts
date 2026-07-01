import { oc } from "@orpc/contract";
import { z } from "zod";

// The site-settings route used an inline schema (no shared schema existed); keep
// it co-located with the contract. Matches SiteSettingsResponse.
export const siteSettingsResponseSchema = z.object({
  settings: z.record(z.string(), z.string()),
});

/**
 * oRPC contract for the public site-settings endpoint.
 * `GET /api/v1/site-settings` — web-scoped settings as a `{ settings: { key:
 * value } }` map.
 */
export const siteSettingsContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/site-settings", tags: ["Site Settings"] })
    .meta({ auth: "public", cache: "short" })
    .output(siteSettingsResponseSchema),
};

export type SiteSettingsContract = typeof siteSettingsContract;
