import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { authedRoute } from "./_base.js";
import { tierRowSchema } from "./tier-lists.js";

extendZodWithOpenApi(z);

/** Where in the OBS scene the card sits. */
export const overlayCornerSchema = z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]);

/**
 * Which side of the card the plate sits on. `auto` puts it on the inward side
 * of whichever corner the card is in, so it follows the card around the scene
 * instead of running off the edge.
 */
export const overlayPlatePositionSchema = z.enum(["auto", "left", "right", "above", "below"]);

/**
 * Which lines the plate carries. Every one is independently switchable because
 * a stream that already shows the card art often wants only the part the art
 * cannot show — the rules text on a busy full-art, say.
 */
export const overlayPlateFieldsSchema = z.object({
  /** The card's name, as the big first line. */
  name: z.boolean(),
  /** Set code, collector number and the foil marker. */
  code: z.boolean(),
  /** Energy / power / might chips. */
  stats: z.boolean(),
  /** Printed rules text and effect text, errata-corrected where one applies. */
  rulesText: z.boolean(),
  /** The italic flavor line. */
  flavorText: z.boolean(),
});

/**
 * Cards a board pushed to the overlay may carry.
 *
 * Lower than what a stored tier list may hold: this board is a jsonb blob that
 * every browser source re-reads on its poll, and a thousand tiles would be
 * unreadable at stream size long before the payload became a problem.
 */
export const MAX_OVERLAY_BOARD_CARDS = 400;

/**
 * A ranking on screen, with the reveal it is partway through.
 *
 * A copy of the list rather than a reference to it: the board goes out as part
 * of the payload the source already polls, so the overlay keeps painting the
 * ranking as it was pushed even if the creator edits the underlying list
 * mid-stream. `revealCount` is how many cards the run has placed, counted along
 * the walk `direction` names, so the same board reveals top-down or bottom-up
 * without the stored rows changing order.
 */
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
  /**
   * The ranking on screen, or null when no board is up. Mutually exclusive with
   * `printingId`: the scene shows one card or one board, so pushing either
   * clears the other rather than stacking them in the same corner.
   */
  board: overlayBoardSchema.nullable(),
  /** The plate beside the card. Off leaves the bare card (and the QR, which stands alone). */
  showPlate: z.boolean(),
  platePosition: overlayPlatePositionSchema,
  plateFields: overlayPlateFieldsSchema,
  /**
   * Any link worth putting on screen as a QR — a deck share page, a channel, a
   * giveaway. Null hides the code. Independent of the plate: a bare card with a
   * QR beside it is a valid scene.
   */
  qrUrl: z.string().url().max(2000).nullable(),
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

/**
 * Every display switch is optional and absent means "leave it alone", so one
 * plate switch can be sent without restating the rest. `plateFields` is partial
 * for the same reason, one key deep.
 */
const overlayDressingShape = {
  showPlate: z.boolean().optional(),
  platePosition: overlayPlatePositionSchema.optional(),
  plateFields: overlayPlateFieldsSchema.partial().optional(),
  qrUrl: z.string().url().max(2000).nullish(),
  corner: overlayCornerSchema.optional(),
  scale: z.number().int().min(20).max(100).optional(),
};

/** A card push, optionally re-dressing the scene in the same call. */
export const overlayPushSchema = z.object({
  printingId: z.string().min(1).max(64),
  ...overlayDressingShape,
});

/** Dressing-only update, e.g. moving the card to another corner mid-stream. */
export const overlaySettingsSchema = z.object(overlayDressingShape);

/**
 * A board push. Deliberately carries no dressing: the board is pushed once and
 * then stepped through, so the switches stay where the card pushes left them.
 */
export const overlayPushBoardSchema = z.object({ board: overlayBoardSchema });

/**
 * One step of the reveal. Only the count — resending the whole board on every
 * arrow press would put a few hundred entries on the wire per beat of the run.
 */
export const overlaySetBoardRevealSchema = z.object({
  revealCount: z.number().int().min(0),
});

export type OverlayCorner = z.infer<typeof overlayCornerSchema>;
export type OverlayPlatePosition = z.infer<typeof overlayPlatePositionSchema>;
export type OverlayPlateFields = z.infer<typeof overlayPlateFieldsSchema>;
export type OverlayBoard = z.infer<typeof overlayBoardSchema>;
/** Which end of the ladder a reveal walks from. */
export type OverlayBoardDirection = OverlayBoard["direction"];
export type OverlayPayload = z.infer<typeof overlayPayloadSchema>;
export type OverlayStateResponse = z.infer<typeof overlayStateResponseSchema>;
export type OverlayChannelResponse = z.infer<typeof overlayChannelResponseSchema>;
export type OverlayPush = z.infer<typeof overlayPushSchema>;
export type OverlaySettings = z.infer<typeof overlaySettingsSchema>;
export type OverlayPushBoard = z.infer<typeof overlayPushBoardSchema>;
export type OverlaySetBoardReveal = z.infer<typeof overlaySetBoardRevealSchema>;

/** What a channel starts as, and what a cleared overlay falls back to. */
export const DEFAULT_OVERLAY_PAYLOAD: OverlayPayload = {
  printingId: null,
  board: null,
  showPlate: true,
  platePosition: "auto",
  plateFields: { name: true, code: true, stats: true, rulesText: false, flavorText: false },
  qrUrl: null,
  corner: "bottom-right",
  scale: 70,
};

/**
 * Fills a stored payload out to the current shape.
 *
 * The payload is a jsonb blob that grows a switch at a time with no migration,
 * so any row written before today's switches existed is missing them — and the
 * source would read `undefined` where it expects a boolean. Every read goes
 * through here, which is also where the old `deckShareUrl` key is carried over
 * to `qrUrl` so a link set before the field was generalised survives.
 *
 * `board` is filled the same way, and explicitly rather than by the spread: a
 * row stored with the key present but undefined would otherwise spread that
 * `undefined` straight over the default.
 *
 * @returns The payload with every field present.
 */
export function normalizeOverlayPayload(stored: unknown): OverlayPayload {
  // The legacy key is pulled out rather than spread, so it does not ride along
  // into the payload that gets written back.
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
  pushBoard: authedRoute
    .route({ method: "POST", path: "/api/v1/overlay/me/board", tags: [TAG] })
    .input(overlayPushBoardSchema)
    .output(overlayChannelResponseSchema),
  setBoardReveal: authedRoute
    .route({ method: "POST", path: "/api/v1/overlay/me/board/reveal", tags: [TAG] })
    .input(overlaySetBoardRevealSchema)
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
