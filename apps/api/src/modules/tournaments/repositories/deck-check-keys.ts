import type { Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { DeckCheckKeysTable } from "../../../db/tables/tournaments.js";
import type { DeckCheckHost } from "./deck-check-shared.js";

export type DeckCheckKey = Selectable<DeckCheckKeysTable>;

export function deckCheckKeysRepo(db: Kysely<Database>) {
  return {
    async listKeysForHost(
      host: DeckCheckHost,
    ): Promise<(DeckCheckKey & { createdByName: string | null })[]> {
      let query = db
        .selectFrom("deckCheckKeys as k")
        .leftJoin("users as u", "u.id", "k.createdBy")
        .selectAll("k")
        .select((eb) => eb.ref("u.name").as("createdByName"));
      query =
        host.hostType === "user"
          ? query.where("k.hostType", "=", "user").where("k.hostUserId", "=", host.hostUserId)
          : query
              .where("k.hostType", "=", "organization")
              .where("k.hostOrgId", "=", host.hostOrgId);
      const rows = await query.orderBy("k.createdAt", "desc").execute();
      return rows.map((row) => ({ ...row, createdByName: row.createdByName ?? null }));
    },

    createKeyForHost(input: {
      host: DeckCheckHost;
      tokenHash: string;
      tokenPrefix: string;
      label: string | null;
      createdBy: string;
    }): Promise<DeckCheckKey> {
      return db
        .insertInto("deckCheckKeys")
        .values({
          hostType: input.host.hostType,
          hostUserId: input.host.hostType === "user" ? input.host.hostUserId : null,
          hostOrgId: input.host.hostType === "organization" ? input.host.hostOrgId : null,
          tokenHash: input.tokenHash,
          tokenPrefix: input.tokenPrefix,
          label: input.label,
          createdBy: input.createdBy,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    updateKeyLabelForHost(
      host: DeckCheckHost,
      keyId: string,
      label: string,
    ): Promise<DeckCheckKey | undefined> {
      let query = db.updateTable("deckCheckKeys").set({ label }).where("id", "=", keyId);
      query =
        host.hostType === "user"
          ? query.where("hostType", "=", "user").where("hostUserId", "=", host.hostUserId)
          : query.where("hostType", "=", "organization").where("hostOrgId", "=", host.hostOrgId);
      return query.returningAll().executeTakeFirst();
    },

    async revokeKeyForHost(host: DeckCheckHost, keyId: string): Promise<boolean> {
      let query = db
        .updateTable("deckCheckKeys")
        .set({ revokedAt: new Date() })
        .where("id", "=", keyId)
        .where("revokedAt", "is", null);
      query =
        host.hostType === "user"
          ? query.where("hostType", "=", "user").where("hostUserId", "=", host.hostUserId)
          : query.where("hostType", "=", "organization").where("hostOrgId", "=", host.hostOrgId);
      const result = await query.executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    // The `revokedAt IS NOT NULL` guard keeps an active key from being
    // deleted out from under a provider: revoke first, then delete.
    async deleteRevokedKeyForHost(host: DeckCheckHost, keyId: string): Promise<boolean> {
      let query = db
        .deleteFrom("deckCheckKeys")
        .where("id", "=", keyId)
        .where("revokedAt", "is not", null);
      query =
        host.hostType === "user"
          ? query.where("hostType", "=", "user").where("hostUserId", "=", host.hostUserId)
          : query.where("hostType", "=", "organization").where("hostOrgId", "=", host.hostOrgId);
      const result = await query.executeTakeFirst();
      return result.numDeletedRows > 0n;
    },

    findActiveKeyByHash(tokenHash: string): Promise<(DeckCheckHost & { id: string }) | undefined> {
      return db
        .selectFrom("deckCheckKeys")
        .select(["id", "hostType", "hostUserId", "hostOrgId"])
        .where("tokenHash", "=", tokenHash)
        .where("revokedAt", "is", null)
        .executeTakeFirst();
    },

    async touchKeyUsage(keyId: string): Promise<void> {
      await db
        .updateTable("deckCheckKeys")
        .set({ lastUsedAt: new Date() })
        .where("id", "=", keyId)
        .execute();
    },
  };
}
