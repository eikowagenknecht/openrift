import { ERROR_CODES } from "@openrift/shared";
import { adminJobSchedulesContract } from "@openrift/shared/contracts/admin/job-schedules";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { JobScheduler } from "../../services/job-scheduler.js";

const os = implement(adminJobSchedulesContract).$context<ApiContext>().use(requireAuthedUser);

function scheduler(context: ApiContext): JobScheduler {
  if (context.scheduler === null) {
    throw new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, "The job scheduler is not running");
  }
  return context.scheduler;
}

export const adminJobSchedulesRouter = {
  list: os.list.handler(async ({ context }) => ({ jobs: await scheduler(context).list() })),

  set: os.set.handler(({ input, context }) => scheduler(context).set(input.kind, input.schedule)),

  disable: os.disable.handler(({ input, context }) => scheduler(context).disable(input.kind)),

  enableSuggested: os.enableSuggested.handler(async ({ context }) => ({
    jobs: await scheduler(context).enableSuggested(),
  })),

  runNow: os.runNow.handler(({ input, context }) => scheduler(context).runNow(input.kind)),
};
