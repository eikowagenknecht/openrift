import type { Transaction } from "kysely";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "../db/types.js";
import { createDbContext } from "../test/integration-context.js";
import { catalogRepo } from "./catalog.js";

const ctx = createDbContext("a0000000-0042-4000-a000-000000000001");

/**
 * `catalogResponseVersion` is the ETag of `GET /catalog`, and a request whose
 * `?v=` matches it is answered `Cache-Control: immutable, max-age=1y` (see
 * `orpc/cache-policy.ts`). So a change to the catalog response that does NOT
 * roll this token pins every client holding that URL to stale data — bounded
 * only by the token's `current_date` term, i.e. up to a day.
 *
 * The token is assembled by hand from aggregates over the tables
 * `assembleCatalogResponse` reads, and nothing in the type system ties the two
 * together. These tests are that tie: every source table is mutated and the
 * token must move. If you add a field to `CatalogResponse` sourced from a new
 * table, add it to the token AND to the list here.
 *
 * Each case takes the token, mutates, and takes it again inside ONE
 * transaction that is then rolled back — the integration database is shared
 * across files and never reset, so nothing may escape, and reading both tokens
 * in the same transaction keeps the comparison free of outside interference.
 */
class RollbackError extends Error {
  override name = "RollbackError";
}

describe.skipIf(!ctx)("catalogResponseVersion (integration)", () => {
  const { db } = ctx!;

  /**
   * Token before and after `statements`, both read inside a rolled-back tx.
   * @returns The token as it was and as it became.
   */
  async function tokenAround(statements: string[]): Promise<{ before: string; after: string }> {
    let result = { before: "", after: "" };
    try {
      await db.transaction().execute(async (trx: Transaction<Database>) => {
        const repo = catalogRepo(trx);
        const before = await repo.catalogResponseVersion();
        for (const statement of statements) {
          await sql.raw(statement).execute(trx);
        }
        result = { before, after: await repo.catalogResponseVersion() };
        throw new RollbackError();
      });
    } catch (error) {
      if (!(error instanceof RollbackError)) {
        throw error;
      }
    }
    return result;
  }

  /**
   * Rows affected by `statements`, so a vacuous no-op can't pass silently.
   * @returns The total row count the statements touched.
   */
  async function affectedRows(statements: string[]): Promise<number> {
    let total = 0;
    try {
      await db.transaction().execute(async (trx: Transaction<Database>) => {
        for (const statement of statements) {
          const result = await sql.raw(statement).execute(trx);
          total += Number(result.numAffectedRows ?? 0);
        }
        throw new RollbackError();
      });
    } catch (error) {
      if (!(error instanceof RollbackError)) {
        throw error;
      }
    }
    return total;
  }

  // An in-place edit the token must notice. These tables carry a timestamp, so
  // bumping it on one row stands in for any field edit.
  const touch = (table: string, column = "updated_at") =>
    `UPDATE ${table} SET ${column} = now() + interval '1 second'
     WHERE ctid = (SELECT ctid FROM ${table} LIMIT 1)`;

  /**
   * A delete, for tables the token covers by count or by content hash.
   * @returns The statement.
   */
  const dropOne = (table: string) =>
    `DELETE FROM ${table} WHERE ctid = (SELECT ctid FROM ${table} LIMIT 1)`;

  // custom_tags / card_custom_tags are absent from the seed, so the mutation
  // that exercises them has to create the rows. That is also the realistic
  // case: an admin introducing a tag must roll the token.
  const ADD_CUSTOM_TAG = [
    `INSERT INTO custom_tag_categories (id, slug, label)
     VALUES ('a0000000-0042-4000-a000-0000000000c1', 'probe-cat', 'Probe Category')`,
    `INSERT INTO custom_tags (id, slug, label, category_id)
     VALUES ('a0000000-0042-4000-a000-0000000000c2', 'probe-tag', 'Probe Tag',
             'a0000000-0042-4000-a000-0000000000c1')`,
  ];

  const CASES: { table: string; why: string; statements: string[] }[] = [
    { table: "cards", why: "cards map", statements: [touch("cards")] },
    { table: "printings", why: "printings map", statements: [touch("printings")] },
    { table: "sets", why: "sets array", statements: [touch("sets")] },
    {
      table: "set_releases",
      why: "per-language release dates",
      statements: [touch("set_releases")],
    },
    { table: "markers", why: "printing.markers", statements: [touch("markers")] },
    {
      table: "distribution_channels",
      why: "printing.distributionChannels",
      statements: [touch("distribution_channels")],
    },
    { table: "printing_images", why: "printing.images", statements: [touch("printing_images")] },
    { table: "card_bans", why: "card.bans", statements: [touch("card_bans", "created_at")] },
    { table: "card_errata", why: "card.errata", statements: [touch("card_errata", "created_at")] },
    { table: "copies", why: "totalCopies", statements: [dropOne("copies")] },
    { table: "card_domains", why: "card.domains", statements: [dropOne("card_domains")] },
    {
      table: "card_super_types",
      why: "card.superTypes",
      statements: [dropOne("card_super_types")],
    },
    { table: "custom_tags", why: "customTagAssignments", statements: ADD_CUSTOM_TAG },
    {
      table: "card_custom_tags",
      why: "customTagAssignments",
      statements: [
        ...ADD_CUSTOM_TAG,
        `INSERT INTO card_custom_tags (card_id, custom_tag_id)
         SELECT id, 'a0000000-0042-4000-a000-0000000000c2' FROM cards LIMIT 1`,
      ],
    },
  ];

  it.each(CASES)("rolls when $table changes ($why)", async ({ statements }) => {
    // A statement that hits no rows would pass vacuously.
    expect(await affectedRows(statements), "mutation affected no rows").toBeGreaterThan(0);

    const { before, after } = await tokenAround(statements);
    expect(after).not.toBe(before);
  });

  // The two junctions that motivated content-hashing rather than counting:
  // both are timestamp-less, so a swap that preserves cardinality is invisible
  // to `count(*)` while changing what the affected printings report.
  const SWAPS: { table: string; other: string; column: string }[] = [
    { table: "printing_markers", other: "markers", column: "marker_id" },
    {
      table: "printing_distribution_channels",
      other: "distribution_channels",
      column: "channel_id",
    },
  ];

  it.each(SWAPS)(
    "rolls when $table swaps a link without changing its row count",
    async ({ table, other, column }) => {
      const swap = [
        dropOne(table),
        `INSERT INTO ${table} (printing_id, ${column})
         SELECT p.id, o.id FROM printings p CROSS JOIN ${other} o
         WHERE NOT EXISTS (
           SELECT 1 FROM ${table} x WHERE x.printing_id = p.id AND x.${column} = o.id
         )
         LIMIT 1`,
      ];
      // One row out, one row in — or this stops testing the content hash and
      // starts testing count(*).
      expect(await affectedRows(swap)).toBe(2);

      const { before, after } = await tokenAround(swap);
      expect(after).not.toBe(before);
    },
  );

  it("is stable when nothing changes", async () => {
    const { before, after } = await tokenAround([]);
    expect(after).toBe(before);
  });

  // The counterweight to every assertion above: a token that rolled on any
  // write would satisfy them while destroying the edge cache hit rate. Prices
  // are refreshed daily and are deliberately NOT part of the catalog response.
  it("does not roll for a price refresh", async () => {
    const refresh = [
      `UPDATE marketplace_product_prices SET market_cents = coalesce(market_cents, 0) + 1
       WHERE ctid = (SELECT ctid FROM marketplace_product_prices LIMIT 1)`,
    ];
    expect(await affectedRows(refresh)).toBeGreaterThan(0);

    const { before, after } = await tokenAround(refresh);
    expect(after).toBe(before);
  });
});
