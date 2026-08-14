import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { authedRoute } from "./_base.js";

extendZodWithOpenApi(z);

/** Where in the OBS scene the card sits. */
export const overlayCornerSchema = z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]);

/**
 * What the OBS source is currently showing, plus how it is dressed.
 *
 * One opaque blob rather than columns: the browser source renders whatever the
 * dashboard put here, and the display switches grow over time without needing
 * a migration each. `printingId` null means "nothing on screen" — the source
 * animates its card out rather than clearing instantly.
 */
export const overlayPayloadSchema = z.object({
  /** The printing on screen, or null for a cleared overlay. */
  printingId: z.string().nullable(),
  /** Name / set / stats plate beside the card. */
  showPlate: z.boolean(),
  /** QR to a deck share page, rendered under the plate. Null hides it. */
  deckShareUrl: z.string().url().max(2000).nullable(),
  corner: overlayCornerSchema,
  /** Card height as a percentage of the source's height. */
  scale: z.number().int().min(20).max(100),
});

export const overlayStateResponseSchema = z
  .object({
    /**
     * Bumped on every push. The public read returns it as the ETag, so an
     * unchanged poll costs a 304 with no body.
     */
    version: z.number().int().nonnegative(),
    payload: overlayPayloadSchema,
  })
  .openapi("OverlayStateResponse");

export const overlayChannelResponseSchema = z
  .object({
    token: z.string(),
    version: z.number().int().nonnegative(),
    payload: overlayPayloadSchema,
    updatedAt: z.string(),
  })
  .openapi("OverlayChannelResponse");

/** Every display switch is optional: a push that only changes the card keeps the dressing. */
export const overlayPushSchema = z.object({
  printingId: z.string().min(1).max(64),
  showPlate: z.boolean().optional(),
  deckShareUrl: z.string().url().max(2000).nullish(),
  corner: overlayCornerSchema.optional(),
  scale: z.number().int().min(20).max(100).optional(),
});

/** Dressing-only update, e.g. moving the card to another corner mid-stream. */
export const overlaySettingsSchema = z.object({
  showPlate: z.boolean().optional(),
  deckShareUrl: z.string().url().max(2000).nullish(),
  corner: overlayCornerSchema.optional(),
  scale: z.number().int().min(20).max(100).optional(),
});

export type OverlayCorner = z.infer<typeof overlayCornerSchema>;
export type OverlayPayload = z.infer<typeof overlayPayloadSchema>;
export type OverlayStateResponse = z.infer<typeof overlayStateResponseSchema>;
export type OverlayChannelResponse = z.infer<typeof overlayChannelResponseSchema>;
export type OverlayPush = z.infer<typeof overlayPushSchema>;
export type OverlaySettings = z.infer<typeof overlaySettingsSchema>;

/** What a channel starts as, and what a cleared overlay falls back to. */
export const DEFAULT_OVERLAY_PAYLOAD: OverlayPayload = {
  printingId: null,
  showPlate: true,
  deckShareUrl: null,
  corner: "bottom-right",
  scale: 70,
};

const TAG = "Overlay";

/**
 * oRPC contract for the signed-in creator's stream overlay. The channel is
 * created on first read, so the dashboard never has to ask for one.
 */
export const overlayContract = {
  get: authedRoute
    .route({ method: "GET", path: "/api/v1/overlay/me", tags: [TAG] })
    .output(overlayChannelResponseSchema),
  push: authedRoute
    .route({ method: "POST", path: "/api/v1/overlay/me/push", tags: [TAG] })
    .input(overlayPushSchema)
    .output(overlayChannelResponseSchema),
  clear: authedRoute
    .route({ method: "POST", path: "/api/v1/overlay/me/clear", tags: [TAG] })
    .output(overlayChannelResponseSchema),
  updateSettings: authedRoute
    .route({ method: "PATCH", path: "/api/v1/overlay/me", tags: [TAG] })
    .input(overlaySettingsSchema)
    .output(overlayChannelResponseSchema),
  rotateToken: authedRoute
    .route({ method: "POST", path: "/api/v1/overlay/me/rotate", tags: [TAG] })
    .output(overlayChannelResponseSchema),
};

export type OverlayContract = typeof overlayContract;
