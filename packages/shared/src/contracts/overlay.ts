import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { authedRoute } from "./_base.js";
import { tierRowSchema } from "./tier-lists.js";

extendZodWithOpenApi(z);

export const overlayCornerSchema = z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]);

/** `auto` puts the plate on the inward side of whichever corner the card is in. */
export const overlayPlatePositionSchema = z.enum(["auto", "left", "right", "above", "below"]);

export const overlayPlateFieldsSchema = z.object({
  name: z.boolean(),
  code: z.boolean(),
  stats: z.boolean(),
  rulesText: z.boolean(),
  flavorText: z.boolean(),
});

export const MAX_OVERLAY_BOARD_CARDS = 400;

/** A copy of the ranking, not a reference: edits to the stored list after the push don't reach the live overlay. */
export const overlayBoardSchema = z
  .object({
    title: z.string().max(120),
    tiers: z.array(tierRowSchema),
    revealCount: z.number().int().min(0),
    direction: z.enum(["best-first", "worst-first"]),
  })
  .refine(
    (board) =>
      board.tiers.reduce((sum, row) => sum + row.cards.length, 0) <= MAX_OVERLAY_BOARD_CARDS,
    `A board on stream can hold at most ${MAX_OVERLAY_BOARD_CARDS} cards`,
  );

export const overlayPayloadSchema = z.object({
  printingId: z.string().nullable(),
  board: overlayBoardSchema.nullable(),
  hidden: z.boolean(),
  showPlate: z.boolean(),
  platePosition: overlayPlatePositionSchema,
  plateFields: overlayPlateFieldsSchema,
  qrUrl: z.url().max(2000).nullable(),
  corner: overlayCornerSchema,
  scale: z.number().int().min(20).max(100),
});

export const overlayStateResponseSchema = z
  .object({
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

/** Absent means "leave it alone", so one switch can be sent without restating the rest. */
const overlayDressingShape = {
  showPlate: z.boolean().optional(),
  platePosition: overlayPlatePositionSchema.optional(),
  plateFields: overlayPlateFieldsSchema.partial().optional(),
  qrUrl: z.url().max(2000).nullish(),
  corner: overlayCornerSchema.optional(),
  scale: z.number().int().min(20).max(100).optional(),
};

export const overlayPushSchema = z.object({
  printingId: z.string().min(1).max(64),
  ...overlayDressingShape,
});

export const overlaySettingsSchema = z.object(overlayDressingShape);

/** Carries no dressing: pushed once, then stepped through, so switches stay where the card push left them. */
export const overlayPushBoardSchema = z.object({ board: overlayBoardSchema });

/** Only the count: resending the whole board on every arrow press would put hundreds of entries on the wire per beat. */
export const overlaySetBoardRevealSchema = z.object({
  revealCount: z.number().int().min(0),
});

/** An explicit boolean, not a toggle, so the phone clicker and the `H` key can't land on opposite states from a stale view. */
export const overlaySetHiddenSchema = z.object({ hidden: z.boolean() });

export type OverlayCorner = z.infer<typeof overlayCornerSchema>;
export type OverlayPlatePosition = z.infer<typeof overlayPlatePositionSchema>;
export type OverlayPlateFields = z.infer<typeof overlayPlateFieldsSchema>;
export type OverlayBoard = z.infer<typeof overlayBoardSchema>;
export type OverlayBoardDirection = OverlayBoard["direction"];
export type OverlayPayload = z.infer<typeof overlayPayloadSchema>;
export type OverlayStateResponse = z.infer<typeof overlayStateResponseSchema>;
export type OverlayChannelResponse = z.infer<typeof overlayChannelResponseSchema>;
export type OverlayPush = z.infer<typeof overlayPushSchema>;
export type OverlaySettings = z.infer<typeof overlaySettingsSchema>;
export type OverlayPushBoard = z.infer<typeof overlayPushBoardSchema>;
export type OverlaySetBoardReveal = z.infer<typeof overlaySetBoardRevealSchema>;
export type OverlaySetHidden = z.infer<typeof overlaySetHiddenSchema>;

export const DEFAULT_OVERLAY_PAYLOAD: OverlayPayload = {
  printingId: null,
  board: null,
  hidden: false,
  showPlate: true,
  platePosition: "auto",
  plateFields: { name: true, code: true, stats: true, rulesText: false, flavorText: false },
  qrUrl: null,
  corner: "bottom-right",
  scale: 70,
};

/** Carries the legacy `deckShareUrl` key over to `qrUrl` so a link set before the field was renamed still survives. */
export function normalizeOverlayPayload(stored: unknown): OverlayPayload {
  const { deckShareUrl, ...raw } = (stored ?? {}) as Partial<OverlayPayload> & {
    deckShareUrl?: string | null;
  };
  return {
    ...DEFAULT_OVERLAY_PAYLOAD,
    ...raw,
    plateFields: { ...DEFAULT_OVERLAY_PAYLOAD.plateFields, ...raw.plateFields },
    qrUrl: raw.qrUrl ?? deckShareUrl ?? null,
    board: raw.board ?? null,
  };
}

const TAG = "Overlay";

/** The channel is created on first read, so the dashboard never has to ask for one. */
export const overlayContract = {
  get: authedRoute
    .route({ method: "GET", path: "/api/v1/overlay/me", tags: [TAG] })
    .output(overlayChannelResponseSchema),
  push: authedRoute
    .route({ method: "POST", path: "/api/v1/overlay/me/push", tags: [TAG] })
    .input(overlayPushSchema)
    .output(overlayChannelResponseSchema),
  pushBoard: authedRoute
    .route({ method: "POST", path: "/api/v1/overlay/me/board", tags: [TAG] })
    .input(overlayPushBoardSchema)
    .output(overlayChannelResponseSchema),
  setBoardReveal: authedRoute
    .route({ method: "POST", path: "/api/v1/overlay/me/board/reveal", tags: [TAG] })
    .input(overlaySetBoardRevealSchema)
    .output(overlayChannelResponseSchema),
  setHidden: authedRoute
    .route({ method: "POST", path: "/api/v1/overlay/me/hidden", tags: [TAG] })
    .input(overlaySetHiddenSchema)
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
