import type { RuleKind } from "@openrift/shared";
import type { Kysely, SqlBool } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";

export function rulesRepo(db: Kysely<Database>) {
  return {
    /**
     * Returns the latest version of every rule for a given kind (excluding
     * removed rules). Uses DISTINCT ON to pick the newest version per
     * rule_number within the kind.
     *
     * @returns All current rules ordered by sort_order.
     */
    listLatest(kind: RuleKind) {
      return db
        .selectFrom("rules")
        .selectAll()
        .where("kind", "=", kind)
        .where("changeType", "!=", "removed")
        .where(
          "id",
          "in",
          db
            .selectFrom("rules as r2")
            .select(sql<string>`DISTINCT ON (r2.rule_number) r2.id`.as("id"))
            .where("r2.kind", "=", kind)
            .orderBy("r2.ruleNumber")
            .orderBy("r2.version", "desc"),
        )
        .orderBy("sortOrder")
        .execute();
    },

    /**
     * Returns all rules of a kind at or before a specific version.
     *
     * @returns Full ruleset as it was at the given version.
     */
    listAtVersion(kind: RuleKind, version: string) {
      return db
        .selectFrom("rules")
        .selectAll()
        .where("kind", "=", kind)
        .where("changeType", "!=", "removed")
        .where("version", "<=", version)
        .where(
          "id",
          "in",
          db
            .selectFrom("rules as r2")
            .select(sql<string>`DISTINCT ON (r2.rule_number) r2.id`.as("id"))
            .where("r2.kind", "=", kind)
            .where("r2.version", "<=", version)
            .orderBy("r2.ruleNumber")
            .orderBy("r2.version", "desc"),
        )
        .orderBy("sortOrder")
        .execute();
    },

    /**
     * Full-text search across rule content within a kind, optionally scoped
     * to a version.
     *
     * @returns Matching rules from the given version (or latest if omitted).
     */
    search(kind: RuleKind, query: string, version?: string) {
      let versionSubquery = db
        .selectFrom("rules as r2")
        .select(sql<string>`DISTINCT ON (r2.rule_number) r2.id`.as("id"))
        .where("r2.kind", "=", kind)
        .orderBy("r2.ruleNumber")
        .orderBy("r2.version", "desc");

      if (version) {
        versionSubquery = versionSubquery.where("r2.version", "<=", version);
      }

      return db
        .selectFrom("rules")
        .selectAll()
        .where("kind", "=", kind)
        .where("changeType", "!=", "removed")
        .where("id", "in", versionSubquery)
        .where(
          sql<SqlBool>`to_tsvector('english', content) @@ plainto_tsquery('english', ${query})`,
        )
        .orderBy("sortOrder")
        .execute();
    },

    /**
     * Returns known rule versions ordered chronologically. When `kind` is
     * provided, results are scoped to that kind; otherwise all kinds are
     * returned (used by admin views).
     *
     * @returns Version metadata list.
     */
    listVersions(kind?: RuleKind) {
      let query = db.selectFrom("ruleVersions").selectAll();
      if (kind) {
        query = query.where("kind", "=", kind);
      }
      return query.orderBy("version", "asc").execute();
    },

    /**
     * Creates a new rule version entry.
     *
     * @returns The inserted version row.
     */
    createVersion(values: {
      kind: RuleKind;
      version: string;
      sourceType: string;
      sourceUrl?: string | null;
      publishedAt?: string | null;
    }) {
      return db
        .insertInto("ruleVersions")
        .values({
          kind: values.kind,
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
        kind: RuleKind;
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
     * Gets a version by its (kind, version) identifier.
     *
     * @returns The version row or undefined.
     */
    getVersion(kind: RuleKind, version: string) {
      return db
        .selectFrom("ruleVersions")
        .selectAll()
        .where("kind", "=", kind)
        .where("version", "=", version)
        .executeTakeFirst();
    },

    /**
     * Deletes a version and all its rules (cascading).
     *
     * @returns void
     */
    deleteVersion(kind: RuleKind, version: string) {
      return db
        .deleteFrom("ruleVersions")
        .where("kind", "=", kind)
        .where("version", "=", version)
        .execute();
    },
  };
}
