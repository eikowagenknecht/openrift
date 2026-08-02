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

import type { Database } from "../db/index.js";
import { AppError } from "../errors.js";
import { createMockDb } from "../test/mock-db.js";
import {
  buildKeysetCursor,
  imageId,
  imageUrlWithOriginal,
  keysetCursorPredicate,
  resolveCardId,
  selectCopyWithCard,
} from "./query-helpers.js";

/** Compiles SQL without a database, through the same CamelCasePlugin production uses. */
const compileDb = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
  plugins: [new CamelCasePlugin()],
});

/** @returns The compiled `where` clause of a copies query using `predicate`. */
function compileWhere(predicate: Expression<SqlBool>) {
  const compiled = compileDb.selectFrom("copies as cp").select("cp.id").where(predicate).compile();
  return {
    where: compiled.sql.slice(compiled.sql.indexOf(" where ") + " where ".length),
    parameters: compiled.parameters,
  };
}

describe("resolveCardId", () => {
  it("returns a raw builder expression", () => {
    const result = resolveCardId("cs");
    expect(result).toBeDefined();
  });
});

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

describe("selectCopyWithCard", () => {
  it("returns a query builder with joins", () => {
    const db = createMockDb();
    const builder = selectCopyWithCard(db);
    expect(builder).toBeDefined();
  });
});

describe("buildKeysetCursor", () => {
  it("encodes createdAt and id into a single string", () => {
    expect(buildKeysetCursor(new Date("2026-01-15T12:30:00.000Z"), "abc-123")).toBe(
      "2026-01-15T12:30:00.000Z_abc-123",
    );
  });
});

describe("keysetCursorPredicate", () => {
  const TIME = new Date("2026-01-15T12:30:00.000Z");
  const OPTIONS = { timeColumn: "cp.createdAt", idColumn: "cp.id" } as const;

  it("breaks ties ascending on the id column", () => {
    const { where, parameters } = compileWhere(
      keysetCursorPredicate(buildKeysetCursor(TIME, "cp-9"), { ...OPTIONS, idDirection: "asc" }),
    );
    expect(where).toBe(
      `(date_trunc('milliseconds', "cp"."created_at") < $1 or ` +
        `(date_trunc('milliseconds', "cp"."created_at") = $2 and "cp"."id" > $3))`,
    );
    expect(parameters).toEqual([TIME, TIME, "cp-9"]);
  });

  it("breaks ties descending on the id column", () => {
    const { where, parameters } = compileWhere(
      keysetCursorPredicate(buildKeysetCursor(TIME, "cp-9"), { ...OPTIONS, idDirection: "desc" }),
    );
    expect(where).toBe(
      `(date_trunc('milliseconds', "cp"."created_at") < $1 or ` +
        `(date_trunc('milliseconds', "cp"."created_at") = $2 and "cp"."id" < $3))`,
    );
    expect(parameters).toEqual([TIME, TIME, "cp-9"]);
  });

  // A cursor minted before the id suffix shipped is still in flight during a
  // deploy: it must degrade to the timestamp-only comparison, not throw.
  it("compares on time alone for a legacy timestamp-only cursor", () => {
    const { where, parameters } = compileWhere(
      keysetCursorPredicate(TIME.toISOString(), { ...OPTIONS, idDirection: "asc" }),
    );
    expect(where).toBe(`date_trunc('milliseconds', "cp"."created_at") < $1`);
    expect(parameters).toEqual([TIME]);
  });

  it("keeps the id when it contains the separator", () => {
    const { parameters } = compileWhere(
      keysetCursorPredicate(`${TIME.toISOString()}_a_b`, { ...OPTIONS, idDirection: "asc" }),
    );
    expect(parameters).toEqual([TIME, TIME, "a_b"]);
  });

  // Regression (fixed once per repo before this helper existed): an unparseable
  // cursor used to reach the query as an Invalid Date and surface as a 500.
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
