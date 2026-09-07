import type { Expression, SqlBool } from "kysely";
import {
  CamelCasePlugin,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "../db/tables.js";
import { AppError } from "../errors.js";
import { buildKeysetCursor } from "../lib/keyset-cursor.js";
import {
  imageId,
  imageUrlWithOriginal,
  joinFrontImage,
  keysetCursorPredicate,
  requireFrontImage,
  selectCopyWithCard,
} from "./query-helpers.js";

const compileDb = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  plugins: [new CamelCasePlugin()],
});

function compileWhere(predicate: Expression<SqlBool>) {
  const compiled = compileDb.selectFrom("copies as cp").select("cp.id").where(predicate).compile();
  return {
    where: compiled.sql.slice(compiled.sql.indexOf(" where ") + " where ".length),
    parameters: compiled.parameters,
  };
}

describe("imageId", () => {
  it("returns a raw builder expression", () => {
    const result = imageId("pi");
    expect(result).toBeDefined();
  });
});

describe("imageUrlWithOriginal", () => {
  it("returns a raw builder expression", () => {
    const result = imageUrlWithOriginal("pi");
    expect(result).toBeDefined();
  });
});

describe("joinFrontImage", () => {
  it("left-joins the active front image of the p-aliased printing", () => {
    const { sql, parameters } = joinFrontImage(compileDb.selectFrom("printings as p"))
      .select(["p.id", imageId("imgf").as("imageId")])
      .compile();

    expect(sql).toContain(
      'left join "printing_images" as "pi" on "pi"."printing_id" = "p"."id" and "pi"."face" = $1 and "pi"."is_active" = $2',
    );
    expect(sql).toContain(
      'left join "image_files" as "imgf" on "imgf"."id" = "pi"."image_file_id"',
    );
    expect(parameters).toEqual(["front", true]);
  });

  it("keeps rows whose printing has no image (left, not inner)", () => {
    const { sql } = joinFrontImage(compileDb.selectFrom("printings as p")).select("p.id").compile();

    expect(sql).not.toContain("inner join");
  });

  it("resolves p against a view as readily as the base table", () => {
    const { sql } = joinFrontImage(compileDb.selectFrom("printingsOrdered as p"))
      .select("p.id")
      .compile();

    expect(sql).toContain('from "printings_ordered" as "p"');
    expect(sql).toContain('"pi"."printing_id" = "p"."id"');
  });
});

describe("requireFrontImage", () => {
  it("inner-joins the front image off the given printing reference", () => {
    const { sql, parameters } = requireFrontImage(
      compileDb.selectFrom("copies as cp"),
      "cp.printingId",
    )
      .select(["cp.id", "imgf.id as imageId"])
      .compile();

    expect(sql).toContain(
      'inner join "printing_images" as "pim" on "pim"."printing_id" = "cp"."printing_id" and "pim"."face" = $1 and "pim"."is_active" = $2',
    );
    expect(sql).toContain(
      'inner join "image_files" as "imgf" on "imgf"."id" = "pim"."image_file_id"',
    );
    expect(parameters).toEqual(["front", true]);
  });

  it("drops rows whose printing has no image (inner, not left)", () => {
    const { sql } = requireFrontImage(compileDb.selectFrom("copies as cp"), "cp.printingId")
      .select("cp.id")
      .compile();

    expect(sql).not.toContain("left join");
  });
});

describe("selectCopyWithCard", () => {
  it("joins copies through printings and cards to the front image", () => {
    const { sql } = selectCopyWithCard(compileDb)
      .select(["cp.id", "c.name", imageId("imgf").as("imageId")])
      .compile();

    expect(sql).toContain('from "copies" as "cp"');
    expect(sql).toContain('inner join "printings" as "p" on "p"."id" = "cp"."printing_id"');
    expect(sql).toContain('inner join "cards" as "c" on "c"."id" = "p"."card_id"');
    expect(sql).toContain('left join "printing_images" as "pi"');
    expect(sql).toContain('left join "image_files" as "imgf"');
  });
});

