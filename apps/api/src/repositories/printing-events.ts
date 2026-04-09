import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database, FieldChange } from "../db/index.js";
import { imageUrl } from "./query-helpers.js";

const MAX_RETRIES = 5;

/** A pending event enriched with printing/card/set/image context. */
export interface EnrichedPrintingEvent {
  id: string;
  eventType: "new" | "changed";
  printingId: string;
  changes: FieldChange[] | null;
  createdAt: Date;
  // Joined context
  cardName: string | null;
  cardSlug: string | null;
  setName: string | null;
  shortCode: string | null;
  rarity: string | null;
  finish: string | null;
  artist: string | null;
  language: string | null;
  frontImageUrl: string | null;
}

/**
 * Repository for printing event notifications (Discord webhook queue).
 *
 * @returns An object with event query/mutation methods bound to the given `db`.
 */
export function printingEventsRepo(db: Kysely<Database>) {
  return {
    /**
     * Record a "new printing" event.
     * @returns Resolves when the event has been inserted.
     */
    async recordNew(printingId: string): Promise<void> {
      await db
        .insertInto("printingEvents")
        .values({ eventType: "new", printingId, changes: null, status: "pending", retryCount: 0 })
        .execute();
    },

    /**
     * Record a "changed" event with before/after field diffs.
     * Skips if changes array is empty.
     * @returns Resolves when the event has been inserted.
     */
    async recordChange(printingId: string, changes: FieldChange[]): Promise<void> {
      if (changes.length === 0) {
        return;
      }
      await db
        .insertInto("printingEvents")
        .values({
          eventType: "changed",
          printingId,
          changes: JSON.stringify(changes),
          status: "pending",
          retryCount: 0,
        })
        .execute();
    },

    /**
     * Fetch all pending events with full printing/card/set/image context.
     * @returns Enriched pending events ordered by creation time.
     */
    listPending(): Promise<EnrichedPrintingEvent[]> {
      return db
        .selectFrom("printingEvents as pe")
        .innerJoin("printings as p", "p.id", "pe.printingId")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .innerJoin("sets as s", "s.id", "p.setId")
        .leftJoin("printingImages as pi", (join) =>
          join
            .onRef("pi.printingId", "=", "p.id")
            .on("pi.face", "=", "front")
            .on("pi.isActive", "=", true),
        )
        .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId")
        .select([
          "pe.id",
          "pe.eventType",
          "pe.printingId",
          "pe.changes",
          "pe.createdAt",
          "c.name as cardName",
          "c.slug as cardSlug",
          "s.name as setName",
          "p.shortCode",
          "p.rarity",
          "p.finish",
          "p.artist",
          "p.language",
          sql<string | null>`${imageUrl("imgf")}`.as("frontImageUrl"),
        ])
        .where("pe.status", "=", "pending")
        .orderBy("pe.createdAt", "asc")
        .execute();
    },

    /**
     * Mark events as sent.
     * @returns Resolves when the events have been updated.
     */
    async markSent(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db
        .updateTable("printingEvents")
        .set({ status: "sent" })
        .where("id", "in", ids)
        .execute();
    },

    /**
     * Increment retry count and mark as failed if max retries exceeded.
     * @returns Resolves when the events have been updated.
     */
    async markRetry(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db
        .updateTable("printingEvents")
        .set((eb) => ({
          retryCount: eb("retryCount", "+", 1),
        }))
        .where("id", "in", ids)
        .execute();

      await db
        .updateTable("printingEvents")
        .set({ status: "failed" })
        .where("id", "in", ids)
        .where("retryCount", ">=", MAX_RETRIES)
        .execute();
    },
  };
}
