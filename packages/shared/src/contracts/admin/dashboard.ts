import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { isoDate } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "../_base.js";
import { adminAppStatsSchema } from "./status.js";

extendZodWithOpenApi(z);

export const adminDashboardResponseSchema = z
  .object({
    app: adminAppStatsSchema,
    signups: z.array(z.object({ date: isoDate, count: z.number() })),
  })
  .openapi("AdminDashboardResponse");

const TAG = "Admin";

export const adminDashboardContract = {
  get: authedRoute
    .route({ method: "GET", path: "/api/admin/v1/dashboard", tags: [TAG] })
    .output(adminDashboardResponseSchema),
};

export type AdminDashboardContract = typeof adminDashboardContract;
export type AdminDashboardResponse = z.infer<typeof adminDashboardResponseSchema>;
export type AdminSignupDay = AdminDashboardResponse["signups"][number];
