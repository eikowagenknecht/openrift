import type { Kysely, Selectable } from "kysely";

import type { Database, FieldChange, PrintingEventsTable } from "../db/index.js";

const MAX_RETRIES = 5;

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
    async recordNewPrinting(data: {
      printingId: string;
      cardName: string;
      setName?: string | null;
      shortCode?: string | null;
      rarity?: string | null;
      finish?: string | null;
      artist?: string | null;
      language?: string | null;
    }): Promise<void> {
      await db
        .insertInto("printingEvents")
        .values({
          eventType: "new",
          printingId: data.printingId,
          cardName: data.cardName,
          setName: data.setName ?? null,
          shortCode: data.shortCode ?? null,
          rarity: data.rarity ?? null,
          finish: data.finish ?? null,
          artist: data.artist ?? null,
          language: data.language ?? null,
          changes: null,
          status: "pending",
          retryCount: 0,
        })
        .execute();
    },

    /**
     * Record a "changed" event with before/after field diffs.
     * @returns Resolves when the event has been inserted.
     */
    async recordPrintingChange(data: {
      printingId: string;
      cardName: string;
      setName?: string | null;
      shortCode?: string | null;
      changes: FieldChange[];
    }): Promise<void> {
      if (data.changes.length === 0) {
        return;
      }
      await db
        .insertInto("printingEvents")
        .values({
          eventType: "changed",
          printingId: data.printingId,
          cardName: data.cardName,
          setName: data.setName ?? null,
          shortCode: data.shortCode ?? null,
          rarity: null,
          finish: null,
          artist: null,
          language: null,
          changes: JSON.stringify(data.changes),
          status: "pending",
          retryCount: 0,
        })
        .execute();
    },

    /**
     * Fetch all pending events (for the flush cron job).
     * @returns Pending events ordered by creation time.
     */
    listPending(): Promise<Selectable<PrintingEventsTable>[]> {
      return db
        .selectFrom("printingEvents")
        .selectAll()
        .where("status", "=", "pending")
        .orderBy("createdAt", "asc")
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
      // Increment retry count
      await db
        .updateTable("printingEvents")
        .set((eb) => ({
          retryCount: eb("retryCount", "+", 1),
        }))
        .where("id", "in", ids)
        .execute();

      // Mark as permanently failed if exceeded max retries
      await db
        .updateTable("printingEvents")
        .set({ status: "failed" })
        .where("id", "in", ids)
        .where("retryCount", ">=", MAX_RETRIES)
        .execute();
    },
  };
}
