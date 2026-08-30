import { CONTACT_METHOD_TYPES, listRuleCombineSchema } from "@openrift/shared";
import { fallbackArtModeSchema } from "@openrift/shared/contracts/admin/card-detail-schemas";
import { channelKindEnum } from "@openrift/shared/contracts/admin/distribution-channels";
import { JOB_STATUSES, JOB_TRIGGERS } from "@openrift/shared/contracts/admin/job-runs";
import { printingEventStatusSchema } from "@openrift/shared/contracts/admin/printing-events";
import { scopeEnum } from "@openrift/shared/contracts/admin/site-settings";
import {
  cardSubmissionKindSchema,
  cardSubmissionReasonSchema,
  cardSubmissionStatusSchema,
} from "@openrift/shared/contracts/card-submissions";
import { CARD_TRADE_STATUSES, cardTradeSideSchema } from "@openrift/shared/contracts/card-trades";
import { activityActionSchema } from "@openrift/shared/contracts/collection-events";
import { deckCheckClaimSourceSchema } from "@openrift/shared/contracts/deck-check";
import { deckMatchupSwapDirectionSchema } from "@openrift/shared/contracts/decks";
import {
  friendGroupInviteDirectionSchema,
  friendGroupRoleSchema,
} from "@openrift/shared/contracts/friend-groups";
import { LOAN_STATUSES } from "@openrift/shared/contracts/loans";
import { organizationRoleSchema } from "@openrift/shared/contracts/organizations";
import { RULE_CHANGE_TYPES, RULE_KINDS, RULE_TYPES } from "@openrift/shared/contracts/rules";
import {
  scoringSchemeSchema,
  tournamentDeckPhaseSchema,
  tournamentDeckSubmissionSchema,
  tournamentListLockModeSchema,
  tournamentMatchFormatSchema,
  tournamentPairingStyleSchema,
  tournamentParticipantStatusSchema,
  tournamentPlayModeSchema,
  tournamentStaffRoleSchema,
  tournamentStatusSchema,
} from "@openrift/shared/contracts/tournaments";
import {
  cardFaceSchema,
  currencyResponseSchema,
  deckCheckEntryStateSchema,
  deckCheckMatchStatusSchema,
  deckCheckReviewOutcomeSchema,
  listIntentResponseSchema,
  listKindResponseSchema,
  metaCreditVisibilitySchema,
  metaListStatusSchema,
  metaSubmissionReasonSchema,
  metaSubmissionStatusSchema,
  podResultStatusSchema,
  podRoundStatusSchema,
  tradeTypeResponseSchema,
} from "@openrift/shared/response-schemas";
import { marketplaceEnum, TRADE_PRICE_PREFS } from "@openrift/shared/types";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupTestDb } from "../test/integration-setup.js";
import { CARD_TOKEN_SOURCES } from "./tables.js";
import type { Database } from "./types.js";

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Every string-enum CHECK in the schema, mapped to the TypeScript value list
 * that owns the same vocabulary. Adding a value in a migration without adding
 * it here (and therefore to the union the code branches on) fails this test.
 *
 * Keyed by constraint name because that is what `pg_constraint` reports and it
 * is unique per table.
 */
const ENUM_CHECKS: Record<string, readonly string[]> = {
  chk_candidate_meta_players_list_status: metaListStatusSchema.options,
  chk_card_submissions_kind: cardSubmissionKindSchema.options,
  chk_card_submissions_reason: cardSubmissionReasonSchema.options,
  chk_card_submissions_status: cardSubmissionStatusSchema.options,
  chk_card_tokens_source: CARD_TOKEN_SOURCES,
  chk_card_trades_initiator: cardTradeSideSchema.options,
  chk_card_trades_status: CARD_TRADE_STATUSES,
  chk_collection_events_action: activityActionSchema.options,
  chk_deck_check_entries_review_outcome: deckCheckReviewOutcomeSchema.options,
  chk_deck_check_entries_state: deckCheckEntryStateSchema.options,
  chk_deck_check_entry_cards_match: deckCheckMatchStatusSchema.options,
  chk_deck_matchup_swaps_direction: deckMatchupSwapDirectionSchema.options,
  distribution_channels_kind_check: channelKindEnum.options,
  chk_friend_group_invites_direction: friendGroupInviteDirectionSchema.options,
  chk_friend_group_members_role: friendGroupRoleSchema.options,
  chk_job_runs_status: JOB_STATUSES,
  chk_job_runs_trigger: JOB_TRIGGERS,
  chk_list_entries_kind: listKindResponseSchema.options,
  chk_list_entries_price_pref: TRADE_PRICE_PREFS,
  chk_list_entries_trade_type: tradeTypeResponseSchema.options,
  chk_lists_currency: currencyResponseSchema.options,
  chk_lists_default_price_pref: TRADE_PRICE_PREFS,
  chk_lists_default_trade_type: tradeTypeResponseSchema.options,
  chk_lists_intent: listIntentResponseSchema.options,
  chk_lists_kind: listKindResponseSchema.options,
  lists_rule_combine_check: listRuleCombineSchema.options,
  chk_loans_status: LOAN_STATUSES,
  chk_marketplace_groups_marketplace: marketplaceEnum.options,
  chk_marketplace_ignored_products_marketplace: marketplaceEnum.options,
  chk_marketplace_products_marketplace: marketplaceEnum.options,
  chk_meta_event_players_list_status: metaListStatusSchema.options,
  chk_meta_submissions_reason: metaSubmissionReasonSchema.options,
  chk_meta_submissions_status: metaSubmissionStatusSchema.options,
  chk_organization_members_role: organizationRoleSchema.options,
  chk_pod_rounds_status: podRoundStatusSchema.options,
  chk_pods_result_status: podResultStatusSchema.options,
  chk_printing_events_status: printingEventStatusSchema.options,
  chk_printing_images_face: cardFaceSchema.options,
  chk_printings_fallback_art_mode: fallbackArtModeSchema.options,
  rule_versions_kind_check: RULE_KINDS,
  rules_change_type_check: RULE_CHANGE_TYPES,
  rules_kind_check: RULE_KINDS,
  rules_rule_type_check: RULE_TYPES,
  site_settings_scope_check: scopeEnum.options,
  chk_tournament_participants_claim_source: deckCheckClaimSourceSchema.options,
  chk_tournament_participants_status: tournamentParticipantStatusSchema.options,
  chk_tournament_staff_role: tournamentStaffRoleSchema.options,
  chk_tournaments_deck_phase: tournamentDeckPhaseSchema.options,
  chk_tournaments_deck_submission: tournamentDeckSubmissionSchema.options,
  chk_tournaments_list_lock_mode: tournamentListLockModeSchema.options,
  chk_tournaments_match_format: tournamentMatchFormatSchema.options,
  chk_tournaments_pairing_style: tournamentPairingStyleSchema.options,
  chk_tournaments_play_mode: tournamentPlayModeSchema.options,
  chk_tournaments_scheme: scoringSchemeSchema.options,
  chk_tournaments_status: tournamentStatusSchema.options,
  chk_user_contact_methods_type: CONTACT_METHOD_TYPES,
  chk_users_meta_credit_visibility: metaCreditVisibilitySchema.options,
};

