import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordingDb, onlyStatement } from "../test/recording-db.js";
import { slugTaxonomyRepo } from "./slug-taxonomy.js";

const captured = createRecordingDb();
const { db } = captured;

const isInUse = vi.fn(() => Promise.resolve(undefined));

/** @returns A repo over a color-less taxonomy (finishes). */
const plainRepo = () => slugTaxonomyRepo(db, { table: "finishes", isInUse });
/** @returns A repo over a taxonomy that carries an extra `color` column. */
const coloredRepo = () => slugTaxonomyRepo(db, { table: "rarities", isInUse });

describe("slugTaxonomyRepo", () => {
  beforeEach(() => {
    captured.reset();
    isInUse.mockClear();
  });

  it("lists every row in sort order", async () => {
    const rows = [{ slug: "normal", label: "Normal", sortOrder: 0, isWellKnown: true }];
    captured.setRows(rows);

    expect(await plainRepo().listAll()).toEqual(rows);
    expect(onlyStatement(captured).sql).toBe('select * from "finishes" order by "sort_order"');
  });

  it("looks a row up by slug and resolves undefined when there is none", async () => {
    expect(await plainRepo().getBySlug("missing")).toBeUndefined();

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toBe('select * from "finishes" where "slug" = $1');
    expect(parameters).toEqual(["missing"]);
  });

  it("creates a row at sort order 0 and never marks it well-known", async () => {
    const created = { slug: "etched", label: "Etched", sortOrder: 0, isWellKnown: false };
    captured.setRows([created]);

    expect(await plainRepo().create({ slug: "etched", label: "Etched" })).toEqual(created);

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toBe(
      'insert into "finishes" ("slug", "label", "sort_order", "is_well_known") ' +
        "values ($1, $2, $3, $4) returning *",
    );
    expect(parameters).toEqual(["etched", "Etched", 0, false]);
  });

  it("honors an explicit sort order on create", async () => {
    captured.setRows([{ slug: "etched" }]);

    await plainRepo().create({ slug: "etched", label: "Etched", sortOrder: 7 });

    expect(onlyStatement(captured).parameters).toEqual(["etched", "Etched", 7, false]);
  });

  it("writes the extra color column on taxonomies that have one", async () => {
    captured.setRows([{ slug: "mythic" }]);

    await coloredRepo().create({ slug: "mythic", label: "Mythic", color: "#CB212D" });

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toBe(
      'insert into "rarities" ("color", "slug", "label", "sort_order", "is_well_known") ' +
        "values ($1, $2, $3, $4, $5) returning *",
    );
    expect(parameters).toEqual(["#CB212D", "mythic", "Mythic", 0, false]);
  });

  it("updates only the fields it is given", async () => {
    captured.setRows([{ numUpdatedRows: 1n }]);

    await coloredRepo().update("mythic", { color: null });

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toBe('update "rarities" set "color" = $1 where "slug" = $2');
    expect(parameters).toEqual([null, "mythic"]);
  });

  it("deletes by slug", async () => {
    captured.setRows([{ numDeletedRows: 1n }]);

    await plainRepo().deleteBySlug("etched");

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toBe('delete from "finishes" where "slug" = $1');
    expect(parameters).toEqual(["etched"]);
  });

  it("delegates isInUse to the caller-supplied lookup", async () => {
    await plainRepo().isInUse("normal");

    expect(isInUse).toHaveBeenCalledWith("normal");
    expect(captured.statements).toHaveLength(0);
  });

  it("reorders against its own table with 0-based positions", async () => {
    await coloredRepo().reorder(["rare", "common"]);

    const { sql, parameters } = onlyStatement(captured);
    expect(sql).toContain('update "rarities"');
    expect(sql).toContain('where "rarities"."slug" = d.key');
    expect(parameters).toEqual(["rare", 0, "common", 1]);
  });

  it("skips the reorder statement for an empty slug list", async () => {
    await plainRepo().reorder([]);

    expect(captured.statements).toHaveLength(0);
  });
});
