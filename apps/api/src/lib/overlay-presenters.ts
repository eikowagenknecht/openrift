import type {
  OverlayChannelResponse,
  OverlayPayload,
  OverlaySettings,
  OverlayStateResponse,
  StagePresetConfig,
} from "@openrift/shared";

import type { OverlayChannel } from "../repositories/overlay-channels.js";

/**
 * The channel as its owner's dashboard sees it. The row's id and user id stay
 * server-side — the dashboard addresses its channel as "mine", and the token is
 * the only handle that ever leaves.
 * @returns The channel response.
 */
export function toOverlayChannel(channel: OverlayChannel): OverlayChannelResponse {
  return {
    token: channel.token,
    version: channel.version,
    payload: channel.payload,
    updatedAt: channel.updatedAt.toISOString(),
  };
}

/**
 * The channel as the OBS browser source sees it: the version it conditions its
 * poll on, and what to paint. Deliberately carries no token, no timestamps and
 * nothing about the owner.
 * @returns The public overlay state.
 */
export function toOverlayState(channel: OverlayChannel): OverlayStateResponse {
  return { version: channel.version, payload: channel.payload };
}

/**
 * Merges a settings patch onto the current payload.
 *
 * Every field is optional and absent means "leave it alone", so the dashboard
 * can send one switch without restating the rest. `qrUrl` is nullish in the
 * contract because null is a meaningful value there (hide the QR) — only
 * `undefined` means untouched. `plateFields` merges key by key for the same
 * reason: a patch naming one line must not clear the other four.
 *
 * @returns The payload with the patch applied.
 */
export function applyOverlaySettings(
  payload: OverlayPayload,
  patch: OverlaySettings,
): OverlayPayload {
  return {
    ...payload,
    ...(patch.showPlate !== undefined && { showPlate: patch.showPlate }),
    ...(patch.platePosition !== undefined && { platePosition: patch.platePosition }),
    ...(patch.plateFields !== undefined && {
      plateFields: { ...payload.plateFields, ...patch.plateFields },
    }),
    ...(patch.qrUrl !== undefined && { qrUrl: patch.qrUrl ?? null }),
    ...(patch.corner !== undefined && { corner: patch.corner }),
    ...(patch.scale !== undefined && { scale: patch.scale }),
  };
}

/**
 * Dresses a payload with a saved stage preset, for a browser source that pins
 * one in its URL.
 *
 * A preset sets only the switches it means to, so this is the settings merge
 * exactly: a field the preset does not carry keeps the channel's own value, and
 * `plateFields` merges one key deep so a preset that turns the rules text on
 * does not clear the other four lines. The card on screen is never touched —
 * the preset dresses the stage, the dashboard decides what stands on it.
 *
 * The preset's presentation-mode fields (`cardScale`, `showText`, `ground`,
 * `tierTileStep`) have no counterpart in the overlay payload and are dropped
 * here; presentation mode reads them from the preset itself.
 *
 * @returns The payload with the preset's set fields applied.
 */
export function applyStagePresetDressing(
  payload: OverlayPayload,
  config: StagePresetConfig,
): OverlayPayload {
  return applyOverlaySettings(payload, config);
}
