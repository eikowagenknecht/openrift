import type {
  OverlayChannelResponse,
  OverlayPayload,
  OverlaySettings,
  OverlayStateResponse,
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
