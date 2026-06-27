import { adminFormatsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminFormatsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin formats list. Any thrown `AppError` is mapped by the handler's
 * appErrorInterceptor.
 */
export const adminFormatsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { cardBans } = context.repos;
    const formats = await cardBans.listFormats();
    return { formats };
  }),
};