/**
 * CHECKs that mention an enum list but constrain a combination rather than one
 * column's vocabulary, so there is no single union to compare them against.
 * Listed explicitly so a new compound constraint is noticed rather than
 * silently skipped.
 */
const COMPOUND_CHECKS = new Set([
  "chk_lists_intent_kind",
  "chk_lists_prefs_only_on_trade_intents",
  // Biconditional over the closed statuses, not a vocabulary: the status list
  // itself is covered by chk_card_trades_status above.
  "chk_card_trades_closed_shape",
]);

/** A plain `col = ANY (ARRAY['a'::text, 'b'::text])`, optionally NULL-guarded. */
const SIMPLE_ENUM_CHECK =
  /^CHECK \(\((?:\(\w+ IS NULL\) OR \()?\(?\w+\)?(?:::text)? = ANY \(\(?ARRAY\[(?<values>[^\]]+)\](?:\)::text\[\])?\)\)\)?\)$/u;

const SQL_STRING_LITERAL = /'(?<value>(?:[^']|'')*)'/gu;

/** Pulls the quoted literals out of an `ARRAY[...]` body, dropping the casts. */
function parseArrayLiterals(body: string): string[] {
  return [...body.matchAll(SQL_STRING_LITERAL)].map((match) =>
    // oxlint-disable-next-line typescript/no-non-null-assertion -- the group is in the pattern
    match.groups!.value.replaceAll("''", "'"),
  );
}

interface CheckRow {
  conname: string;
  definition: string;
}

describe.skipIf(!DATABASE_URL)("DB enum CHECKs match their TypeScript unions", () => {
  let db: Kysely<Database>;
  let teardown: () => Promise<void>;
  let checks: CheckRow[];

  beforeAll(async () => {
    // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by describe.skipIf
    ({ db, teardown } = await setupTestDb(DATABASE_URL!, "enum-checks"));
    const result = await sql<CheckRow>`
      SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'c' AND n.nspname = 'public'
      ORDER BY c.conname
    `.execute(db);
    // Only enum-shaped CHECKs are in scope: `col = ANY (ARRAY[...])`. The
    // ::text requirement drops the numeric enumerations (pod sizes, image
    // rotations), which have no string union to drift against.
    checks = result.rows.filter(
      (row) => row.definition.includes("= ANY (") && row.definition.includes("'::text"),
    );
  });

  afterAll(async () => {
    await teardown();
  });

  it("finds enum-shaped CHECKs to compare", () => {
    expect(checks.length).toBeGreaterThan(40);
  });

  it("registers every enum-shaped CHECK", () => {
    const unregistered = checks
      .map((row) => row.conname)
      .filter((name) => !(name in ENUM_CHECKS) && !COMPOUND_CHECKS.has(name));
    expect(unregistered).toEqual([]);
  });

  it("has no registry entry for a constraint that no longer exists", () => {
    const live = new Set(checks.map((row) => row.conname));
    const stale = [...Object.keys(ENUM_CHECKS), ...COMPOUND_CHECKS].filter(
      (name) => !live.has(name),
    );
    expect(stale).toEqual([]);
  });

  it("matches each CHECK's permitted values against its TypeScript union", () => {
    const mismatches: { constraint: string; db: string[]; ts: string[] }[] = [];
    for (const row of checks) {
      const expected = ENUM_CHECKS[row.conname];
      if (!expected) {
        continue;
      }
      const match = SIMPLE_ENUM_CHECK.exec(row.definition);
      // A registered constraint that stopped being a plain single-column enum
      // is itself drift worth failing on, so an unparseable one yields no values.
      const actual = match?.groups ? parseArrayLiterals(match.groups.values).toSorted() : [];
      const wanted = [...expected].toSorted();
      if (actual.join("\0") !== wanted.join("\0")) {
        mismatches.push({ constraint: row.conname, db: actual, ts: wanted });
      }
    }
    expect(mismatches).toEqual([]);
  });
});
