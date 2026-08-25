import type { OverlayPayload } from "@openrift/shared";
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

// The stored payload goes through `normalizeOverlayPayload`, because it grows
// display switches without a migration and older rows are missing whichever
// ones came later.
function toChannel(row: Selectable<OverlayChannelsTable>): OverlayChannel {
  return {
    ...row,
    payload: normalizeOverlayPayload(row.payload),
  };
}

/**
 * Queries for the signed-in creator's stream overlay channel.
 *
 * Every write bumps `version` in the same statement that changes `payload`, so
 * the two can never disagree — the version is what the OBS source's conditional
 * poll compares against, and a payload that changed without a bump would sit
 * invisible behind a 304 until the next push.
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

    // Reads the state an OBS browser source polls for. Token-authorised, so
    // it deliberately returns no owner information.
    async findByToken(token: string): Promise<OverlayChannel | undefined> {
      const row = await db
        .selectFrom("overlayChannels")
        .selectAll()
        .where("token", "=", token)
        .executeTakeFirst();
      return row ? toChannel(row) : undefined;
    },

    // Retries on the astronomically unlikely token collision, the same way
    // every other share token here does.
    create(userId: string): Promise<OverlayChannel> {
      // Scoped to the token constraint: without it, two concurrent first-opens
      // colliding on the user_id unique burned all retries and 500ed instead
      // of letting the caller recover the winner's row.
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

    // Issues a new token, which immediately blinds every browser source still
    // polling the old one. Leaves the payload alone: rotating a leaked token
    // mid-stream should not also blank the scene.
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
