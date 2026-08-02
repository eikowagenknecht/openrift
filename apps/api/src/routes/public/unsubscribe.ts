import { unsubscribeContract } from "@openrift/shared/contracts/unsubscribe";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { applyUnsubscribe, previewUnsubscribe } from "../../services/unsubscribe.js";

const os = implement(unsubscribeContract).$context<ApiContext>().use(requireUser);

/**
 * Public unsubscribe procedures (ADR-030). Both are token-authed, not
 * session-authed: the HMAC token is the only credential. `preview` is a safe,
 * read-only GET the web confirmation page renders from; `confirm` is the POST
 * that flips the channel off. The RFC 8058 mail-client one-click is a separate
 * plain route (see `unsubscribe-one-click.ts`).
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
