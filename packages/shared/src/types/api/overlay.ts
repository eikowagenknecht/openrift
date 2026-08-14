/**
 * Stream-overlay types. Declared on the contract (the zod schemas own the
 * shape) and re-exported here so the API's table types and the web app can
 * reach them from the package root, the same way the deck config types do.
 */
export type {
  OverlayChannelResponse,
  OverlayCorner,
  OverlayPayload,
  OverlayPlateFields,
  OverlayPlatePosition,
  OverlayPush,
  OverlaySettings,
  OverlayStateResponse,
} from "@openrift/shared/contracts/overlay";
