#!/usr/bin/env tsx

/**
 * Dumps all readable tables from Riftcore's Supabase database into
 * data/riftcore-dump/ as individual JSON files.
 *
 * Usage: pnpm tsx scripts/dump-riftcore.ts
 *
 * Output: data/riftcore-dump/<table>.json
 *
 * Large tables (>1000 rows) are paginated automatically.
 * Tables that return errors or empty results are skipped.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dumpDir = join(__dirname, "..", "data", "riftcore-dump");

const SUPABASE_URL = "https://qwdkezknmjggodbiqigy.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3ZGtlemtubWpnZ29kYmlxaWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2OTM2MTIsImV4cCI6MjA3NTI2OTYxMn0.iWnIVAPjTjwSu8NGfPQVg-o0MP0jApqltCLKjEkcSVE";

const PAGE_SIZE = 1000;

/** All known table names from the OpenAPI spec */
const TABLES = [
  "achievement_url_submissions",
  "achievements",
  "activities",
  "activity_feed",
  "activity_interaction_votes",
  "activity_interactions",
  "activity_votes",
  "announcement_rsvps",
  "apis",
  "article_comment_replies",
  "article_comment_votes",
  "article_comments",
  "article_reactions",
  "article_reply_votes",
  "blog_articles",
  "business_application_comments",
  "business_applications",
  "card_activities",
  "card_binder_assignments",
  "card_collections",
  "card_comment_reactions",
  "card_comment_replies",
  "card_comment_votes",
  "card_comments",
  "card_price_history",
  "card_reply_reactions",
  "card_reply_votes",
  "cards",
  "chat_message_votes",
  "chat_messages",
  "chat_reactions",
  "chat_replies",
  "collection_binders",
  "collection_count_snapshots",
  "collection_goals",
  "collection_preferences",
  "collection_sessions",
  "collection_value_snapshots",
  "collection_views",
  "comment_replies",
  "comment_votes",
  "conversation_participants",
  "conversations",
  "creator_applications",
  "creator_calendar_events",
  "creator_code_usage",
  "creator_codes",
  "creator_decks",
  "creator_post_comments",
  "creator_post_interactions",
  "creator_posts",
  "creator_x_posts",
  "daily_market_analysis",
  "deck_activities",
  "deck_comment_reactions",
  "deck_comments",
  "deck_downvotes",
  "deck_folders",
  "deck_guides",
  "deck_legends",
  "deck_likes",
  "deck_matchups",
  "deck_notes",
  "deck_versions",
  "decks",
  "direct_message_reactions",
  "direct_messages",
  "discord_bot_config",
  "discord_bot_logs",
  "discord_deck_notifications",
  "email_campaigns",
  "email_sends",
  "email_subscribers",
  "email_templates",
  "event_attendees",
  "event_comment_reactions",
  "event_comment_replies",
  "event_comment_votes",
  "event_comments",
  "event_deck_registrations",
  "event_deck_registry",
  "event_hosts",
  "event_match_results",
  "event_photos",
  "event_reply_reactions",
  "event_reply_votes",
  "event_showcases",
  "event_standings",
  "event_subscriptions",
  "event_trading_cards",
  "events",
  "favorite_stores",
  "favorite_venues",
  "feature_access",
  "forum_message_votes",
  "forum_messages",
  "forum_reactions",
  "forum_tags",
  "forum_thread_subscriptions",
  "forum_thread_tags",
  "forum_threads",
  "forums",
  "game_sessions",
  "gpt_configurations",
  "gpt_documents",
  "host_attendees",
  "in_person_trade_items",
  "in_person_trade_sessions",
  "kiosk_cart_items",
  "kiosk_carts",
  "kiosk_sessions",
  "legend_stats",
  "market_snapshots",
  "match_leaderboard",
  "match_results",
  "match_results_v2",
  "notification_reads",
  "notifications",
  "official_event_notes",
  "pack_openings",
  "page_seo",
  "password_reset_tokens",
  "patch_note_comment_reactions",
  "patch_note_comment_replies",
  "patch_note_comment_votes",
  "patch_note_comments",
  "patch_note_reactions",
  "patch_note_reply_votes",
  "patch_notes",
  "player_presets",
  "poll_options",
  "poll_responses",
  "preconstructed_decks",
  "prize_possessions",
  "profiles",
  "public_collections",
  "public_profiles",
  "push_notification_logs",
  "push_subscriptions",
  "query_performance_logs",
  "quest_leaderboard",
  "quest_submissions",
  "question_responses",
  "quests",
  "referral_codes",
  "referral_leaderboard",
  "referral_tiers",
  "referrals",
  "reply_reactions",
  "reply_votes",
  "riftbound_knowledge",
  "saved_articles",
  "saved_qa",
  "scan_corrections",
  "sealed_products",
  "shared_event_schedules",
  "sponsored_event_checkins",
  "sponsored_event_prizes",
  "sponsored_events",
  "sponsored_prize_claims",
  "staff_application_comments",
  "staff_applications",
  "store_claim_requests",
  "store_photos",
  "store_profiles",
  "store_reviews",
  "ticket_comments",
  "tickets",
  "titles",
  "tournament_legend_images",
  "tournament_results",
  "tournaments",
  "trade_history",
  "trade_list_interests",
  "trade_list_views",
  "trade_lists",
  "trader_ratings",
  "twitch_webhook_subscriptions",
  "unclaimed_stores",
  "user_achievements",
  "user_blocks",
  "user_card_watchlist",
  "user_event_attendance",
  "user_follows",
  "user_match_types",
  "user_preconstructed_decks",
  "user_presence",
  "user_quests",
  "user_roles",
  "user_titles",
  "verified_card_scans",
  "want_list_sources",
  "want_lists",
  "xp_activity_rewards",
  "xp_leaderboard",
  "xp_transactions",
  "youtube_subscriptions",
];

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

/** Fetch a single page of data */
async function fetchPage(table: string, offset: number, limit: number) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

/** Fetch all rows from a table, paginating if needed */
async function fetchTable(table: string) {
  let allRows = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(table, offset, PAGE_SIZE);
    allRows = allRows.concat(page);
    if (page.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return allRows;
}

async function main() {
  mkdirSync(dumpDir, { recursive: true });

  const summary = [];
  let totalRows = 0;
  let successCount = 0;

  console.log(`Dumping ${TABLES.length} tables to ${dumpDir}/\n`);

  for (const table of TABLES) {
    process.stdout.write(`  ${table}...`);
    try {
      const rows = await fetchTable(table);
      if (rows.length === 0) {
        process.stdout.write(` empty, skipping\n`);
        summary.push({ table, rows: 0, status: "empty" });
        continue;
      }

      const outputPath = join(dumpDir, `${table}.json`);
      writeFileSync(outputPath, `${JSON.stringify(rows, null, 2)}\n`);
      totalRows += rows.length;
      successCount++;
      process.stdout.write(` ${rows.length} rows\n`);
      summary.push({ table, rows: rows.length, status: "ok" });
    } catch (error) {
      process.stdout.write(` error (${error.message})\n`);
      summary.push({ table, rows: 0, status: `error: ${error.message}` });
    }
  }

  // Write summary
  const summaryPath = join(dumpDir, "_summary.json");
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        dumpedAt: new Date().toISOString(),
        tablesTotal: TABLES.length,
        tablesWithData: successCount,
        totalRows,
        tables: summary,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\nDone: ${successCount} tables with data, ${totalRows} total rows`);
  console.log(`Summary: ${summaryPath}`);
}

main().catch((error) => {
  console.error("Dump failed:", error.message);
  process.exit(1);
});
