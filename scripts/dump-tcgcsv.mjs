#!/usr/bin/env node

/**
 * Dumps all Riftbound data from TCGCSV (TCGplayer mirror).
 *
 * Fetches groups (sets), products, and prices for all Riftbound sets.
 * No authentication required. Category ID 89 = Riftbound.
 *
 * Usage: node scripts/dump-tcgcsv.mjs
 *
 * Output: data/tcgcsv-dump/groups.json
 *         data/tcgcsv-dump/products-{groupId}.json (per set)
 *         data/tcgcsv-dump/prices-{groupId}.json (per set)
 *         data/tcgcsv-dump/_summary.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dumpDir = join(__dirname, "..", "data", "tcgcsv-dump");

const BASE_URL = "https://tcgcsv.com/tcgplayer";
const CATEGORY_ID = 89; // Riftbound

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  mkdirSync(dumpDir, { recursive: true });

  // Fetch groups (sets)
  console.log("Fetching Riftbound groups from TCGCSV...");
  const groupsData = await fetchJson(`${BASE_URL}/${CATEGORY_ID}/groups`);
  const groups = groupsData.results;

  const groupsPath = join(dumpDir, "groups.json");
  writeFileSync(groupsPath, `${JSON.stringify(groupsData, null, 2)}\n`);
  console.log(`  Found ${groups.length} groups`);

  let totalProducts = 0;
  let totalPrices = 0;
  const summary = [];

  // Fetch products and prices for each group
  for (const group of groups) {
    const { groupId, name, abbreviation } = group;
    process.stdout.write(`\n  ${name} (${abbreviation}, ID: ${groupId})...\n`);

    // Fetch products
    process.stdout.write("    Products... ");
    const productsData = await fetchJson(`${BASE_URL}/${CATEGORY_ID}/${groupId}/products`);
    const products = productsData.results || [];
    const productsPath = join(dumpDir, `products-${groupId}.json`);
    writeFileSync(productsPath, `${JSON.stringify(productsData, null, 2)}\n`);
    process.stdout.write(`${products.length}\n`);

    // Fetch prices
    process.stdout.write("    Prices... ");
    const pricesData = await fetchJson(`${BASE_URL}/${CATEGORY_ID}/${groupId}/prices`);
    const prices = pricesData.results || [];
    const pricesPath = join(dumpDir, `prices-${groupId}.json`);
    writeFileSync(pricesPath, `${JSON.stringify(pricesData, null, 2)}\n`);
    process.stdout.write(`${prices.length}\n`);

    totalProducts += products.length;
    totalPrices += prices.length;
    summary.push({
      groupId,
      name,
      abbreviation,
      products: products.length,
      prices: prices.length,
    });
  }

  // Write summary
  const summaryData = {
    source: "tcgcsv.com",
    categoryId: CATEGORY_ID,
    fetchedAt: new Date().toISOString(),
    totalGroups: groups.length,
    totalProducts,
    totalPrices,
    groups: summary,
  };
  const summaryPath = join(dumpDir, "_summary.json");
  writeFileSync(summaryPath, `${JSON.stringify(summaryData, null, 2)}\n`);

  console.log(
    `\nDone: ${groups.length} groups, ${totalProducts} products, ${totalPrices} price entries`,
  );
  console.log(`Summary: ${summaryPath}`);
}

main().catch((error) => {
  console.error("Dump failed:", error.message);
  process.exit(1);
});
