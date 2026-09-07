import type { OverlayPayload } from "@openrift/shared/contracts/overlay";
import {
  DEFAULT_OVERLAY_PAYLOAD,
  normalizeOverlayPayload,
} from "@openrift/shared/contracts/overlay";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, OverlayChannelsTable } from "../db/index.js";
import { withUniqueShareToken } from "../lib/share-token.js";

export interface OverlayChannel extends Omit<Selectable<OverlayChannelsTable>, "payload"> {
  payload: OverlayPayload;
}

// Normalizes the payload: it grows display switches without a migration, so
// older rows are missing whichever ones came later.
function toChannel(row: Selectable<OverlayChannelsTable>): OverlayChannel {
  return {
    ...row,
    payload: normalizeOverlayPayload(row.payload),
  };
}

/**
 * Every write bumps `version` in the same statement that changes `payload`,
 * since the OBS source's conditional poll compares against it.
 */
export function overlayChannelsRepo(db: Kysely<Database>) {
  async function writePayload(
    userId: string,
    payload: OverlayPayload,
  ): Promise<OverlayChannel | undefined> {
    const row = await db
      .updateTable("overlayChannels")
      .set({ payload, version: sql<number>`version + 1` })
      .where("userId", "=", userId)
      .returningAll()
      .executeTakeFirst();
    return row ? toChannel(row) : undefined;
  }

  return {
    async findByUserId(userId: string): Promise<OverlayChannel | undefined> {
      const row = await db
        .selectFrom("overlayChannels")
        .selectAll()
        .where("userId", "=", userId)
        .executeTakeFirst();
      return row ? toChannel(row) : undefined;
    },

    // Token-authorised: deliberately returns no owner information.
    async findByToken(token: string): Promise<OverlayChannel | undefined> {
      const row = await db
        .selectFrom("overlayChannels")
        .selectAll()
        .where("token", "=", token)
        .executeTakeFirst();
      return row ? toChannel(row) : undefined;
    },

    create(userId: string): Promise<OverlayChannel> {
      // Scoped to the token constraint: unscoped, two concurrent first-opens
      // colliding on the user_id unique burned all retries and 500ed.
      return withUniqueShareToken(
        async (token) => {
          const row = await db
            .insertInto("overlayChannels")
            .values({
              userId,
              token,
              payload: DEFAULT_OVERLAY_PAYLOAD,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          return toChannel(row);
        },
        { constraint: "overlay_channels_token_key" },
      );
    },

    // Callers merge onto the current payload first, so a push that only names
    // a card keeps the dressing.
    setPayload: writePayload,

    // Leaves the payload alone: rotating a leaked token mid-stream should not
    // also blank the scene.
    rotateToken(userId: string): Promise<OverlayChannel | undefined> {
      return withUniqueShareToken(async (token) => {
        const row = await db
          .updateTable("overlayChannels")
          .set({ token, version: sql<number>`version + 1` })
          .where("userId", "=", userId)
          .returningAll()
          .executeTakeFirst();
        return row ? toChannel(row) : undefined;
      });
    },
  };
}
