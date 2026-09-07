import { compareRuleNumbers } from "@openrift/shared/rules";
import type { RuleChangeType, RuleKind, RuleType } from "@openrift/shared/types/api/rules";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { rowBatches } from "../lib/bind-batches.js";

export function rulesRepo(db: Kysely<Database>) {
  return {
    /** Sorted by natural rule-number order in JS: `sort_order` is per-version and collides across versions. */
    async listLatest(kind: RuleKind) {
      const rows = await db
        .selectFrom("rules")
        .selectAll()
        .where("kind", "=", kind)
        .where("changeType", "!=", "removed")
        .where(
          "id",
          "in",
          db
            .selectFrom("rules as r2")
            .select("r2.id")
            .distinctOn("r2.ruleNumber")
            .where("r2.kind", "=", kind)
            .orderBy("r2.ruleNumber")
            .orderBy("r2.version", "desc"),
        )
        .execute();
      return rows.toSorted((a, b) => compareRuleNumbers(a.ruleNumber, b.ruleNumber));
    },

    /**
     * Rows are sorted by natural rule-number order in JS — `sort_order` is
     * per-version and collides across versions, so it can't be used here.
     */
    async listAtVersion(kind: RuleKind, version: string) {
      const rows = await db
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
            .select("r2.id")
            .distinctOn("r2.ruleNumber")
            .where("r2.kind", "=", kind)
            .where("r2.version", "<=", version)
            .orderBy("r2.ruleNumber")
            .orderBy("r2.version", "desc"),
        )
        .execute();
      return rows.toSorted((a, b) => compareRuleNumbers(a.ruleNumber, b.ruleNumber));
    },

    async listChangesAtVersion(kind: RuleKind, version: string) {
      const changeRows = await db
        .selectFrom("rules")
        .selectAll()
        .where("kind", "=", kind)
        .where("version", "=", version)
        .orderBy("sortOrder")
        .execute();

      const ruleNumbersNeedingPrev = changeRows
        .filter((r) => r.changeType === "modified" || r.changeType === "removed")
        .map((r) => r.ruleNumber);

      const prevByNumber = new Map<string, string>();
      if (ruleNumbersNeedingPrev.length > 0) {
        const prevRows = await db
          .selectFrom("rules")
          .select(["ruleNumber", "content"])
          .where(
            "id",
            "in",
            db
              .selectFrom("rules as r3")
              .select("r3.id")
              .distinctOn("r3.ruleNumber")
              .where("r3.kind", "=", kind)
              .where("r3.ruleNumber", "in", ruleNumbersNeedingPrev)
              .where("r3.version", "<", version)
              .orderBy("r3.ruleNumber")
              .orderBy("r3.version", "desc"),
          )
          .execute();
        for (const row of prevRows) {
          prevByNumber.set(row.ruleNumber, row.content);
        }
      }

      return {
        added: changeRows.filter((r) => r.changeType === "added").map((r) => r.ruleNumber),
        modifiedPrev: Object.fromEntries(
          changeRows
            .filter((r) => r.changeType === "modified")
            .map((r) => [r.ruleNumber, prevByNumber.get(r.ruleNumber) ?? ""]),
        ),
        removed: changeRows
          .filter((r) => r.changeType === "removed")
          .map((r) => ({ ...r, content: prevByNumber.get(r.ruleNumber) ?? "" })),
      };
    },

    listVersions(kind?: RuleKind) {
      let query = db.selectFrom("ruleVersions").selectAll();
      if (kind) {
        query = query.where("kind", "=", kind);
      }
      return query.orderBy("version", "asc").execute();
    },

    createVersion(values: { kind: RuleKind; version: string; comments?: string | null }) {
      return db
        .insertInto("ruleVersions")
        .values({
          kind: values.kind,
          version: values.version,
          comments: values.comments ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    async insertRules(
      rules: {
        kind: RuleKind;
        version: string;
        ruleNumber: string;
        sortOrder: number;
        depth: number;
        ruleType: RuleType;
        content: string;
        changeType: RuleChangeType;
      }[],
    ) {
      if (rules.length === 0) {
        return 0;
      }
      let inserted = 0;
      for (const batch of rowBatches(rules)) {
        const result = await db.insertInto("rules").values(batch).execute();
        inserted += result.reduce((sum, row) => sum + Number(row.numInsertedOrUpdatedRows ?? 0), 0);
      }
      return inserted;
    },

    getVersion(kind: RuleKind, version: string) {
      return db
        .selectFrom("ruleVersions")
        .selectAll()
        .where("kind", "=", kind)
        .where("version", "=", version)
        .executeTakeFirst();
    },

    updateComments(kind: RuleKind, version: string, comments: string | null) {
      return db
        .updateTable("ruleVersions")
        .set({ comments })
        .where("kind", "=", kind)
        .where("version", "=", version)
        .returningAll()
        .executeTakeFirst();
    },

    deleteVersion(kind: RuleKind, version: string) {
      return db
        .deleteFrom("ruleVersions")
        .where("kind", "=", kind)
        .where("version", "=", version)
        .execute();
    },
  };
}
