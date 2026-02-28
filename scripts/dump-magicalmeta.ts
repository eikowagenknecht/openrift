#!/usr/bin/env tsx

/**
 * Downloads the Magical Meta Riftbound static JSON file.
 *
 * The entire dataset (~54 MB) is a single JSON file with 1,140 entries
 * including cards, sealed products, and accessories — all with TCGPlayer
 * pricing, 366 days of price history, and market analytics.
 *
 * Usage: bun scripts/dump-magicalmeta.ts
 *
 * Output: data/magicalmeta-dump/cards_data.json
 */

import { join } from "node:path";

import { createDumpDir, runDump, writeJson } from "./dump-utils.js";

const dumpDir = createDumpDir(import.meta.url, "magicalmeta");

const DATA_URL = "https://magicalmeta.ink/riftbound/data/cards_data.json";

async function main() {
  console.log("Downloading Magical Meta Riftbound data...");
  console.log(`  URL: ${DATA_URL}`);

  const res = await fetch(DATA_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();

  const outputPath = join(dumpDir, "cards_data.json");
  writeJson(outputPath, data);

  // Summary
  const cards = data.cards || [];
  const totalCards = cards.filter((c) => !c.is_sealed).length;
  const sealed = cards.filter((c) => c.is_sealed).length;
  const withPrice = cards.filter((c) => c.current_price?.market_price > 0).length;
  const foil = cards.filter((c) => c.variant === "Foil").length;
  const normal = cards.filter((c) => c.variant === "Normal").length;
  const promos = cards.filter((c) => c.card_info?.is_promo).length;
  const withHistory = cards.filter((c) => c.price_history?.length > 0).length;
  const historyDays = cards[0]?.price_history?.length || 0;

  // Group by set
  const setMap = new Map();
  for (const card of cards) {
    const set = card.set_info?.set_name || "Unknown";
    setMap.set(set, (setMap.get(set) || 0) + 1);
  }

  console.log(`\nFetched ${cards.length} total entries:`);
  console.log(`  ${totalCards} cards, ${sealed} sealed products`);
  console.log(`  ${foil} Foil, ${normal} Normal`);
  console.log(`  ${promos} promos`);
  console.log(
    `  ${withPrice} with pricing, ${withHistory} with price history (${historyDays} days)`,
  );

  console.log("\nSets:");
  for (const [set, count] of [...setMap.entries()].sort(([, a], [, b]) => b - a)) {
    console.log(`  ${set}: ${count}`);
  }

  if (data.market_summary) {
    console.log(`\nMarket summary:`);
    console.log(`  Total value: $${data.market_summary.total_market_value?.toFixed(2) || "N/A"}`);
  }

  console.log(`\nExport date: ${data.export_date || "N/A"}`);
  console.log(`Written to ${outputPath}`);
}

runDump(main);
