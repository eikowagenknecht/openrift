import type { Kysely } from "kysely";

import type { Database, FieldChange } from "../db/index.js";
import { imageId } from "./query-helpers.js";

const MAX_RETRIES = 5;

// postgres.js under Bun returns jsonb columns as a JSON-encoded string rather
// than a parsed value (see also user-preferences.ts). Rows that came back from
// listPending/listByStatus need their `changes` field run through this before
// callers can iterate it as an array.
function parseChanges<T extends { changes: unknown }>(
  row: T,
): T & { changes: FieldChange[] | null } {
  const raw = row.changes;
  if (raw === null || raw === undefined) {
    return { ...row, changes: null };
  }
  if (typeof raw === "string") {
    return { ...row, changes: JSON.parse(raw) as FieldChange[] };
  }
  return { ...row, changes: raw as FieldChange[] };
}

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
  finishLabel: string | null;
  artist: string | null;
  language: string | null;
  languageName: string | null;
  frontImageId: string | null;
}

type PrintingEventStatus = "pending" | "sent" | "failed";

interface AdminPrintingEvent extends EnrichedPrintingEvent {
  status: PrintingEventStatus;
  retryCount: number;
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
    async listPending(): Promise<EnrichedPrintingEvent[]> {
      const rows = await db
        .selectFrom("printingEvents as pe")
        .innerJoin("printings as p", "p.id", "pe.printingId")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .innerJoin("sets as s", "s.id", "p.setId")
        .leftJoin("finishes as fi", "fi.slug", "p.finish")
        .leftJoin("languages as lng", "lng.code", "p.language")
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
          "fi.label as finishLabel",
          "p.artist",
          "p.language",
          "lng.name as languageName",
          imageId("imgf").as("frontImageId"),
        ])
        .where("pe.status", "=", "pending")
        .orderBy("pe.createdAt", "asc")
        .execute();
      return rows.map((row) => parseChanges(row));
    },

    /**
     * Fetch events with the given statuses, enriched with printing/card/set/image
     * context plus status + retryCount columns. Used by the admin queue view.
     * @returns Enriched events ordered by creation time descending (newest first).
     */
    async listByStatus(statuses: PrintingEventStatus[]): Promise<AdminPrintingEvent[]> {
      if (statuses.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("printingEvents as pe")
        .innerJoin("printings as p", "p.id", "pe.printingId")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .innerJoin("sets as s", "s.id", "p.setId")
        .leftJoin("finishes as fi", "fi.slug", "p.finish")
        .leftJoin("languages as lng", "lng.code", "p.language")
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
          "pe.status",
          "pe.retryCount",
          "c.name as cardName",
          "c.slug as cardSlug",
          "s.name as setName",
          "p.shortCode",
          "p.rarity",
          "p.finish",
          "fi.label as finishLabel",
          "p.artist",
          "p.language",
          "lng.name as languageName",
          imageId("imgf").as("frontImageId"),
        ])
        .where("pe.status", "in", statuses)
        .orderBy("pe.createdAt", "desc")
        .execute();
      return rows.map((row) => parseChanges(row));
    },

    /**
     * Reset events back to pending and clear their retry counter so they get
     * picked up by the next flush. Used by the admin queue view to retry events
     * that had hit MAX_RETRIES.
     * @returns Resolves when the events have been updated.
     */
    async retryFailed(ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db
        .updateTable("printingEvents")
        .set({ status: "pending", retryCount: 0 })
        .where("id", "in", ids)
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
