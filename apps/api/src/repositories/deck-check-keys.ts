import type { Kysely, Selectable } from "kysely";

import type { Database, DeckCheckKeysTable } from "../db/index.js";
import type { DeckCheckHost } from "./deck-check.js";

export type DeckCheckKey = Selectable<DeckCheckKeysTable>;

/**
 * Repository for deck-check integration keys (ADR-033): the host-scoped tokens
 * providers present on the ingest endpoint. Every mutation is scoped to the
 * owning host, so a key id from another host can never be touched.
 * @param db The Kysely database handle (or transaction).
 * @returns The repository methods.
 */
export function deckCheckKeysRepo(db: Kysely<Database>) {
  return {
    /**
     * Lists a host's integration keys directly (ADR-033): the host is the
     * current user or an organization, not resolved through a friend group.
     * @returns The host's keys with the creator name, newest first.
     */
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

    /**
     * Mints an integration key owned by a host directly (ADR-033).
     * @returns The created key row.
     */
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

    /**
     * Renames a host's key, scoped to the host so a key id from another host
     * cannot be relabelled.
     * @returns The updated key, or undefined when the host does not own it.
     */
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

    /**
     * Revokes a host's key, scoped to the host.
     * @returns True when an active key was revoked.
     */
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

    /**
     * Permanently removes a host's already-revoked key, scoped to the host. The
     * `revoked_at IS NOT NULL` guard keeps an active key from being deleted out
     * from under a provider — revoke first, then remove the dead row. Nothing
     * references a key id, so the delete leaves no dangling rows.
     * @returns True when a revoked key was deleted.
     */
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

    /**
     * Resolves a presented token's hash to its host; revoked keys do not match.
     * @returns The key id and host, or undefined when no active key matches.
     */
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
