import type { ContactMethod, ContactMethodType } from "@openrift/shared/types/api/contact-method";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";

/** All writes are scoped by `userId` so a caller can only touch their own rows. */
export function userContactMethodsRepo(db: Kysely<Database>) {
  return {
    listForUser(userId: string): Promise<ContactMethod[]> {
      return db
        .selectFrom("userContactMethods")
        .select(["id", "type", "value"])
        .where("userId", "=", userId)
        .orderBy("sortOrder", "asc")
        .orderBy("id", "asc")
        .execute();
    },

    /** Appends a method after the user's existing ones. */
    async create(userId: string, type: ContactMethodType, value: string): Promise<ContactMethod> {
      const next = await db
        .selectFrom("userContactMethods")
        .select((eb) => eb.fn.coalesce(eb.fn.max("sortOrder"), eb.lit(-1)).as("maxOrder"))
        .where("userId", "=", userId)
        .executeTakeFirstOrThrow();

      return db
        .insertInto("userContactMethods")
        .values({ userId, type, value, sortOrder: Number(next.maxOrder) + 1 })
        .returning(["id", "type", "value"])
        .executeTakeFirstOrThrow();
    },

    /** Returns `undefined` if the user owns no such method. */
    update(
      id: string,
      userId: string,
      type: ContactMethodType,
      value: string,
    ): Promise<ContactMethod | undefined> {
      return db
        .updateTable("userContactMethods")
        .set({ type, value })
        .where("id", "=", id)
        .where("userId", "=", userId)
        .returning(["id", "type", "value"])
        .executeTakeFirst();
    },

    /** The reveal rows cascade away with the deleted method. */
    async delete(id: string, userId: string): Promise<boolean> {
      const result = await db
        .deleteFrom("userContactMethods")
        .where("id", "=", id)
        .where("userId", "=", userId)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },

    /**
     * Reorders the user's methods to match `ids` (ids the user doesn't own are
     * ignored). Methods not present in `ids` keep their relative order after the
     * listed ones.
     */
    async reorder(userId: string, ids: string[]): Promise<void> {
      if (ids.length === 0) {
        return;
      }
      await db.transaction().execute(async (trx) => {
        const owned = await trx
          .selectFrom("userContactMethods")
          .select("id")
          .where("userId", "=", userId)
          .where("id", "in", ids)
          .execute();
        const ownedIds = new Set(owned.map((row) => row.id));
        let order = 0;
        for (const id of ids) {
          if (!ownedIds.has(id)) {
            continue;
          }
          await trx
            .updateTable("userContactMethods")
            .set({ sortOrder: order })
            .where("id", "=", id)
            .where("userId", "=", userId)
            .execute();
          order += 1;
        }
      });
    },
  };
}
