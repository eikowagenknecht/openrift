import type { Kysely } from "kysely";
import { sql } from "kysely";

// Key and foreign-key hardening from the schema review. Five unrelated gaps,
// all of the same kind: a rule the application already relies on that the
// database was not stating.
//
// 1. `keyword_translations` had a UNIQUE on its natural key but no primary key
//    at all, so the table had no declared identity.
//
// 2. `accounts` (better-auth) is looked up by (provider_id, account_id) on every
//    OAuth sign-in and that pair must be unique, but nothing said so. No column
//    changes — the table's shape belongs to better-auth.
//
// 3. `friend_group_list_shares.list_id` pointed at `lists(id)` alone while the
//    row also carries the sharer's `user_id`, so a share could name one member's
//    list under another member's name. The composite FK against `uq_lists_id_user`
//    makes that unrepresentable, exactly as `fk_friend_group_collection_shares_collection`
//    already does for shared collections.
//
// 4. Five tables denormalise `card_id` next to a `printing_id` for grouping and
//    display. Nothing tied the pair together, so a row could claim a printing
//    that belongs to a different card. `uq_printings_id_card` gives those pairs
//    a target and each composite FK enforces agreement. They are ON DELETE NO
//    ACTION on purpose: the existing per-column FKs keep owning the delete
//    behaviour (SET NULL for the optional references, block for the required
//    ones), and NO ACTION is checked at end of statement, so a SET NULL has
//    already emptied its column by the time the pair is examined. MATCH SIMPLE
//    (the default) then passes any pair with a NULL in it, which is what the
//    nullable references want.
//
// 5. `candidate_printings.printed_effect_text` and `flavor_text` defaulted to
//    `''` while their own CHECKs forbid the empty string, so an INSERT that
//    omitted either column raised a constraint violation. Both are nullable;
//    omission should land NULL.
const PRINTING_CARD_FKS: {
  table: string;
  constraint: string;
  printingColumn: string;
  cardColumn: string;
}[] = [
  {
    table: "card_trades",
    constraint: "fk_card_trades_printing_card",
    printingColumn: "printing_id",
    cardColumn: "card_id",
  },
  {
    table: "loans",
    constraint: "fk_loans_printing_card",
    printingColumn: "printing_id",
    cardColumn: "card_id",
  },
  {
    table: "deck_cards",
    constraint: "fk_deck_cards_printing_card",
    printingColumn: "preferred_printing_id",
    cardColumn: "card_id",
  },
  {
    table: "decks",
    constraint: "fk_decks_cover_printing_card",
    printingColumn: "cover_printing_id",
    cardColumn: "cover_card_id",
  },
  {
    table: "deck_check_entry_cards",
    constraint: "fk_deck_check_entry_cards_printing_card",
    printingColumn: "resolved_printing_id",
    cardColumn: "resolved_card_id",
  },
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE keyword_translations DROP CONSTRAINT uq_keyword_translations_keyword_language
  `.execute(db);
  await sql`
    ALTER TABLE keyword_translations ADD CONSTRAINT keyword_translations_pkey PRIMARY KEY (keyword_name, language)
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX uq_accounts_provider_account ON accounts (provider_id, account_id)
  `.execute(db);

  await sql`
    ALTER TABLE friend_group_list_shares DROP CONSTRAINT friend_group_list_shares_list_id_fkey
  `.execute(db);
  await sql`
    ALTER TABLE friend_group_list_shares
    ADD CONSTRAINT fk_friend_group_list_shares_list
    FOREIGN KEY (list_id, user_id) REFERENCES lists (id, user_id) ON DELETE CASCADE
  `.execute(db);

  await sql`
    ALTER TABLE printings ADD CONSTRAINT uq_printings_id_card UNIQUE (id, card_id)
  `.execute(db);

  for (const fk of PRINTING_CARD_FKS) {
    await sql`
      ALTER TABLE ${sql.ref(fk.table)}
      ADD CONSTRAINT ${sql.ref(fk.constraint)}
      FOREIGN KEY (${sql.ref(fk.printingColumn)}, ${sql.ref(fk.cardColumn)})
      REFERENCES printings (id, card_id)
    `.execute(db);
  }

  await sql`ALTER TABLE candidate_printings ALTER COLUMN printed_effect_text DROP DEFAULT`.execute(
    db,
  );
  await sql`ALTER TABLE candidate_printings ALTER COLUMN flavor_text DROP DEFAULT`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE candidate_printings ALTER COLUMN flavor_text SET DEFAULT ''::text
  `.execute(db);
  await sql`
    ALTER TABLE candidate_printings ALTER COLUMN printed_effect_text SET DEFAULT ''::text
  `.execute(db);

  for (const fk of PRINTING_CARD_FKS) {
    await sql`
      ALTER TABLE ${sql.ref(fk.table)} DROP CONSTRAINT ${sql.ref(fk.constraint)}
    `.execute(db);
  }
  await sql`ALTER TABLE printings DROP CONSTRAINT uq_printings_id_card`.execute(db);

  await sql`
    ALTER TABLE friend_group_list_shares DROP CONSTRAINT fk_friend_group_list_shares_list
  `.execute(db);
  await sql`
    ALTER TABLE friend_group_list_shares
    ADD CONSTRAINT friend_group_list_shares_list_id_fkey
    FOREIGN KEY (list_id) REFERENCES lists (id) ON DELETE CASCADE
  `.execute(db);

  await sql`DROP INDEX uq_accounts_provider_account`.execute(db);

  await sql`ALTER TABLE keyword_translations DROP CONSTRAINT keyword_translations_pkey`.execute(db);
  await sql`
    ALTER TABLE keyword_translations
    ADD CONSTRAINT uq_keyword_translations_keyword_language UNIQUE (keyword_name, language)
  `.execute(db);
}
