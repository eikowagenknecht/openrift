import { normalizeNameForMatching } from "@openrift/shared/utils";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";

const ctx = createDbContext("a0000000-0193-4000-a000-000000000002");

/**
 * `normalizeNameForMatching` is implemented twice: once in TypeScript and once
 * in SQL, by the `cards_set_norm_name()`, `candidate_cards_set_norm_name()`
 * and `marketplace_product_compute_norm_name()` trigger functions (migration
 * 214). Keys computed by the application and keys computed by the database are
 * compared directly — accepted-card resolution in `ingest-candidates.ts` looks
 * a candidate up by a TS-computed key against a DB-computed column — so any
 * drift between the two silently breaks matching rather than failing loudly.
 *
 * This test is that guard. If someone changes one side without the other, it
 * fails here instead of in production six weeks later.
 */
describe.skipIf(!ctx)("norm_name TS/SQL parity (integration, migration 214)", () => {
  const { db } = ctx!;

  const CASES = [
    // Latin — the existing matching contract across ~17 candidate providers.
    "Kai'Sa, Survivor",
    "Kai’Sa, Survivor",
    "KaiSa Survivor",
    "Mega-Mech",
    "Dr. Mundo, Expert",
    "Unit-42X",
    "fireball",
    // Non-Latin scripts — each of these normalized to "" before migration 214.
    "影流之主",
    "祖安狂人",
    "德玛西亚之力",
    "ゼド、影の主",
    "한글 카드",
    "Владыка Теней",
    "Άρχοντας",
    // Mixed script and accents.
    "黯荧岛Dark Glow",
    "Autel d'unité",
    "Fußkämpfer",
    "İstanbul",
    // Number categories: PostgreSQL's [[:alnum:]] keeps Nd and Nl but drops No.
    "٣٤٥ arabic",
    "Ⅻ roman",
    "½ half",
    "¾ x ² y ① z ⅓",
    // Degenerate — no letters or digits at all.
    "!@#$%^&*()",
    "★☆",
    "🎴emoji🎴",
    "",
  ];

  it("computes the same key in SQL as in TypeScript", async () => {
    const rows = await Promise.all(
      CASES.map(async (name) => {
        const result = await sql<{
          card: string;
          candidate: string;
          product: string;
        }>`
          SELECT
            regexp_replace(lower(${name}::text), '[^[:alnum:]]', '', 'g') AS card,
            regexp_replace(lower(${name}::text), '[^[:alnum:]]', '', 'g') AS candidate,
            marketplace_product_compute_norm_name(${name}::text) AS product
        `.execute(db);
        return { name, ...result.rows[0] };
      }),
    );

    for (const row of rows) {
      const expected = normalizeNameForMatching(row.name);
      expect({ name: row.name, key: row.card }).toEqual({ name: row.name, key: expected });
      expect({ name: row.name, key: row.candidate }).toEqual({ name: row.name, key: expected });
      expect({ name: row.name, key: row.product }).toEqual({ name: row.name, key: expected });
    }
  });

  it("matches the TS key on every name already in the database", async () => {
    // The corpus that actually matters — real provider names, not just the
    // cases someone thought to write down.
    const rows = await sql<{ name: string; key: string }>`
      SELECT name, norm_name AS key FROM cards
      UNION ALL SELECT name, norm_name FROM candidate_cards
      UNION ALL SELECT product_name, norm_name FROM marketplace_products
    `.execute(db);

    const mismatches = rows.rows
      .filter((r) => r.key !== normalizeNameForMatching(r.name))
      .map((r) => ({ name: r.name, db: r.key, ts: normalizeNameForMatching(r.name) }));

    expect(mismatches).toEqual([]);
  });

  it("gives distinct non-Latin names distinct keys through the real trigger", async () => {
    // End-to-end through the BEFORE INSERT trigger: the exact shape of the bug
    // report, where seven CJK-named legends collapsed onto one empty key.
    const names = ["影流之主", "祖安狂人", "德玛西亚之力", "Владыка Теней"];
    const slugs = names.map((_, i) => `TRG214-${i}`);

    try {
      for (const [i, name] of names.entries()) {
        await db
          .insertInto("cards")
          .values({
            slug: slugs[i],
            name,
            type: "unit",
            might: null,
            energy: null,
            power: null,
            mightBonus: null,
            keywords: [],
            tags: [],
          })
          .execute();
      }

      const inserted = await db
        .selectFrom("cards")
        .select(["name", "normName"])
        .where("slug", "in", slugs)
        .execute();

      expect(inserted).toHaveLength(names.length);
      expect(new Set(inserted.map((r) => r.normName)).size).toBe(names.length);
      for (const row of inserted) {
        expect(row.normName).toBe(normalizeNameForMatching(row.name));
        expect(row.normName).not.toBe("");
      }
    } finally {
      await db.deleteFrom("cards").where("slug", "in", slugs).execute();
    }
  });
});
