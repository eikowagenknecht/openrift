import { adminDashboardContract } from "@openrift/shared/contracts/admin/dashboard";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";

const os = implement(adminDashboardContract).$context<ApiContext>().use(requireAuthedUser);

export const adminDashboardRouter = {
  get: os.get.handler(async ({ context }) => {
    const { status, users } = context.repos;

    const [app, signups] = await Promise.all([status.getAppStats(), users.getSignupSeries()]);

    return { app, signups };
  }),
};
