import { describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";
import { keywordsRepo } from "./keywords.js";

const ctx = createDbContext("a0000000-0043-4000-a000-000000000001");

describe.skipIf(!ctx)("keywordsRepo (integration)", () => {
  const { db } = ctx!;
  const repo = keywordsRepo(db);

  it("listAll returns keywords ordered by name", async () => {
    const styles = await repo.listAll();
    expect(Array.isArray(styles)).toBe(true);
    if (styles.length > 1) {
      const names = styles.map((s) => s.name);
      expect(names).toEqual([...names].sort());
    }
  });

  it("listCostKeywords returns only keywords flagged as cost keywords", async () => {
    await repo.upsertStyle({
      name: "KW-CostFlag",
      color: "#123456",
      darkText: false,
      costKeyword: true,
    });
    await repo.upsertStyle({
      name: "KW-PlainFlag",
      color: "#123456",
      darkText: false,
      costKeyword: false,
    });
    try {
      const costKeywords = await repo.listCostKeywords();
      expect(costKeywords).toContain("KW-CostFlag");
      expect(costKeywords).not.toContain("KW-PlainFlag");

      // Flipping the flag off via upsert removes it from the list.
      await repo.upsertStyle({
        name: "KW-CostFlag",
        color: "#123456",
        darkText: false,
        costKeyword: false,
      });
      expect(await repo.listCostKeywords()).not.toContain("KW-CostFlag");
    } finally {
      await repo.deleteStyle("KW-CostFlag");
      await repo.deleteStyle("KW-PlainFlag");
    }
  });

  it("keyword style mutations leave cards.keywords alone", async () => {
    // The review asked whether create/delete on the `keywords` table needs a
    // recompute hook. It does not, and this pins the reason: `cards.keywords`
    // is derived from the `[...]` spans in card text, never from this table, so
    // a style row appearing or disappearing cannot make the cache wrong. If a
    // future change makes the extractor consult `keywords`, this test breaks
    // and a hook becomes genuinely required.
    const before = await db.selectFrom("cards").select(["id", "keywords"]).orderBy("id").execute();

    await repo.createStyle({
      name: "KW-CacheProbe",
      color: "#abcdef",
      darkText: true,
      costKeyword: false,
    });
    try {
      const during = await db
        .selectFrom("cards")
        .select(["id", "keywords"])
        .orderBy("id")
        .execute();
      expect(during).toEqual(before);
    } finally {
      await repo.deleteStyle("KW-CacheProbe");
    }

    const after = await db.selectFrom("cards").select(["id", "keywords"]).orderBy("id").execute();
    expect(after).toEqual(before);
  });

  it("getTranslationCandidates pairs each EN printing with its non-EN siblings", async () => {
    const rows = await repo.getTranslationCandidates();
    for (const row of rows) {
      expect(row.otherLanguage).not.toBe("EN");
      expect(row.enRulesText ?? row.enEffectText).not.toBeNull();
      expect(row.otherRulesText ?? row.otherEffectText).not.toBeNull();
    }
  });
});
