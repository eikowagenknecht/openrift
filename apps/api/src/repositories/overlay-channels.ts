import type { OverlayPayload } from "@openrift/shared";
import {
  DEFAULT_OVERLAY_PAYLOAD,
  normalizeOverlayPayload,
} from "@openrift/shared/contracts/overlay";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import { parseJsonbRequired } from "../db/helpers.js";
import type { Database, OverlayChannelsTable } from "../db/index.js";
import { withUniqueShareToken } from "../lib/share-token.js";

/** A channel row with its jsonb payload already parsed. */
export interface OverlayChannel extends Omit<Selectable<OverlayChannelsTable>, "payload"> {
  payload: OverlayPayload;
}

/**
 * postgres.js under Bun hands jsonb back as a string, so every read goes
 * through `parseJsonbRequired` — the column is NOT NULL, so there is no null
 * branch to fall back from. The parsed blob then goes through
 * `normalizeOverlayPayload`, because the payload grows display switches without
 * a migration and older rows are missing whichever ones came later.
 * `version` is an int8, which postgres.js also returns as a string (it only
 * registers number parsers for the 4-byte-and-smaller numeric OIDs), so it is
 * coerced here despite the row type saying `number`.
 * @returns The row with a parsed payload and a numeric version.
 */
function toChannel(row: Selectable<OverlayChannelsTable>): OverlayChannel {
  return {
    ...row,
    payload: normalizeOverlayPayload(parseJsonbRequired<OverlayPayload>(row.payload)),
    version: Number(row.version),
  };
}

/**
 * Queries for the signed-in creator's stream overlay channel.
 *
 * Every write bumps `version` in the same statement that changes `payload`, so
 * the two can never disagree — the version is what the OBS source's conditional
 * poll compares against, and a payload that changed without a bump would sit
 * invisible behind a 304 until the next push.
 *
 * @returns An object with overlay-channel query methods bound to the given `db`.
 */
export function overlayChannelsRepo(db: Kysely<Database>) {
  /**
   * Applies a payload change and bumps the version, atomically.
   * @returns The updated channel, or undefined when the user has none.
   */
  async function writePayload(
    userId: string,
    payload: OverlayPayload,
  ): Promise<OverlayChannel | undefined> {
    const row = await db
      .updateTable("overlayChannels")
      .set({ payload: JSON.stringify(payload), version: sql<number>`version + 1` })
      .where("userId", "=", userId)
      .returningAll()
      .executeTakeFirst();
    return row ? toChannel(row) : undefined;
  }

  return {
    /**
     * @returns The user's channel, or undefined when they have never opened
     * the dashboard.
     */
    async findByUserId(userId: string): Promise<OverlayChannel | undefined> {
      const row = await db
        .selectFrom("overlayChannels")
        .selectAll()
        .where("userId", "=", userId)
        .executeTakeFirst();
      return row ? toChannel(row) : undefined;
    },

    /**
     * Reads the state an OBS browser source polls for. Token-authorised, so it
     * deliberately returns no owner information.
     * @returns The channel, or undefined for an unknown or rotated token.
     */
    async findByToken(token: string): Promise<OverlayChannel | undefined> {
      const row = await db
        .selectFrom("overlayChannels")
        .selectAll()
        .where("token", "=", token)
        .executeTakeFirst();
      return row ? toChannel(row) : undefined;
    },

    /**
     * Creates the user's channel with a fresh token and an empty payload.
     * Retries on the astronomically unlikely token collision, the same way
     * every other share token here does.
     * @returns The newly created channel.
     */
    create(userId: string): Promise<OverlayChannel> {
      return withUniqueShareToken(async (token) => {
        const row = await db
          .insertInto("overlayChannels")
          .values({
            userId,
            token,
            payload: JSON.stringify(DEFAULT_OVERLAY_PAYLOAD),
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return toChannel(row);
      });
    },

    /**
     * Replaces the channel's payload wholesale. Callers merge onto the current
     * payload first, so a push that only names a card keeps the dressing.
     * @returns The updated channel, or undefined when the user has none.
     */
    setPayload: writePayload,

    /**
     * Issues a new token, which immediately blinds every browser source still
     * polling the old one. Leaves the payload alone: rotating a leaked token
     * mid-stream should not also blank the scene.
     * @returns The updated channel, or undefined when the user has none.
     */
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
