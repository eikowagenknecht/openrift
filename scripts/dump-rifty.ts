#!/usr/bin/env tsx

/**
 * Dumps all card and edition data from Rifty's public GraphQL API.
 *
 * 684 cards across 4 sets (OGN, SFD, OGS, ARC) with TCGPlayer pricing.
 * No authentication required for server-side requests (CORS blocks browsers).
 *
 * Usage: pnpm tsx scripts/dump-rifty.ts
 *
 * Output: data/rifty-dump/cards.json, data/rifty-dump/editions.json
 */

import { join } from "node:path";

import { createDumpDir, runDump, writeJson } from "./dump-utils.js";

const dumpDir = createDumpDir(import.meta.url, "rifty");

const GRAPHQL_URL = "https://api.rifty.app/graphql";

async function graphql(query: string) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function main() {
  // Fetch editions first to know the total count
  console.log("Fetching editions from Rifty GraphQL API...");
  const editionsData = await graphql(`{
    editions {
      code name draftable img releasedAt lastUpdated hasPrerift
    }
  }`);

  const editions = editionsData.editions;
  console.log(`  Found ${editions.length} editions: ${editions.map((e) => e.code).join(", ")}`);

  const editionsPath = join(dumpDir, "editions.json");
  writeJson(editionsPath, {
    source: "rifty.app",
    fetchedAt: new Date().toISOString(),
    editions,
  });

  // Fetch all cards with a large page size
  console.log("\nFetching all cards...");
  const cardsData = await graphql(`{
    cardList(pagination: { page: 0, pageSize: 1000 }) {
      totalCount
      cards {
        code name edition rarity type domains
        energy power might tags signature
        cardText flavourText artist img price
      }
    }
  }`);

  const cards = cardsData.cardList.cards;
  const totalCount = cardsData.cardList.totalCount;

  console.log(`  Fetched ${cards.length}/${totalCount} cards`);

  // If there are more cards than our page size, paginate
  if (cards.length < totalCount) {
    console.log("  Paginating for remaining cards...");
    let page = 1;
    while (cards.length < totalCount) {
      const moreData = await graphql(`{
        cardList(pagination: { page: ${page}, pageSize: 1000 }) {
          cards {
            code name edition rarity type domains
            energy power might tags signature
            cardText flavourText artist img price
          }
        }
      }`);
      const moreCards = moreData.cardList.cards;
      if (moreCards.length === 0) break;
      cards.push(...moreCards);
      page++;
    }
    console.log(`  Total fetched: ${cards.length}`);
  }

  const output = {
    source: "rifty.app",
    fetchedAt: new Date().toISOString(),
    totalCards: cards.length,
    cards,
  };

  const cardsPath = join(dumpDir, "cards.json");
  writeJson(cardsPath, output);

  // Summary
  const setMap = new Map();
  for (const card of cards) {
    const set = card.edition || "unknown";
    setMap.set(set, (setMap.get(set) || 0) + 1);
  }

  const withPrice = cards.filter((c) => c.price != null).length;
  const withArtist = cards.filter((c) => c.artist).length;
  const withFlavor = cards.filter((c) => c.flavourText).length;

  console.log(`\nFetched ${cards.length} cards:`);

  console.log("\nSets:");
  for (const [set, count] of [...setMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${set}: ${count}`);
  }

  console.log(
    `\n  ${withPrice} with pricing, ${withArtist} with artist, ${withFlavor} with flavour text`,
  );
  console.log(`\nWritten to:`);
  console.log(`  ${cardsPath}`);
  console.log(`  ${editionsPath}`);
}

runDump(main);
