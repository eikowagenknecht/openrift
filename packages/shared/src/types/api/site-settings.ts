import type { siteSettingsResponseSchema } from "@openrift/shared/contracts/site-settings";
import type { z } from "zod";

export type SiteSettingsResponse = z.infer<typeof siteSettingsResponseSchema>;
