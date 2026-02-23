#!/usr/bin/env node

/**
 * Dumps all Riftbound product data from CardNexus' public oRPC API.
 *
 * 770 products (738 cards + 32 sealed) with dual marketplace pricing
 * (Cardmarket EUR + TCGplayer USD). Paginated at 200 items per request.
 * No authentication required.
 *
 * Usage: node scripts/dump-cardnexus.mjs
 *
 * Output: data/cardnexus-dump/products.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dumpDir = join(__dirname, "..", "data", "cardnexus-dump");

const API_URL = "https://api.cardnexus.com/orpc/product/getProducts";
const PAGE_SIZE = 200;

async function fetchPage(offset) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      json: {
        search: { game: "riftbound" },
        sort: [["sortNumber", "asc"]],
        limit: PAGE_SIZE,
        offset,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    products: data.json.products,
    count: data.json.count,
  };
}

async function main() {
  mkdirSync(dumpDir, { recursive: true });

  console.log("Fetching all Riftbound products from CardNexus oRPC API...");

  const allProducts = [];
  let offset = 0;
  let totalCount = 0;

  while (true) {
    const { products, count } = await fetchPage(offset);
    totalCount = count;

    if (offset === 0) {
      console.log(`  Total products reported: ${count}`);
    }

    allProducts.push(...products);
    console.log(`  Fetched ${allProducts.length}/${count}`);

    if (allProducts.length >= count || products.length === 0) {
      break;
    }
    offset += PAGE_SIZE;
  }

  const output = {
    source: "app.cardnexus.com",
    fetchedAt: new Date().toISOString(),
    totalProducts: allProducts.length,
    products: allProducts,
  };

  const outputPath = join(dumpDir, "products.json");
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  // Summary
  const cards = allProducts.filter((p) => p.productType === "card");
  const sealed = allProducts.filter((p) => p.productType !== "card");

  // Group by expansion
  const setMap = new Map();
  for (const card of cards) {
    const set = card.expansion?.code || "Unknown";
    setMap.set(set, (setMap.get(set) || 0) + 1);
  }

  // Count pricing
  const withEuPrice = cards.filter((c) => {
    const finishes = Object.values(c.pricesByFinish || {});
    return finishes.some((f) => f.priceEu > 0);
  }).length;
  const withUsPrice = cards.filter((c) => {
    const finishes = Object.values(c.pricesByFinish || {});
    return finishes.some((f) => f.priceUs > 0);
  }).length;

  // Count finishes
  const withFoil = cards.filter((c) => c.finishes?.includes("Foil")).length;
  const withStandard = cards.filter((c) => c.finishes?.includes("Standard")).length;

  console.log(`\nFetched ${allProducts.length} products:`);
  console.log(`  ${cards.length} cards, ${sealed.length} sealed/other`);

  console.log("\nExpansions:");
  for (const [set, count] of [...setMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${set}: ${count}`);
  }

  console.log(`\nFinishes: ${withStandard} Standard, ${withFoil} Foil`);
  console.log(`Pricing: ${withEuPrice} with EU price, ${withUsPrice} with US price`);
  console.log(`\nWritten to ${outputPath}`);
}

main().catch((error) => {
  console.error("Dump failed:", error.message);
  process.exit(1);
});
