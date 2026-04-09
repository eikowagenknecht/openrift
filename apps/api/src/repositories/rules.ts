import type { Kysely, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function rulesRepo(db: Kysely<Database>) {
  return {
    /**
     * Returns the latest version of every rule (excluding removed rules).
     * Uses DISTINCT ON to pick the newest version per rule_number.
     *
     * @returns All current rules ordered by sort_order.
     */
    listLatest() {
      return db
        .selectFrom("rules")
        .selectAll()
        .where("changeType", "!=", "removed")
        .where(
          "id",
          "in",
          db
            .selectFrom("rules as r2")
            .select(sql<string>`DISTINCT ON (r2.rule_number) r2.id`.as("id"))
            .orderBy("r2.ruleNumber")
            .orderBy("r2.version", "desc"),
        )
        .orderBy("sortOrder")
        .execute();
    },

    /**
     * Returns all rules at or before a specific version.
     *
     * @returns Full ruleset as it was at the given version.
     */
    listAtVersion(version: string) {
      return db
        .selectFrom("rules")
        .selectAll()
        .where("changeType", "!=", "removed")
        .where("version", "<=", version)
        .where(
          "id",
          "in",
          db
            .selectFrom("rules as r2")
            .select(sql<string>`DISTINCT ON (r2.rule_number) r2.id`.as("id"))
            .where("r2.version", "<=", version)
            .orderBy("r2.ruleNumber")
            .orderBy("r2.version", "desc"),
        )
        .orderBy("sortOrder")
        .execute();
    },

    /**
     * Full-text search across rule content, optionally scoped to a version.
     *
     * @returns Matching rules from the given version (or latest if omitted).
     */
    search(query: string, version?: string) {
      let versionSubquery = db
        .selectFrom("rules as r2")
        .select(sql<string>`DISTINCT ON (r2.rule_number) r2.id`.as("id"))
        .orderBy("r2.ruleNumber")
        .orderBy("r2.version", "desc");

      if (version) {
        versionSubquery = versionSubquery.where("r2.version", "<=", version);
      }

      return db
        .selectFrom("rules")
        .selectAll()
        .where("changeType", "!=", "removed")
        .where("id", "in", versionSubquery)
        .where(
          sql<SqlBool>`to_tsvector('english', content) @@ plainto_tsquery('english', ${query})`,
        )
        .orderBy("sortOrder")
        .execute();
    },

    /**
     * Returns all known rule versions ordered chronologically.
     *
     * @returns Version metadata list.
     */
    listVersions() {
      return db.selectFrom("ruleVersions").selectAll().orderBy("version", "asc").execute();
    },

    /**
     * Creates a new rule version entry.
     *
     * @returns The inserted version row.
     */
    createVersion(values: {
      version: string;
      sourceType: string;
      sourceUrl?: string | null;
      publishedAt?: string | null;
    }) {
      return db
        .insertInto("ruleVersions")
        .values({
          version: values.version,
          sourceType: values.sourceType,
          sourceUrl: values.sourceUrl ?? null,
          publishedAt: values.publishedAt ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /**
     * Bulk-inserts rule rows for a version.
     *
     * @returns The number of inserted rows.
     */
    async insertRules(
      rules: {
        version: string;
        ruleNumber: string;
        sortOrder: number;
        depth: number;
        ruleType: string;
        content: string;
        changeType: string;
      }[],
    ) {
      if (rules.length === 0) {
        return 0;
      }
      const result = await db.insertInto("rules").values(rules).execute();
      return result.length;
    },

    /**
     * Gets a version by its identifier.
     *
     * @returns The version row or undefined.
     */
    getVersion(version: string) {
      return db
        .selectFrom("ruleVersions")
        .selectAll()
        .where("version", "=", version)
        .executeTakeFirst();
    },

    /**
     * Deletes a version and all its rules (cascading).
     *
     * @returns void
     */
    deleteVersion(version: string) {
      return db.deleteFrom("ruleVersions").where("version", "=", version).execute();
    },
  };
}
