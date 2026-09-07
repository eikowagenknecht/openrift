import type { OverlayBoard, OverlayChannelResponse } from "@openrift/shared/contracts/overlay";
import { overlayContract } from "@openrift/shared/contracts/overlay";
import { implement } from "@orpc/server";

import type { Repos } from "../../../deps.js";
import { isUniqueViolationOn } from "../../../lib/pg-errors.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { applyOverlaySettings, toOverlayChannel } from "../lib/overlay-presenters.js";
import type { OverlayChannel } from "../repositories/overlay-channels.js";

const os = implement(overlayContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Returns the user's channel, creating it on first ask.
 */
async function ensureChannel(repos: Repos, userId: string): Promise<OverlayChannel> {
  const existing = await repos.overlayChannels.findByUserId(userId);
  if (existing) {
    return existing;
  }
  try {
    return await repos.overlayChannels.create(userId);
  } catch (error) {
    // Two first-opens can race on the user_id unique; the winner's row is returned.
    if (isUniqueViolationOn(error, "overlay_channels_user_id_key")) {
      const winner = await repos.overlayChannels.findByUserId(userId);
      if (winner) {
        return winner;
      }
    }
    throw error;
  }
}

/**
 * Clamps revealCount to [0, total]. An unclamped overshoot would make a later
 * Prev press start counting down from a position the board never had.
 */
function clampReveal(board: OverlayBoard, revealCount: number): number {
  const total = board.tiers.reduce((sum, row) => sum + row.cards.length, 0);
  return Math.min(Math.max(revealCount, 0), total);
}

/**
 * Every write merges onto the current payload; fields the caller doesn't send stay unchanged.
 * `ensureChannel` runs first on every write, so setPayload's `undefined` return here is unreachable
 * and falls back to the channel already held.
 */
export const overlayRouter = {
  get: os.get.handler(async ({ context }): Promise<OverlayChannelResponse> =>
    toOverlayChannel(await ensureChannel(context.repos, context.userId)),
  ),

  push: os.push.handler(async ({ context, input }): Promise<OverlayChannelResponse> => {
    const channel = await ensureChannel(context.repos, context.userId);
    const updated = await context.repos.overlayChannels.setPayload(context.userId, {
      ...applyOverlaySettings(channel.payload, input),
      printingId: input.printingId,
      // Pushing a card clears the board: only one occupies the corner at a time.
      board: null,
    });
    return toOverlayChannel(updated ?? channel);
  }),

  pushBoard: os.pushBoard.handler(async ({ context, input }): Promise<OverlayChannelResponse> => {
    const channel = await ensureChannel(context.repos, context.userId);
    const updated = await context.repos.overlayChannels.setPayload(context.userId, {
      ...channel.payload,
      printingId: null,
      board: { ...input.board, revealCount: clampReveal(input.board, input.board.revealCount) },
    });
    return toOverlayChannel(updated ?? channel);
  }),

  setBoardReveal: os.setBoardReveal.handler(
    async ({ context, input }): Promise<OverlayChannelResponse> => {
      const channel = await ensureChannel(context.repos, context.userId);
      const board = channel.payload.board;
      // No board to step: a stale reveal control returns the channel unchanged.
      if (!board) {
        return toOverlayChannel(channel);
      }
      const updated = await context.repos.overlayChannels.setPayload(context.userId, {
        ...channel.payload,
        board: { ...board, revealCount: clampReveal(board, input.revealCount) },
      });
      return toOverlayChannel(updated ?? channel);
    },
  ),

  setHidden: os.setHidden.handler(async ({ context, input }): Promise<OverlayChannelResponse> => {
    const channel = await ensureChannel(context.repos, context.userId);
    // Hidden only toggles visibility; the underlying card/board stays set.
    const updated = await context.repos.overlayChannels.setPayload(context.userId, {
      ...channel.payload,
      hidden: input.hidden,
    });
    return toOverlayChannel(updated ?? channel);
  }),

  clear: os.clear.handler(async ({ context }): Promise<OverlayChannelResponse> => {
    const channel = await ensureChannel(context.repos, context.userId);
    // Clears card/board/hidden but leaves dressing (corner, scale, plate, QR)
    // untouched; hidden must reset too or the next segment's first push lands unseen.
    const updated = await context.repos.overlayChannels.setPayload(context.userId, {
      ...channel.payload,
      printingId: null,
      board: null,
      hidden: false,
    });
    return toOverlayChannel(updated ?? channel);
  }),

  updateSettings: os.updateSettings.handler(
    async ({ context, input }): Promise<OverlayChannelResponse> => {
      const channel = await ensureChannel(context.repos, context.userId);
      const updated = await context.repos.overlayChannels.setPayload(
        context.userId,
        applyOverlaySettings(channel.payload, input),
      );
      return toOverlayChannel(updated ?? channel);
    },
  ),

  rotateToken: os.rotateToken.handler(async ({ context }): Promise<OverlayChannelResponse> => {
    const channel = await ensureChannel(context.repos, context.userId);
    const rotated = await context.repos.overlayChannels.rotateToken(context.userId);
    return toOverlayChannel(rotated ?? channel);
  }),
};
