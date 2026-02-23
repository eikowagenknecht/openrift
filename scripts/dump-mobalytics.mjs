#!/usr/bin/env node

/**
 * Dumps all card data from Mobalytics' public GraphQL API.
 *
 * Single query returns all 652 entries (628 active + 24 deprecated battlefields).
 * No authentication required.
 *
 * Usage: node scripts/dump-mobalytics.mjs
 *
 * Output: data/mobalytics-dump/cards.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dumpDir = join(__dirname, "..", "data", "mobalytics-dump");

const GRAPHQL_URL = "https://mobalytics.gg/api/riftbound/v1/graphql/query";

const CARDS_QUERY = `query {
  riftbound {
    staticData {
      groups {
        cards(filter: {status: ALL, page: {all: true}}) {
          data {
            id
            name
            slug
            cardType
            collectorNumber
            colors
            deprecated
            description
            flavorText
            iconUrl
            imageUrl
            illustrationUrl
            illustrator
            orientation
            publicCode
            rarity
            recordType
            set
            superType
            tags
            stats {
              name
              value
            }
          }
        }
      }
      metadata {
        dataVersion
      }
    }
  }
}`;

async function main() {
  mkdirSync(dumpDir, { recursive: true });

  console.log("Fetching all cards from Mobalytics GraphQL API...");

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: CARDS_QUERY }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const cards = json.data.riftbound.staticData.groups.cards.data;
  const dataVersion = json.data.riftbound.staticData.metadata.dataVersion;

  const output = {
    source: "mobalytics.gg",
    fetchedAt: new Date().toISOString(),
    dataVersion,
    totalCards: cards.length,
    cards,
  };

  const outputPath = join(dumpDir, "cards.json");
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  // Summary
  const active = cards.filter((c) => !c.deprecated);
  const deprecated = cards.filter((c) => c.deprecated);

  // Group by set
  const setMap = new Map();
  for (const card of active) {
    const set = card.set || "unknown";
    setMap.set(set, (setMap.get(set) || 0) + 1);
  }

  // Group by recordType
  const typeMap = new Map();
  for (const card of active) {
    const types = card.recordType || ["Unknown"];
    for (const t of types) {
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    }
  }

  const withIllustration = active.filter((c) => c.illustrationUrl).length;
  const withFlavor = active.filter((c) => c.flavorText).length;

  console.log(`\nFetched ${cards.length} entries (data version: ${dataVersion}):`);
  console.log(`  ${active.length} active, ${deprecated.length} deprecated`);

  console.log("\nSets (active cards):");
  for (const [set, count] of [...setMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${set}: ${count}`);
  }

  console.log("\nRecord types:");
  for (const [type, count] of [...typeMap.entries()].sort(([, a], [, b]) => b - a)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\n  ${withIllustration} with illustration art, ${withFlavor} with flavor text`);
  console.log(`\nWritten to ${outputPath}`);
}

main().catch((error) => {
  console.error("Dump failed:", error.message);
  process.exit(1);
});
