import { adminFormatsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminFormatsContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the admin formats list. Logic unchanged from the
 * previous `@hono/zod-openapi` handler; any thrown `AppError` is mapped by the
 * handler's appErrorInterceptor.
 */
export const adminFormatsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { cardBans } = context.repos;
    const formats = await cardBans.listFormats();
    return { formats };
  }),
};
