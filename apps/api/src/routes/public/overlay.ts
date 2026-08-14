import type { OverlayStateResponse } from "@openrift/shared";
import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { publicOverlayContract } from "@openrift/shared/contracts/public-overlay";
import { implement } from "@orpc/server";

import { toOverlayState } from "../../lib/overlay-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(publicOverlayContract).$context<ApiContext>().use(requireUser);

/**
 * What the OBS browser source polls, authorised by the channel token alone.
 *
 * An unknown token answers with the empty state at version 0 rather than a
 * 404: a source pointed at a rotated token should quietly go blank, and a
 * 404 would put a red error line into whatever scene it sits in. It also keeps
 * the endpoint from confirming which tokens exist.
 */
export const publicOverlayRouter = {
  state: os.state.handler(async ({ input, context }): Promise<OverlayStateResponse> => {
    const channel = await context.repos.overlayChannels.findByToken(input.token);
    if (!channel) {
      return { version: 0, payload: DEFAULT_OVERLAY_PAYLOAD };
    }
    return toOverlayState(channel);
  }),
};
