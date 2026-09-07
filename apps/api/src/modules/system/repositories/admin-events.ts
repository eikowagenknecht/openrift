import type { Kysely } from "kysely";

import type { AdminEventAction, AdminEventEntityType, Database } from "../../../db/index.js";
import { keysetCursorPredicate } from "../../../repositories/query-helpers.js";

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

/** Joined with the actor's user record; actor fields are null if the user was deleted. */
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

/** `action` is free text matched against the stored value, not the {@link AdminEventAction} union. */
export interface AdminEventFilters {
  actorUserId?: string;
  action?: string;
  search?: string;
}

/**
 * One row per card-catalog admin mutation. Writes happen best-effort via
 * `recordAdminEvent`; the actor column has no FK so rows survive user
 * deletion (reads LEFT JOIN users for display).
 */
export function adminEventsRepo(db: Kysely<Database>) {
  return {
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
     * Cursor-paginated audit event list (newest first). Fetches `limit + 1`
     * rows to detect `hasMore`. `search` matches entity label/id/card slug
     * case-insensitively.
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
      const action = filters.action;
      if (action) {
        query = query.where((eb) => eb(eb.cast<string>(eb.ref("ae.action"), "text"), "=", action));
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

    /** Ordered by email; deleted users (null email) sort last. */
    async listActors(): Promise<{ userId: string; name: string | null; email: string | null }[]> {
      return await db
        .selectFrom("adminEvents as ae")
        .leftJoin("users as u", "u.id", "ae.actorUserId")
        .select(["ae.actorUserId as userId", "u.name as name", "u.email as email"])
        .distinct()
        .orderBy("email")
        .execute();
    },

    /** Only actions actually recorded, so the filter dropdown never offers an empty result. */
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
