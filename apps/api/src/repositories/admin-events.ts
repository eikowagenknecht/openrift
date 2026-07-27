import { ERROR_CODES } from "@openrift/shared";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import { parseJsonb } from "../db/helpers.js";
import type { AdminEventAction, AdminEventEntityType, Database } from "../db/index.js";
import { AppError } from "../errors.js";

export { buildEventsCursor } from "./collection-events.js";

const CURSOR_SEPARATOR = "_";

function parseCursor(cursor: string): { time: Date; id: string | null } {
  const separatorIndex = cursor.indexOf(CURSOR_SEPARATOR);
  // Legacy timestamp-only cursor (backward compat during deploys) has no
  // separator; either way, the part before it (or the whole string) must be
  // a parseable timestamp.
  const rawTime = separatorIndex === -1 ? cursor : cursor.slice(0, separatorIndex);
  const time = new Date(rawTime);
  if (Number.isNaN(time.getTime())) {
    // The query schema (adminAuditEventsContract's list input) already rejects
    // syntactically invalid cursors before this runs; this is a defensive
    // backstop against any other caller passing an unvalidated cursor straight
    // through.
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "Invalid cursor");
  }
  return {
    time,
    id: separatorIndex === -1 ? null : cursor.slice(separatorIndex + 1),
  };
}

/** Input for one audit event write. */
export interface AdminEventInsert {
  actorUserId: string;
  action: AdminEventAction;
  entityType: AdminEventEntityType;
  entityId?: string | null;
  entityLabel?: string | null;
  cardSlug?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
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
    /** Inserts one audit event. jsonb payloads are stringified explicitly. */
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
          oldValues:
            event.oldValues === undefined || event.oldValues === null
              ? null
              : (JSON.stringify(event.oldValues) as never),
          newValues:
            event.newValues === undefined || event.newValues === null
              ? null
              : (JSON.stringify(event.newValues) as never),
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
        const { time, id } = parseCursor(cursor);
        // date_trunc to milliseconds: JS Dates lose the µs the column stores,
        // so an untruncated equality/comparison would silently skip rows.
        const tsMs = sql<Date>`date_trunc('milliseconds', ${sql.ref("ae.createdAt")})`;
        query = id
          ? query.where((eb) =>
              eb.or([eb(tsMs, "<", time), eb.and([eb(tsMs, "=", time), eb("ae.id", "<", id)])]),
            )
          : query.where(tsMs, "<", time);
      }

      const rows = await query.execute();
      return rows.map((row) => ({
        ...row,
        oldValues: parseJsonb(row.oldValues),
        newValues: parseJsonb(row.newValues),
      }));
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
