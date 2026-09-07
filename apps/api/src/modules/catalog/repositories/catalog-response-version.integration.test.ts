import type { Transaction } from "kysely";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import type { Database } from "../../../db/types.js";
import { createDbContext } from "../../../test/integration-context.js";
import { catalogRepo } from "./catalog.js";

const ctx = createDbContext("a0000000-0042-4000-a000-000000000001");

/**
 * `catalogResponseVersion` is the ETag of `GET /catalog`, cached `immutable, max-age=1y`.
 * Nothing in the type system ties it to `assembleCatalogResponse`'s source tables: a field
 * sourced from a new table must be added to both the token and this suite.
 *
 * Each case mutates and re-reads the token inside one rolled-back transaction: the
 * integration database is shared across files and never reset.
 */
class RollbackError extends Error {
  override name = "RollbackError";
}

describe.skipIf(!ctx)("catalogResponseVersion (integration)", () => {
  const { db } = ctx!;

  async function inRolledBackTx<T>(fn: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
    let result!: T;
    try {
      await db.transaction().execute(async (trx: Transaction<Database>) => {
        result = await fn(trx);
        throw new RollbackError();
      });
    } catch (error) {
      if (!(error instanceof RollbackError)) {
        throw error;
      }
    }
    return result;
  }

  function tokenAround(statements: string[]): Promise<{ before: string; after: string }> {
    return inRolledBackTx(async (trx) => {
      const repo = catalogRepo(trx);
      const before = await repo.catalogResponseVersion();
      for (const statement of statements) {
        await sql.raw(statement).execute(trx);
      }
      return { before, after: await repo.catalogResponseVersion() };
    });
  }

  /** Rows affected by `statements`, so a vacuous no-op can't pass silently. */
  function affectedRows(statements: string[]): Promise<number> {
    return inRolledBackTx(async (trx) => {
      let total = 0;
      for (const statement of statements) {
        const result = await sql.raw(statement).execute(trx);
        total += Number(result.numAffectedRows ?? 0);
      }
      return total;
    });
  }

  // An in-place edit the token must notice. These tables carry a timestamp, so
  // bumping it on one row stands in for any field edit.
  const touch = (table: string, column = "updated_at") =>
    `UPDATE ${table} SET ${column} = now() + interval '1 second'
     WHERE ctid = (SELECT ctid FROM ${table} LIMIT 1)`;

  /** A delete, for tables the token covers by count or by content hash. */
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

  // printing_citations is empty in the seed, so the mutation has to create the
  // row — which is also the realistic case: an admin citing a promo's source
  // for the first time must roll the token.
  const ADD_CITATION = [
    `INSERT INTO printing_citations (id, printing_id, label, source_url)
     SELECT 'a0000000-0042-4000-a000-0000000000d1', id, 'Probe citation',
            'https://example.test/probe'
       FROM printings LIMIT 1`,
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
    { table: "printing_citations", why: "printing.citations", statements: ADD_CITATION },
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

  // Both junctions below have no updated_at/timestamp column.
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
      // Must stay 1-for-1, or this stops testing the content hash and tests count(*) instead.
      expect(await affectedRows(swap)).toBe(2);

      const { before, after } = await tokenAround(swap);
      expect(after).not.toBe(before);
    },
  );

  // printing_citations also has no `updated_at`.
  it("rolls when a citation is edited in place", async () => {
    const edit = [
      ...ADD_CITATION,
      `UPDATE printing_citations SET label = 'Probe citation (corrected)'
        WHERE id = 'a0000000-0042-4000-a000-0000000000d1'`,
    ];
    expect(await affectedRows(edit)).toBe(2);

    const { before, after } = await tokenAround(edit);
    expect(after).not.toBe(before);
  });

  it("is stable when nothing changes", async () => {
    const { before, after } = await tokenAround([]);
    expect(after).toBe(before);
  });

  // These two zones are always 25 hours apart, so they never share a calendar date.
  const AHEAD = "Pacific/Kiritimati"; // UTC+14
  const BEHIND = "Pacific/Midway"; // UTC-11

  function tokenInZone(zone: string, read: "response" | "rule"): Promise<string> {
    return inRolledBackTx(async (trx) => {
      await sql.raw(`SET LOCAL TIME ZONE '${zone}'`).execute(trx);
      const repo = catalogRepo(trx);
      return read === "response" ? repo.catalogResponseVersion() : repo.catalogContentVersion();
    });
  }

  it("verifies the two probe zones really are on different dates", async () => {
    const dateIn = (zone: string) =>
      inRolledBackTx(async (trx) => {
        await sql.raw(`SET LOCAL TIME ZONE '${zone}'`).execute(trx);
        const r = await sql<{ d: string }>`SELECT current_date::text AS d`.execute(trx);
        return r.rows[0]?.d ?? "";
      });
    expect(await dateIn(AHEAD)).not.toBe(await dateIn(BEHIND));
  });

  // The response carries no date-derived field — `CatalogSetRow` has no
  // `released` boolean on purpose, clients derive it from the raw dates. So the
  // ETag must not move across midnight, or every client's year-long `immutable`
  // entry is discarded daily for bytes that did not change.
  it("does not fold the calendar date into the response token", async () => {
    expect(await tokenInZone(AHEAD, "response")).toBe(await tokenInZone(BEHIND, "response"));
  });

  // The rule memo does guard a date-derived value (`setReleased`), so its token
  // must still move.
  it("still folds the calendar date into the rule token", async () => {
    expect(await tokenInZone(AHEAD, "rule")).not.toBe(await tokenInZone(BEHIND, "rule"));
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
