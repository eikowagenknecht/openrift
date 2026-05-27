import type { Kysely } from "kysely";
import { sql } from "kysely";

// Adds per-list defaults and per-entry overrides for trade preferences:
//   - lists: default_price_pref, default_price_absolute_cents,
//            default_trade_type, currency
//   - list_entries: price_pref, price_absolute_cents, trade_type
//
// All new columns are nullable; NULL on an entry means "inherit list default",
// NULL on a list means "no default". Preference columns are only valid on
// lists with intent IN ('wish','trade') — organize lists must keep them NULL.
// See ADR-017.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("lists")
    .addColumn("default_price_pref", "text")
    .addColumn("default_price_absolute_cents", "integer")
    .addColumn("default_trade_type", "text")
    .addColumn("currency", "text")
    .execute();

  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_default_price_pref",
      sql`default_price_pref IS NULL OR default_price_pref IN ('cm_lowest','tcg_lowest','ct_zero','absolute')`,
    )
    .execute();

  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_default_trade_type",
      sql`default_trade_type IS NULL OR default_trade_type IN ('cards','money','both')`,
    )
    .execute();

  await db.schema
    .alterTable("lists")
    .addCheckConstraint("chk_lists_currency", sql`currency IS NULL OR currency IN ('EUR','USD')`)
    .execute();

  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_default_absolute_shape",
      sql`(default_price_pref = 'absolute') = (default_price_absolute_cents IS NOT NULL)`,
    )
    .execute();

  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_default_absolute_positive",
      sql`default_price_absolute_cents IS NULL OR default_price_absolute_cents > 0`,
    )
    .execute();

  await db.schema
    .alterTable("lists")
    .addCheckConstraint(
      "chk_lists_prefs_only_on_trade_intents",
      sql`
        intent IN ('wish','trade') OR (
          default_price_pref IS NULL AND
          default_price_absolute_cents IS NULL AND
          default_trade_type IS NULL AND
          currency IS NULL
        )
      `,
    )
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addColumn("price_pref", "text")
    .addColumn("price_absolute_cents", "integer")
    .addColumn("trade_type", "text")
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addCheckConstraint(
      "chk_list_entries_price_pref",
      sql`price_pref IS NULL OR price_pref IN ('cm_lowest','tcg_lowest','ct_zero','absolute')`,
    )
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addCheckConstraint(
      "chk_list_entries_trade_type",
      sql`trade_type IS NULL OR trade_type IN ('cards','money','both')`,
    )
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addCheckConstraint(
      "chk_list_entries_absolute_shape",
      sql`(price_pref = 'absolute') = (price_absolute_cents IS NOT NULL)`,
    )
    .execute();

  await db.schema
    .alterTable("list_entries")
    .addCheckConstraint(
      "chk_list_entries_absolute_positive",
      sql`price_absolute_cents IS NULL OR price_absolute_cents > 0`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("list_entries")
    .dropConstraint("chk_list_entries_absolute_positive")
    .execute();
  await db.schema
    .alterTable("list_entries")
    .dropConstraint("chk_list_entries_absolute_shape")
    .execute();
  await db.schema
    .alterTable("list_entries")
    .dropConstraint("chk_list_entries_trade_type")
    .execute();
  await db.schema
    .alterTable("list_entries")
    .dropConstraint("chk_list_entries_price_pref")
    .execute();
  await db.schema
    .alterTable("list_entries")
    .dropColumn("trade_type")
    .dropColumn("price_absolute_cents")
    .dropColumn("price_pref")
    .execute();

  await db.schema
    .alterTable("lists")
    .dropConstraint("chk_lists_prefs_only_on_trade_intents")
    .execute();
  await db.schema
    .alterTable("lists")
    .dropConstraint("chk_lists_default_absolute_positive")
    .execute();
  await db.schema.alterTable("lists").dropConstraint("chk_lists_default_absolute_shape").execute();
  await db.schema.alterTable("lists").dropConstraint("chk_lists_currency").execute();
  await db.schema.alterTable("lists").dropConstraint("chk_lists_default_trade_type").execute();
  await db.schema.alterTable("lists").dropConstraint("chk_lists_default_price_pref").execute();
  await db.schema
    .alterTable("lists")
    .dropColumn("currency")
    .dropColumn("default_trade_type")
    .dropColumn("default_price_absolute_cents")
    .dropColumn("default_price_pref")
    .execute();
}
