import type { OverlayStateResponse } from "@openrift/shared";
import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { publicOverlayContract } from "@openrift/shared/contracts/public-overlay";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { applyStagePresetDressing, toOverlayState } from "../../lib/overlay-presenters.js";
import { narrowStagePresetConfig } from "../../lib/stage-preset-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { OverlayChannel } from "../../repositories/overlay-channels.js";

const os = implement(publicOverlayContract).$context<ApiContext>().use(requireUser);

/**
 * Dresses the channel's state with the preset the URL names, when there is one
 * and it belongs to the channel's owner.
 *
 * Ignored in silence otherwise, which is why the lookup is owner-scoped rather
 * than a plain fetch: a source pinned to a preset the creator has since
 * deleted, or to an id copied out of someone else's URL, keeps painting the
 * plain channel state. Blanking the scene or answering with an error would put
 * the failure on someone's stream.
 */
async function dressedState(
  repos: Repos,
  channel: OverlayChannel,
  presetId: string | undefined,
): Promise<OverlayStateResponse> {
  if (presetId === undefined) {
    return toOverlayState(channel);
  }
  const preset = await repos.stagePresets.findByIdForUser(presetId, channel.userId);
  if (!preset) {
    return toOverlayState(channel);
  }
  const payload = applyStagePresetDressing(channel.payload, narrowStagePresetConfig(preset.config));
  return toOverlayState({ ...channel, payload });
}

/**
 * What the OBS browser source polls, authorised by the channel token alone.
 *
 * An unknown token answers with the empty state at version 0 rather than a
 * 404: a source pointed at a rotated token should quietly go blank, and a
 * 404 would put a red error line into whatever scene it sits in. It also keeps
 * the endpoint from confirming which tokens exist.
 *
 * A `presetId` in the URL dresses that state with one of the owner's saved
 * presets, so a source can pin a scene without the dashboard pushing the
 * dressing first. `version` is deliberately left alone — it belongs to the
 * channel, and the conditional poll runs off the body digest `etag()` computes,
 * which already covers an edit to the preset.
 */
export const publicOverlayRouter = {
  state: os.state.handler(async ({ input, context }): Promise<OverlayStateResponse> => {
    const channel = await context.repos.overlayChannels.findByToken(input.token);
    if (!channel) {
      return { version: 0, payload: DEFAULT_OVERLAY_PAYLOAD };
    }
    return dressedState(context.repos, channel, input.presetId);
  }),
};
