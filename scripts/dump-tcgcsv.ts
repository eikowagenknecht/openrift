#!/usr/bin/env tsx

/**
 * Dumps all Riftbound data from TCGCSV (TCGplayer mirror).
 *
 * Fetches groups (sets), products, and prices for all Riftbound sets.
 * No authentication required. Category ID 89 = Riftbound.
 *
 * Usage: bun scripts/dump-tcgcsv.ts
 *
 * Output: data/tcgcsv-dump/groups.json
 *         data/tcgcsv-dump/products-{groupId}.json (per set)
 *         data/tcgcsv-dump/prices-{groupId}.json (per set)
 *         data/tcgcsv-dump/_summary.json
 */

import { join } from "node:path";

import { createDumpDir, runDump, writeJson } from "./dump-utils.js";

const dumpDir = createDumpDir(import.meta.url, "tcgcsv");

const BASE_URL = "https://tcgcsv.com/tcgplayer";
const CATEGORY_ID = 89; // Riftbound

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  // Fetch groups (sets)
  console.log("Fetching Riftbound groups from TCGCSV...");
  const groupsData = await fetchJson(`${BASE_URL}/${CATEGORY_ID}/groups`);
  const groups = groupsData.results;

  const groupsPath = join(dumpDir, "groups.json");
  writeJson(groupsPath, groupsData);
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
    writeJson(productsPath, productsData);
    process.stdout.write(`${products.length}\n`);

    // Fetch prices
    process.stdout.write("    Prices... ");
    const pricesData = await fetchJson(`${BASE_URL}/${CATEGORY_ID}/${groupId}/prices`);
    const prices = pricesData.results || [];
    const pricesPath = join(dumpDir, `prices-${groupId}.json`);
    writeJson(pricesPath, pricesData);
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
  writeJson(summaryPath, summaryData);

  console.log(
    `\nDone: ${groups.length} groups, ${totalProducts} products, ${totalPrices} price entries`,
  );
  console.log(`Summary: ${summaryPath}`);
}

runDump(main);
