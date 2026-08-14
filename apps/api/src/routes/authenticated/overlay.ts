import type { OverlayBoard, OverlayChannelResponse } from "@openrift/shared";
import { overlayContract } from "@openrift/shared/contracts/overlay";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { applyOverlaySettings, toOverlayChannel } from "../../lib/overlay-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { OverlayChannel } from "../../repositories/overlay-channels.js";

const os = implement(overlayContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Returns the user's channel, creating it on first ask. Auto-create keeps the
 * dashboard from needing a "set up your overlay" step with nothing in it beyond
 * a button.
 * @returns The user's channel.
 */
async function ensureChannel(repos: Repos, userId: string): Promise<OverlayChannel> {
  const existing = await repos.overlayChannels.findByUserId(userId);
  return existing ?? (await repos.overlayChannels.create(userId));
}

/**
 * Holds a reveal step inside the board it belongs to.
 *
 * Past the last card the count would say "revealed more than there is", which
 * the source reads as a finished reveal anyway — but storing it would make a
 * later Prev press start counting down from a position the board never had.
 *
 * @returns The count, inside the board's bounds.
 */
function clampReveal(board: OverlayBoard, revealCount: number): number {
  const total = board.tiers.reduce((sum, row) => sum + row.cards.length, 0);
  return Math.min(Math.max(revealCount, 0), total);
}

/**
 * The signed-in creator's stream overlay control surface.
 *
 * Every write merges onto the current payload rather than replacing it, so a
 * push that only names a card leaves the corner, scale, plate and QR exactly
 * where the creator set them. `ensureChannel` runs first on every write, so the
 * repo's "no such row" branch is unreachable and its `undefined` falls back to
 * the channel we already hold.
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
      // A card takes the scene over from a board rather than landing on top of
      // it — the corner holds one thing at a time.
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
      // Nothing to step. A phone that kept a stale reveal control on screen
      // after the board came down should not raise an error on the stream.
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

  clear: os.clear.handler(async ({ context }): Promise<OverlayChannelResponse> => {
    const channel = await ensureChannel(context.repos, context.userId);
    // Only what is on screen leaves. The dressing is scene setup the creator
    // tuned once against their layout, and clearing between cards must not
    // undo it.
    const updated = await context.repos.overlayChannels.setPayload(context.userId, {
      ...channel.payload,
      printingId: null,
      board: null,
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
