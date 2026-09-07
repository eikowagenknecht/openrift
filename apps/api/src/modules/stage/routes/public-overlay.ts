import type { OverlayStateResponse } from "@openrift/shared/contracts/overlay";
import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { publicOverlayContract } from "@openrift/shared/contracts/public-overlay";
import { implement } from "@orpc/server";

import type { Repos } from "../../../deps.js";
import { requireUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { applyStagePresetDressing, toOverlayState } from "../lib/overlay-presenters.js";
import { narrowStagePresetConfig } from "../lib/stage-preset-presenters.js";
import type { OverlayChannel } from "../repositories/overlay-channels.js";

const os = implement(publicOverlayContract).$context<ApiContext>().use(requireUser);

/** Preset lookup is owner-scoped: a deleted or foreign preset id keeps the plain channel state. */
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
 * Unknown token returns the empty state at version 0, not 404.
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
