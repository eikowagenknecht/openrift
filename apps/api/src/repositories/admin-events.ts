import type { Kysely } from "kysely";

import type { AdminEventAction, AdminEventEntityType, Database } from "../db/index.js";
import { keysetCursorPredicate } from "./query-helpers.js";

/** Input for one audit event write. */
export interface AdminEventInsert {
  actorUserId: string;
  action: AdminEventAction;
  entityType: AdminEventEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  cardSlug?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

/** Audit event row joined with the actor's user record (null if deleted). */
export interface AdminEventRow {
  id: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  cardSlug: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: Date;
}

/** Filters for the audit event list. */
export interface AdminEventFilters {
  actorUserId?: string;
  action?: string;
  search?: string;
}

/**
 * Admin audit log (migration 201): one row per card-catalog admin mutation.
 * Writes happen best-effort via `recordAdminEvent`; the actor column has no
 * FK so rows survive user deletion (reads LEFT JOIN users for display).
 *
 * @returns An object with admin-event query methods bound to the given `db`.
 */
export function adminEventsRepo(db: Kysely<Database>) {
  return {
    /** Inserts one audit event. */
    async insert(event: AdminEventInsert): Promise<void> {
      await db
        .insertInto("adminEvents")
        .values({
          actorUserId: event.actorUserId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId ?? null,
          entityLabel: event.entityLabel ?? null,
          cardSlug: event.cardSlug ?? null,
          oldValues: event.oldValues ?? null,
          newValues: event.newValues ?? null,
        })
        .execute();
    },

    /**
     * Cursor-paginated audit event list (newest first), joined with the
     * actor's user row. Fetches `limit + 1` rows to detect `hasMore`.
     * `search` matches entity label/id/card slug case-insensitively.
     * @returns Audit rows with actor name/email (null for deleted users).
     */
    async list(
      filters: AdminEventFilters,
      limit: number,
      cursor?: string,
    ): Promise<AdminEventRow[]> {
      let query = db
        .selectFrom("adminEvents as ae")
        .leftJoin("users as u", "u.id", "ae.actorUserId")
        .select([
          "ae.id",
          "ae.actorUserId",
          "u.name as actorName",
          "u.email as actorEmail",
          "ae.action",
          "ae.entityType",
          "ae.entityId",
          "ae.entityLabel",
          "ae.cardSlug",
          "ae.oldValues",
          "ae.newValues",
          "ae.createdAt",
        ])
        .orderBy("ae.createdAt", "desc")
        .orderBy("ae.id", "desc")
        .limit(limit + 1);

      if (filters.actorUserId) {
        query = query.where("ae.actorUserId", "=", filters.actorUserId);
      }
      if (filters.action) {
        query = query.where("ae.action", "=", filters.action as never);
      }
      if (filters.search) {
        const pattern = `%${filters.search}%`;
        query = query.where((eb) =>
          eb.or([
            eb("ae.entityLabel", "ilike", pattern),
            eb("ae.entityId", "ilike", pattern),
            eb("ae.cardSlug", "ilike", pattern),
          ]),
        );
      }
      if (cursor) {
        query = query.where(
          keysetCursorPredicate(cursor, {
            timeColumn: "ae.createdAt",
            idColumn: "ae.id",
            idDirection: "desc",
          }),
        );
      }

      return await query.execute();
    },

    /**
     * Distinct actors that appear in the log, joined with users for display.
     * @returns Actors ordered by email (deleted users sort last with nulls).
     */
    async listActors(): Promise<{ userId: string; name: string | null; email: string | null }[]> {
      return await db
        .selectFrom("adminEvents as ae")
        .leftJoin("users as u", "u.id", "ae.actorUserId")
        .select(["ae.actorUserId as userId", "u.name as name", "u.email as email"])
        .distinct()
        .orderBy("email")
        .execute();
    },

    /**
     * Distinct actions that appear in the log. Only actions actually recorded
     * are listed, so the filter dropdown never offers an empty result.
     * @returns Action identifiers ordered alphabetically.
     */
    async listActions(): Promise<string[]> {
      const rows = await db
        .selectFrom("adminEvents")
        .select("action")
        .distinct()
        .orderBy("action")
        .execute();
      return rows.map((row) => row.action);
    },
  };
}
