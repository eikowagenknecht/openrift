import { normalizeNameForIdentity } from "@openrift/shared/utils";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";

const ctx = createDbContext("a0000000-0193-4000-a000-000000000002");

// `normalizeNameForIdentity` is implemented twice: in TypeScript, and in SQL by
// the norm_name trigger functions. The two must stay in sync.
describe.skipIf(!ctx)("norm_name TS/SQL parity (integration, migration 214)", () => {
  const { db } = ctx!;

  const CASES = [
    "Kai'Sa, Survivor",
    "Kai’Sa, Survivor",
    "KaiSa Survivor",
    "Mega-Mech",
    "Dr. Mundo, Expert",
    "Unit-42X",
    "fireball",
    "影流之主",
    "祖安狂人",
    "德玛西亚之力",
    "ゼド、影の主",
    "한글 카드",
    "Владыка Теней",
    "Άρχοντας",
    "黯荧岛Dark Glow",
    "Autel d'unité",
    "Fußkämpfer",
    "İstanbul",
    // Number categories: PostgreSQL's [[:alnum:]] keeps Nd and Nl but drops No.
    "٣٤٥ arabic",
    "Ⅻ roman",
    "½ half",
    "¾ x ² y ① z ⅓",
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
      const expected = normalizeNameForIdentity(row.name);
      expect({ name: row.name, key: row.card }).toEqual({ name: row.name, key: expected });
      expect({ name: row.name, key: row.candidate }).toEqual({ name: row.name, key: expected });
      expect({ name: row.name, key: row.product }).toEqual({ name: row.name, key: expected });
    }
  });

  it("matches the TS key on every name already in the database", async () => {
    const rows = await sql<{ name: string; key: string }>`
      SELECT name, norm_name AS key FROM cards
      UNION ALL SELECT name, norm_name FROM candidate_cards
      UNION ALL SELECT product_name, norm_name FROM marketplace_products
    `.execute(db);

    const mismatches = rows.rows
      .filter((r) => r.key !== normalizeNameForIdentity(r.name))
      .map((r) => ({ name: r.name, db: r.key, ts: normalizeNameForIdentity(r.name) }));

    expect(mismatches).toEqual([]);
  });

  it("gives distinct non-Latin names distinct keys through the real trigger", async () => {
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
        expect(row.normName).toBe(normalizeNameForIdentity(row.name));
        expect(row.normName).not.toBe("");
      }
    } finally {
      await db.deleteFrom("cards").where("slug", "in", slugs).execute();
    }
  });
});
