/* oxlint-disable import/no-nodejs-modules -- reads tables.ts as text to check its declared types */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { createDbContext } from "../test/integration-context.js";

// A `DEFAULT` is a promise the schema makes to the code — omit this and the
// database fills it in. `tables.ts` only keeps that promise when the member is
// `Generated<T>` (or a `ColumnType` with `undefined` in the insert position);
// typed as a plain required field, Kysely demands a value at every call site
// and the default becomes unreachable. Nothing fails loudly when that happens:
// the insert compiles, it just always writes the value the caller guessed,
// which is how `decks.is_public` sat next to three already-`Generated` siblings
// and how `marketplace_products.norm_name` never got a member at all.
//
// TypeScript types are gone at runtime, so the check reads `tables.ts` as text.
// The file is consistently formatted (two-space members, one per line, tables
// registered in the `Database` interface), which is what makes that reliable —
// and the parser asserts its own coverage below, so a reformat that defeats it
// fails the suite rather than silently passing everything.

const ctx = createDbContext("column-defaults");

/** Kysely's own bookkeeping tables, which `tables.ts` deliberately never types. */
const UNTYPED_TABLES = new Set(["kysely_migration", "kysely_migration_lock"]);

const TABLES_SRC = readFileSync(resolve(import.meta.dirname!, "tables.ts"), "utf-8");

const toSnakeCase = (name: string): string =>
  name.replaceAll(/[A-Z]/gu, (char) => `_${char.toLowerCase()}`);

function splitTypeArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of args) {
    if (char === "<" || char === "[" || char === "(") {
      depth++;
    } else if (char === ">" || char === "]" || char === ")") {
      depth--;
    }
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/** `CreatedAt` / `UpdatedAt` are the file's local aliases for insert-optional columns. */
function isInsertOptional(type: string): boolean {
  if (type === "CreatedAt" || type === "UpdatedAt" || type.startsWith("Generated<")) {
    return true;
  }
  if (!type.startsWith("ColumnType<")) {
    return false;
  }
  const args = splitTypeArgs(type.slice("ColumnType<".length, type.lastIndexOf(">")));
  return args.length >= 2 && /\bundefined\b/u.test(args[1]!);
}

function parseTableMembers(): Map<string, Map<string, string>> {
  const interfaces = new Map<string, Map<string, string>>();
  const aliases = new Map<string, string>();
  const lines = TABLES_SRC.split("\n");

  let currentName: string | null = null;
  let members: Map<string, string> | null = null;
  let pending = "";

  for (const line of lines) {
    if (currentName === null) {
      const declaration = /^(?:export )?interface (?<name>\w+)(?: extends (?<base>\w+))? \{$/u.exec(
        line,
      );
      if (declaration?.groups) {
        currentName = declaration.groups.name!;
        members = new Map(interfaces.get(declaration.groups.base ?? ""));
        continue;
      }
      const alias = /^(?:export )?type (?<name>\w+Table) = (?<base>\w+);$/u.exec(line);
      if (alias?.groups) {
        aliases.set(alias.groups.name!, alias.groups.base!);
      }
      continue;
    }
    if (line === "}") {
      interfaces.set(currentName, members!);
      currentName = null;
      pending = "";
      continue;
    }
    // Members may wrap across lines when the type is long; accumulate until the
    // declaration terminates, and ignore comment and blank lines in between.
    const body = line.trim();
    if (body === "" || body.startsWith("*") || body.startsWith("/*") || body.startsWith("//")) {
      continue;
    }
    pending = pending === "" ? body : `${pending} ${body}`;
    if (!pending.endsWith(";")) {
      continue;
    }
    const member = /^(?<name>\w+)\??: (?<type>.+);$/u.exec(pending);
    pending = "";
    if (member?.groups) {
      members!.set(toSnakeCase(member.groups.name!), member.groups.type!.replaceAll(/\s+/gu, ""));
    }
  }

  for (const [alias, base] of aliases) {
    if (!interfaces.has(alias) && interfaces.has(base)) {
      interfaces.set(alias, interfaces.get(base)!);
    }
  }

  const registry = /export interface Database \{\n(?<body>[\s\S]*?)\n\}/u.exec(TABLES_SRC);
  const byTable = new Map<string, Map<string, string>>();
  for (const entry of registry!.groups!.body.matchAll(/^ {2}(?<key>\w+): (?<iface>\w+);$/gmu)) {
    const resolved = interfaces.get(entry.groups!.iface!);
    if (resolved) {
      byTable.set(toSnakeCase(entry.groups!.key!), resolved);
    }
  }
  return byTable;
}

interface ColumnRow {
  tableName: string;
  columnName: string;
}

describe.skipIf(!ctx)("columns with a database default", () => {
  const db = ctx!.db;
  const tableMembers = parseTableMembers();

  async function defaultedColumns(): Promise<ColumnRow[]> {
    // `column_default` covers plain DEFAULTs; `is_identity` covers the identity
    // columns, which have no default expression but behave the same way on
    // insert. Views and materialized views are out of scope — nothing inserts
    // into them.
    const rows = await sql<ColumnRow>`
      SELECT c.table_name AS "tableName", c.column_name AS "columnName"
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
       AND t.table_type = 'BASE TABLE'
      WHERE c.table_schema = 'public'
        AND (c.column_default IS NOT NULL OR c.is_identity = 'YES')
      ORDER BY 1, 2
    `.execute(db);
    return rows.rows.filter((row) => !UNTYPED_TABLES.has(row.tableName));
  }

  it("parses a member list for every table the database defines", async () => {
    // Guards the text parse itself: if a reformat of `tables.ts` breaks it, the
    // real check below would pass vacuously, so fail here instead.
    const rows = await defaultedColumns();
    expect(rows.length).toBeGreaterThan(100);

    const unresolved = [...new Set(rows.map((row) => row.tableName))].filter(
      (name) => !tableMembers.has(name),
    );
    expect(unresolved).toEqual([]);
  });

  it("types every defaulted column as insert-optional in tables.ts", async () => {
    const offenders: string[] = [];
    for (const { tableName, columnName } of await defaultedColumns()) {
      const type = tableMembers.get(tableName)?.get(columnName);
      if (type === undefined) {
        offenders.push(`${tableName}.${columnName} (no member in tables.ts)`);
      } else if (!isInsertOptional(type)) {
        offenders.push(`${tableName}.${columnName}: ${type}`);
      }
    }

    // Wrap it in `Generated<>`, or in a `ColumnType<T, T | undefined, T>` when
    // the surrounding table already prefers that spelling.
    expect(offenders).toEqual([]);
  });

  it("recognises the shapes that make a column insert-optional", () => {
    // Pins the classifier the check above leans on, so a false "all clear"
    // cannot come from `isInsertOptional` quietly answering true for everything.
    expect(isInsertOptional("Generated<boolean>")).toBe(true);
    expect(isInsertOptional("CreatedAt")).toBe(true);
    expect(isInsertOptional("ColumnType<CopyLink[],CopyLink[]|undefined,CopyLink[]>")).toBe(true);
    expect(isInsertOptional("boolean")).toBe(false);
    expect(isInsertOptional("string|undefined")).toBe(false);
    expect(isInsertOptional("ColumnType<string,string,string>")).toBe(false);
    // A `Date | null` column is optional only because NULL is a legal value —
    // the insert position, not the select position, is what decides.
    expect(isInsertOptional("ColumnType<Date|null,Date|null,Date|null>")).toBe(false);
  });
});
