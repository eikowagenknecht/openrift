import { unsubscribeContract } from "@openrift/shared/contracts/unsubscribe";
import { implement } from "@orpc/server";

import { requireUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { applyUnsubscribe, previewUnsubscribe } from "../services/unsubscribe.js";

const os = implement(unsubscribeContract).$context<ApiContext>().use(requireUser);

/**
 * Both procedures are token-authed, not session-authed: the HMAC token
 * is the only credential.
 */
export const unsubscribeRouter = {
  preview: os.preview.handler(({ input, context }) =>
    previewUnsubscribe(context.repos, context.config.auth.secret, input.token),
  ),
  confirm: os.confirm.handler(async ({ input, context, errors }) => {
    const result = await applyUnsubscribe(context.repos, context.config.auth.secret, input.token);
    if (result === null) {
      throw errors.BAD_REQUEST();
    }
    return result;
  }),
};
