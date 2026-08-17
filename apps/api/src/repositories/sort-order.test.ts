import { beforeEach, describe, expect, it } from "vitest";

import { createRecordingDb, onlyStatement } from "../test/recording-db.js";
import { reorderBySortOrder } from "./sort-order.js";

const captured = createRecordingDb();
const { db } = captured;

describe("reorderBySortOrder", () => {
  beforeEach(() => {
    captured.reset();
  });

  it("assigns 0-based positions in the given key order", async () => {
    await reorderBySortOrder(db, {
      table: "finishes",
      keyColumn: "slug",
      keys: ["holofoil", "normal"],
    });

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toBe(
      'update "finishes" set sort_order = d.new_order ' +
        "from (values ($1::text, $2::int), ($3::text, $4::int)) as d(key, new_order) " +
        'where "finishes"."slug" = d.key',
    );
    expect(parameters).toEqual(["holofoil", 0, "normal", 1]);
  });

  it("converts camelCase table and column names to snake_case", async () => {
    await reorderBySortOrder(db, {
      table: "artVariants",
      keyColumn: "slug",
      keys: ["alternate-art"],
    });

    const { sql } = onlyStatement(captured);
    expect(sql).toContain('update "art_variants"');
    expect(sql).toContain('where "art_variants"."slug" = d.key');
  });

  it("casts uuid keys so Postgres can infer the VALUES column type", async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    await reorderBySortOrder(db, {
      table: "markers",
      keyColumn: "id",
      keys: [id],
      keyType: "uuid",
    });

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toContain("(values ($1::uuid, $2::int))");
    expect(sql).toContain('where "markers"."id" = d.key');
    expect(parameters).toEqual([id, 0]);
  });

  it("addresses a non-slug key column", async () => {
    await reorderBySortOrder(db, { table: "languages", keyColumn: "code", keys: ["EN", "KR"] });

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toContain('where "languages"."code" = d.key');
    expect(parameters).toEqual(["EN", 0, "KR", 1]);
  });

  it("issues no statement for an empty key list", async () => {
    await reorderBySortOrder(db, { table: "finishes", keyColumn: "slug", keys: [] });

    expect(captured.statements).toHaveLength(0);
  });
});
