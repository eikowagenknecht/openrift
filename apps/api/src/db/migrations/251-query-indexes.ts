import type { Kysely } from "kysely";
import { sql } from "kysely";

// Index housekeeping from the schema review: cover the foreign keys and sorts
// that queries actually use, and remove the ones nothing can use.
//
// Added
//   - `collection_events (printing_id)`: the column is a FK with no index, on the
//     largest table in the schema (182k rows). Deleting a printing had to scan
//     all of it, as does the per-printing event history.
//   - `copies (collection_id, created_at DESC, id ASC)`: the collection view
//     orders in exactly these directions, so the index can be walked forwards and
//     the sort disappears. The directions matter — a plain ASC index would need a
//     backward scan, which the mixed DESC/ASC pair rules out. Replaces
//     `idx_copies_collection`, a strict prefix.
//   - `collection_events (user_id, created_at, id)`: the activity feed keysets on
//     `created_at DESC, id DESC`, which an all-ASC index serves by backward scan.
//     Adding `id` is what lets the tiebreaker come from the index instead of a
//     sort. Replaces the two-column version.
//   - `card_submissions (user_id, created_at DESC, id DESC)`: same idea, matching
//     `listByUser`'s ordering exactly. Replaces the version without `id`.
//   - `deck_cards (card_id)` and `deck_cards (preferred_printing_id)`: two more
//     unindexed FKs. `preferred_printing_id` is partial because it is usually
//     NULL and the NULLs are never looked up.
//   - `list_entries (card_id)` and `list_entries (printing_id)`: unindexed FKs.
//     The existing unique indexes lead with `list_id`, so they cannot serve a
//     lookup by card or printing. Partial for the same reason as above — the
//     `chk_list_entries_kind_shape` CHECK guarantees exactly one of the three
//     reference columns is set per row.
//   - `decks (collection_id)`: an unindexed FK to the deck's home collection.
//
// Dropped as strict leading prefixes of another index or constraint on the same
// table, each verified against the snapshot: their scans move to the wider index
// at no cost, and the writes they charged for stop.
//
//   idx_printing_images_printing_id        ⊂ idx_printing_images_printing_face
//   idx_lists_user_id                      ⊂ idx_lists_user_intent
//   idx_friend_group_collection_shares_group ⊂ friend_group_collection_shares_pkey
//   idx_friend_group_list_shares_group     ⊂ friend_group_list_shares_pkey
//   idx_friend_group_member_contacts_member ⊂ friend_group_member_contacts_pkey
//   idx_pod_rounds_tournament              ⊂ uq_pod_rounds_number
//   idx_pods_round                         ⊂ uq_pods_number
//   idx_candidate_printings_candidate_card ⊂ idx_candidate_printings_card_external_id
//
// `idx_printings_rarity` goes too, for a different reason: nothing uses it. The
// only single-column predicate on `printings.rarity` in the API is the taxonomy
// delete-guard in `repositories/rarities.ts` (`WHERE rarity = $1 LIMIT 1`), run
// when an admin deletes a rarity, against 7k rows. The three other `rarity`
// filters live in the collection-value-history queries, where printings are
// reached through `printings_pkey` from `copies` and the predicate is applied
// after the join — an index on `rarity` cannot participate. Production statistics
// agree: zero scans.
const REDUNDANT_INDEXES: { name: string; table: string; definition: string }[] = [
  {
    name: "idx_printing_images_printing_id",
    table: "printing_images",
    definition: "printing_id",
  },
  { name: "idx_lists_user_id", table: "lists", definition: "user_id" },
  {
    name: "idx_friend_group_collection_shares_group",
    table: "friend_group_collection_shares",
    definition: "group_id",
  },
  {
    name: "idx_friend_group_list_shares_group",
    table: "friend_group_list_shares",
    definition: "group_id",
  },
  {
    name: "idx_friend_group_member_contacts_member",
    table: "friend_group_member_contacts",
    definition: "group_id, user_id",
  },
  { name: "idx_pod_rounds_tournament", table: "pod_rounds", definition: "tournament_id" },
  { name: "idx_pods_round", table: "pods", definition: "round_id" },
  {
    name: "idx_candidate_printings_candidate_card",
    table: "candidate_printings",
    definition: "candidate_card_id",
  },
  { name: "idx_printings_rarity", table: "printings", definition: "rarity" },
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE INDEX idx_collection_events_printing ON collection_events (printing_id)
  `.execute(db);

  await sql`
    CREATE INDEX idx_copies_collection_created ON copies (collection_id, created_at DESC, id ASC)
  `.execute(db);
  await sql`DROP INDEX idx_copies_collection`.execute(db);

  await sql`DROP INDEX idx_collection_events_user_created`.execute(db);
  await sql`
    CREATE INDEX idx_collection_events_user_created ON collection_events (user_id, created_at, id)
  `.execute(db);

  await sql`DROP INDEX idx_card_submissions_user_created`.execute(db);
  await sql`
    CREATE INDEX idx_card_submissions_user_created
    ON card_submissions (user_id, created_at DESC, id DESC)
  `.execute(db);

  await sql`CREATE INDEX idx_deck_cards_card ON deck_cards (card_id)`.execute(db);
  await sql`
    CREATE INDEX idx_deck_cards_preferred_printing
    ON deck_cards (preferred_printing_id) WHERE preferred_printing_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX idx_list_entries_card ON list_entries (card_id) WHERE card_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE INDEX idx_list_entries_printing
    ON list_entries (printing_id) WHERE printing_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX idx_decks_collection ON decks (collection_id) WHERE collection_id IS NOT NULL
  `.execute(db);

  for (const index of REDUNDANT_INDEXES) {
    await sql`DROP INDEX ${sql.ref(index.name)}`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const index of REDUNDANT_INDEXES) {
    await sql`
      CREATE INDEX ${sql.ref(index.name)} ON ${sql.ref(index.table)} (${sql.raw(index.definition)})
    `.execute(db);
  }

  await sql`DROP INDEX idx_decks_collection`.execute(db);
  await sql`DROP INDEX idx_list_entries_printing`.execute(db);
  await sql`DROP INDEX idx_list_entries_card`.execute(db);
  await sql`DROP INDEX idx_deck_cards_preferred_printing`.execute(db);
  await sql`DROP INDEX idx_deck_cards_card`.execute(db);

  await sql`DROP INDEX idx_card_submissions_user_created`.execute(db);
  await sql`
    CREATE INDEX idx_card_submissions_user_created ON card_submissions (user_id, created_at DESC)
  `.execute(db);

  await sql`DROP INDEX idx_collection_events_user_created`.execute(db);
  await sql`
    CREATE INDEX idx_collection_events_user_created ON collection_events (user_id, created_at)
  `.execute(db);

  await sql`CREATE INDEX idx_copies_collection ON copies (collection_id)`.execute(db);
  await sql`DROP INDEX idx_copies_collection_created`.execute(db);

  await sql`DROP INDEX idx_collection_events_printing`.execute(db);
}
