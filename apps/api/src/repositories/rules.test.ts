import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { rulesRepo } from "./rules.js";

describe("rulesRepo", () => {
  describe("insertRules", () => {
    const rule = {
      kind: "core" as const,
      version: "1.0",
      ruleNumber: "100.1",
      sortOrder: 1,
      depth: 0,
      ruleType: "text" as const,
      content: "A rule.",
      changeType: "added" as const,
    };

    it("returns 0 without touching the database when there is nothing to insert", async () => {
      expect(await rulesRepo(createMockDb([])).insertRules([])).toBe(0);
    });

    it("sums numInsertedOrUpdatedRows rather than counting InsertResults", async () => {
      const db = createMockDb([{ numInsertedOrUpdatedRows: 3n }]);
      expect(await rulesRepo(db).insertRules([rule, rule, rule])).toBe(3);
    });

    it("adds up the counts when the driver reports more than one result", async () => {
      const db = createMockDb([{ numInsertedOrUpdatedRows: 2n }, { numInsertedOrUpdatedRows: 1n }]);
      expect(await rulesRepo(db).insertRules([rule, rule, rule])).toBe(3);
    });

    it("treats a missing numInsertedOrUpdatedRows as zero", async () => {
      const db = createMockDb([{}]);
      expect(await rulesRepo(db).insertRules([rule])).toBe(0);
    });
  });
});
