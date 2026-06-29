import type { Kysely } from "kysely";

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
  listCount: number;
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
    /** @returns All users with aggregate card, deck, collection, and list counts. */
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
          // Copies no longer carry an owner; ownership derives from the
          // collection. "Cards" for a user = copies in their personal
          // collections (group-owned copies belong to the group, not a person).
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

    /** @returns The user's id, display name, and email matched by id, or `undefined`. */
    findById(id: string): Promise<{ id: string; name: string | null; email: string } | undefined> {
      return db
        .selectFrom("users")
        .select(["id", "name", "email"])
        .where("id", "=", id)
        .executeTakeFirst();
    },

    /** @returns The user row matched by email (case-sensitive), or `undefined`. */
    getByEmail(
      email: string,
    ): Promise<{ id: string; name: string | null; image: string | null } | undefined> {
      return db
        .selectFrom("users")
        .select(["id", "name", "image"])
        .where("email", "=", email)
        .executeTakeFirst();
    },

    /**
     * Resolve an exact account email to its id, case-insensitively. Used to add
     * staff by the email the host already knows — not a name search.
     * @returns The user id matched by email, or `undefined`.
     */
    findIdByEmail(email: string): Promise<{ id: string } | undefined> {
      return db
        .selectFrom("users")
        .select(["id"])
        .where((eb) => eb(eb.fn("lower", ["email"]), "=", email.toLowerCase()))
        .executeTakeFirst();
    },
  };
}
