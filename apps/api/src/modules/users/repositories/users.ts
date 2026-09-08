import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

interface SignupDay {
  date: string;
  count: number;
}

interface UserWithCounts {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  isAdmin: boolean;
  cardCount: number;
  deckCount: number;
  collectionCount: number;
  listCount: number;
  createdAt: Date;
  lastActiveAt: Date | null;
}

export function usersRepo(db: Kysely<Database>) {
  return {
    async existsById(userId: string): Promise<boolean> {
      const row = await db
        .selectFrom("users")
        .select("id")
        .where("id", "=", userId)
        .executeTakeFirst();
      return row !== undefined;
    },

    async listWithCounts(): Promise<UserWithCounts[]> {
      const rows = await db
        .selectFrom("users as u")
        .select((eb) => [
          "u.id",
          "u.email",
          "u.name",
          "u.image",
          "u.createdAt",
          eb
            .exists(eb.selectFrom("admins").select("userId").whereRef("admins.userId", "=", "u.id"))
            .as("isAdmin"),
          // Copies carry no owner; a user's cards are copies in their own
          // collections, not group-owned copies.
          eb
            .selectFrom("copies")
            .innerJoin("collections", "collections.id", "copies.collectionId")
            .select(eb.cast<number>(eb.fn.countAll(), "integer").as("c"))
            .whereRef("collections.userId", "=", "u.id")
            .as("cardCount"),
          eb
            .selectFrom("decks")
            .select(eb.cast<number>(eb.fn.countAll(), "integer").as("c"))
            .whereRef("decks.userId", "=", "u.id")
            .as("deckCount"),
          eb
            .selectFrom("collections")
            .select(eb.cast<number>(eb.fn.countAll(), "integer").as("c"))
            .whereRef("collections.userId", "=", "u.id")
            .as("collectionCount"),
          eb
            .selectFrom("lists")
            .select(eb.cast<number>(eb.fn.countAll(), "integer").as("c"))
            .whereRef("lists.userId", "=", "u.id")
            .as("listCount"),
          eb
            .selectFrom("sessions")
            .select((seb) => seb.fn.max("updatedAt").as("m"))
            .whereRef("sessions.userId", "=", "u.id")
            .as("lastActiveAt"),
        ])
        .orderBy("u.createdAt", "desc")
        .execute();

      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        image: r.image,
        isAdmin: Boolean(r.isAdmin),
        cardCount: r.cardCount ?? 0,
        deckCount: r.deckCount ?? 0,
        collectionCount: r.collectionCount ?? 0,
        listCount: r.listCount ?? 0,
        createdAt: r.createdAt,
        lastActiveAt: r.lastActiveAt,
      }));
    },

    findById(id: string): Promise<{ id: string; name: string | null; email: string } | undefined> {
      return db
        .selectFrom("users")
        .select(["id", "name", "email"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    getByEmail(
      email: string,
    ): Promise<{ id: string; name: string | null; image: string | null } | undefined> {
      return db
        .selectFrom("users")
        .select(["id", "name", "image"])
        .where("email", "=", email)
        .executeTakeFirst();
    },

    /** One row per UTC day from the first signup to today, quiet days included as zero. */
    async getSignupSeries(): Promise<SignupDay[]> {
      const result = await sql<SignupDay>`
        WITH bounds AS (
          SELECT
            date_trunc('day', min(created_at) AT TIME ZONE 'UTC') AS first_day,
            date_trunc('day', now() AT TIME ZONE 'UTC') AS last_day
          FROM users
        ),
        days AS (
          SELECT generate_series(first_day, last_day, interval '1 day') AS day FROM bounds
        ),
        signups AS (
          SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day, count(*)::int AS count
          FROM users
          GROUP BY 1
        )
        SELECT to_char(days.day, 'YYYY-MM-DD') AS date, coalesce(signups.count, 0) AS count
        FROM days
        LEFT JOIN signups ON signups.day = days.day
        ORDER BY days.day
      `.execute(db);
      return result.rows;
    },

    findIdByEmail(email: string): Promise<{ id: string } | undefined> {
      return db
        .selectFrom("users")
        .select(["id"])
        .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
        .executeTakeFirst();
    },
  };
}