describe("keysetCursorPredicate", () => {
  const TIME = new Date("2026-01-15T12:30:00.000Z");
  const BOUND = new Date("2026-01-15T12:30:00.001Z");
  const OPTIONS = { timeColumn: "cp.createdAt", idColumn: "cp.id" } as const;

  it("breaks ties ascending on the id column", () => {
    const { where, parameters } = compileWhere(
      keysetCursorPredicate(buildKeysetCursor(TIME, "cp-9"), { ...OPTIONS, idDirection: "asc" }),
    );
    expect(where).toBe(
      `("cp"."created_at" < $1 and ` +
        `(date_trunc('milliseconds', "cp"."created_at") < $2 or ` +
        `(date_trunc('milliseconds', "cp"."created_at") = $3 and "cp"."id" > $4)))`,
    );
    expect(parameters).toEqual([BOUND, TIME, TIME, "cp-9"]);
  });

  it("breaks ties descending on the id column", () => {
    const { where, parameters } = compileWhere(
      keysetCursorPredicate(buildKeysetCursor(TIME, "cp-9"), { ...OPTIONS, idDirection: "desc" }),
    );
    expect(where).toBe(
      `("cp"."created_at" < $1 and ` +
        `(date_trunc('milliseconds', "cp"."created_at") < $2 or ` +
        `(date_trunc('milliseconds', "cp"."created_at") = $3 and "cp"."id" < $4)))`,
    );
    expect(parameters).toEqual([BOUND, TIME, TIME, "cp-9"]);
  });

  // date_trunc is STABLE: the truncated comparison alone is unsargable, so
  // the bare-column bound must be present in both branches.
  it("adds a bare-column upper bound an index can seek on", () => {
    const withId = compileWhere(
      keysetCursorPredicate(buildKeysetCursor(TIME, "cp-9"), { ...OPTIONS, idDirection: "asc" }),
    );
    const legacy = compileWhere(
      keysetCursorPredicate(TIME.toISOString(), { ...OPTIONS, idDirection: "asc" }),
    );
    for (const compiled of [withId, legacy]) {
      expect(compiled.where).toContain(`"cp"."created_at" < $1`);
      expect(compiled.parameters[0]).toEqual(BOUND);
    }
  });

  // A row one microsecond past the cursor still truncates back onto it, so
  // one millisecond above is the exact width that keeps it a tie.
  it("keeps the bound one millisecond above the cursor so ties survive", () => {
    const { parameters } = compileWhere(
      keysetCursorPredicate(buildKeysetCursor(TIME, "cp-9"), { ...OPTIONS, idDirection: "asc" }),
    );
    expect(parameters[0]).toEqual(new Date(TIME.getTime() + 1));
  });

  // A cursor minted before the id suffix shipped is still in flight during a
  // deploy: it must degrade to the timestamp-only comparison, not throw.
  it("compares on time alone for a legacy timestamp-only cursor", () => {
    const { where, parameters } = compileWhere(
      keysetCursorPredicate(TIME.toISOString(), { ...OPTIONS, idDirection: "asc" }),
    );
    expect(where).toBe(
      `("cp"."created_at" < $1 and date_trunc('milliseconds', "cp"."created_at") < $2)`,
    );
    expect(parameters).toEqual([BOUND, TIME]);
  });

  it("keeps the id when it contains the separator", () => {
    const { parameters } = compileWhere(
      keysetCursorPredicate(`${TIME.toISOString()}_a_b`, { ...OPTIONS, idDirection: "asc" }),
    );
    expect(parameters).toEqual([BOUND, TIME, TIME, "a_b"]);
  });

  it("rejects an unparseable cursor with a 400", () => {
    const parse = () => keysetCursorPredicate("not-a-date", { ...OPTIONS, idDirection: "asc" });
    expect(parse).toThrow(AppError);
    expect(parse).toThrow(/Invalid cursor/u);
    try {
      parse();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as AppError).status).toBe(400);
    }
  });
});
