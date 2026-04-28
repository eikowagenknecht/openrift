import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

interface UserWithCounts {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  isAdmin: boolean;
  cardCount: number;
  deckCount: number;
  collectionCount: number;
  createdAt: Date;
  lastActiveAt: Date | null;
}

/**
 * Queries for the users table (admin-facing user listing).
 *
 * @returns An object with user query methods bound to the given `db`.
 */
export function usersRepo(db: Kysely<Database>) {
  return {
    /** @returns All users with aggregate card, deck, and collection counts. */
    async listWithCounts(): Promise<UserWithCounts[]> {
      const rows = await db
        .selectFrom("users as u")
        .leftJoin("admins as a", "a.userId", "u.id")
        .leftJoin("copies as co", "co.userId", "u.id")
        .leftJoin("decks as d", "d.userId", "u.id")
        .leftJoin("collections as cl", "cl.userId", "u.id")
        .leftJoin("sessions as s", "s.userId", "u.id")
        .select([
          "u.id",
          "u.email",
          "u.name",
          "u.image",
          "u.createdAt",
          sql<boolean>`a.user_id IS NOT NULL`.as("isAdmin"),
          sql<number>`count(distinct co.id)`.as("cardCount"),
          sql<number>`count(distinct d.id)`.as("deckCount"),
          sql<number>`count(distinct cl.id)`.as("collectionCount"),
          sql<Date | null>`max(s.updated_at)`.as("lastActiveAt"),
        ])
        .groupBy(["u.id", "u.email", "u.name", "u.image", "u.createdAt", "a.userId"])
        .orderBy("u.createdAt", "desc")
        .execute();

      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        image: r.image,
        isAdmin: r.isAdmin,
        cardCount: Number(r.cardCount),
        deckCount: Number(r.deckCount),
        collectionCount: Number(r.collectionCount),
        createdAt: r.createdAt,
        lastActiveAt: r.lastActiveAt,
      }));
    },
  };
}
