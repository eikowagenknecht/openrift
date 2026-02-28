#!/usr/bin/env tsx

/**
 * Dumps all data from Riftbinder's public REST API.
 *
 * Endpoints:
 *   GET /api/cards?limit=100&offset=0  → { cards: [...], total, hasMore }
 *   GET /api/guides?limit=100&offset=0 → { guides: [...], total, hasMore }
 *
 * No auth required.
 *
 * Usage: bun scripts/dump-riftbinder.ts
 *
 * Output: data/riftbinder-dump/cards.json
 *         data/riftbinder-dump/guides.json
 */

import { join } from "node:path";

import { createDumpDir, runDump, writeJson } from "./dump-utils.js";

const dumpDir = createDumpDir(import.meta.url, "riftbinder");

const BASE_URL = "https://riftbinder.com/api";
const PAGE_SIZE = 100;

/** Fetch a single page from a paginated endpoint */
async function fetchPage(endpoint: string, key: string, offset: number) {
  const url = `${BASE_URL}/${endpoint}?limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Riftbinder API error ${res.status} on /${endpoint}: ${body}`);
  }
  const data = await res.json();
  return { items: data[key], total: data.total, hasMore: data.hasMore };
}

/** Fetch all items from a paginated endpoint */
async function fetchAll(endpoint: string, key: string) {
  const allItems = [];
  let offset = 0;

  console.log(`Fetching all ${key} from /api/${endpoint}...`);

  while (true) {
    const { items, total, hasMore } = await fetchPage(endpoint, key, offset);
    allItems.push(...items);

    if (offset === 0) {
      console.log(`  Total ${key} reported: ${total}`);
    }
    console.log(`  Fetched ${allItems.length}/${total} ${key}`);

    if (!hasMore || items.length === 0) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return allItems;
}

async function main() {
  const cards = await fetchAll("cards", "cards");
  const guides = await fetchAll("guides", "guides");

  // Group by set
  const setMap = new Map();
  for (const card of cards) {
    const set = card.set || "Unknown";
    if (!setMap.has(set)) {
      setMap.set(set, []);
    }
    setMap.get(set).push(card);
  }

  // Sort cards within each set by id
  for (const setCards of setMap.values()) {
    setCards.sort((a, b) => a.id.localeCompare(b.id));
  }

  // Write cards
  const cardsOutput = {
    source: "riftbinder.com",
    fetchedAt: new Date().toISOString(),
    totalCards: cards.length,
    sets: Object.fromEntries(
      [...setMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([set, setCards]) => [set, { count: setCards.length, cards: setCards }]),
    ),
  };

  const cardsPath = join(dumpDir, "cards.json");
  writeJson(cardsPath, cardsOutput);

  // Write guides
  const guidesOutput = {
    source: "riftbinder.com",
    fetchedAt: new Date().toISOString(),
    totalGuides: guides.length,
    guides,
  };

  const guidesPath = join(dumpDir, "guides.json");
  writeJson(guidesPath, guidesOutput);

  // Summary
  console.log(`\nFetched ${cards.length} cards across ${setMap.size} sets:`);
  for (const [set, setCards] of [...setMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const foils = setCards.filter((c) => c.id.includes("#FOIL")).length;
    const promos = setCards.filter((c) => c.id.includes("-P")).length;
    const stars = setCards.filter((c) => c.id.includes("-STAR")).length;
    const suffixes = [];
    if (foils > 0) suffixes.push(`${foils} foil`);
    if (promos > 0) suffixes.push(`${promos} promo`);
    if (stars > 0) suffixes.push(`${stars} star`);
    const suffix = suffixes.length > 0 ? ` (${suffixes.join(", ")})` : "";
    console.log(`  ${set}: ${setCards.length} cards${suffix}`);
  }

  // Type breakdown
  const types = new Map();
  for (const card of cards) {
    const t = card.type || "Unknown";
    types.set(t, (types.get(t) || 0) + 1);
  }
  console.log("\nCard types:");
  for (const [type, count] of [...types.entries()].sort(([, a], [, b]) => b - a)) {
    console.log(`  ${type}: ${count}`);
  }

  // Rarity breakdown
  const rarities = new Map();
  for (const card of cards) {
    const r = card.rarity || "Unknown";
    rarities.set(r, (rarities.get(r) || 0) + 1);
  }
  console.log("\nRarities:");
  for (const [rarity, count] of [...rarities.entries()].sort(([, a], [, b]) => b - a)) {
    console.log(`  ${rarity}: ${count}`);
  }

  if (guides.length > 0) {
    console.log(`\nGuides: ${guides.length}`);
    for (const guide of guides) {
      console.log(`  "${guide.title}" (${guide.views} views, ${guide.likes} likes)`);
    }
  }

  console.log(`\nWritten to:`);
  console.log(`  ${cardsPath}`);
  console.log(`  ${guidesPath}`);
}

runDump(main);
