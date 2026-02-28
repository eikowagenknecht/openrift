#!/usr/bin/env tsx

/**
 * Merges tcgcsv dump data with gallery card IDs to produce prices.json.
 *
 * Matches gallery cards to tcgcsv products by stripping the set prefix from
 * the gallery publicCode and looking up the tcgcsv Number extended data field.
 * Manual overrides in price-overrides.json handle cases where auto-matching fails.
 *
 * Usage: bun scripts/build-prices.ts
 *
 * Reads:  data/cards.json
 *         data/tcgcsv-dump/products-{groupId}.json
 *         data/tcgcsv-dump/prices-{groupId}.json
 *         scripts/price-overrides.json
 *
 * Output: data/prices.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const dumpDir = join(rootDir, "data", "tcgcsv-dump");
const outDir = join(rootDir, "data");

// Gallery set name → tcgcsv groupId
const SET_GROUP_MAP = {
  "Proving Grounds": 24439,
  Origins: 24344,
  Spiritforged: 24519,
};

function loadJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function main() {
  // 1. Load gallery
  const galleryPath = join(rootDir, "data", "cards.json");
  const gallery = loadJson(galleryPath);
  console.log(`Loaded gallery: ${gallery.sets.length} sets`);

  // 2. Load overrides
  const overridesPath = join(__dirname, "price-overrides.json");
  const overrides = existsSync(overridesPath) ? loadJson(overridesPath) : {};
  console.log(`Loaded ${Object.keys(overrides).length} price overrides`);

  // 3. Load summary for fetchedAt timestamp
  const summaryPath = join(dumpDir, "_summary.json");
  const summary = loadJson(summaryPath);

  // 4. For each tcgcsv group, build number→product map, productId→product map, and productId→prices map
  const numberMaps = new Map(); // groupId → Map<numberString, product>
  const productById = new Map(); // productId → product (flat, across all groups)
  const priceMaps = new Map(); // groupId → Map<productId, priceEntries[]>

  for (const [setName, groupId] of Object.entries(SET_GROUP_MAP)) {
    // Build number→product map
    const productsData = loadJson(join(dumpDir, `products-${groupId}.json`));
    const products = productsData.results || [];
    const numberMap = new Map();

    for (const product of products) {
      productById.set(product.productId, product);
      const numberField = product.extendedData.find((e) => e.name === "Number");
      if (numberField) {
        // Don't overwrite if already exists (first wins) — overrides handle conflicts
        if (!numberMap.has(numberField.value)) {
          numberMap.set(numberField.value, product);
        }
      }
    }

    numberMaps.set(groupId, numberMap);
    console.log(`  ${setName} (group ${groupId}): ${numberMap.size} products with Number`);

    // Build productId→prices map
    const pricesData = loadJson(join(dumpDir, `prices-${groupId}.json`));
    const prices = pricesData.results || [];
    const priceMap = new Map();

    for (const price of prices) {
      if (!priceMap.has(price.productId)) {
        priceMap.set(price.productId, []);
      }
      priceMap.get(price.productId).push(price);
    }

    priceMaps.set(groupId, priceMap);
  }

  // 5. Match gallery cards to tcgcsv products
  const cards = {};
  const unmatched = [];
  let matched = 0;

  for (const set of gallery.sets) {
    const groupId = SET_GROUP_MAP[set.name];
    if (groupId === undefined) {
      console.log(`  Skipping set "${set.name}" — no tcgcsv group mapping`);
      continue;
    }

    const numberMap = numberMaps.get(groupId);
    const priceMap = priceMaps.get(groupId);

    for (const card of set.cards) {
      const cardId = card.id;
      let product = null;

      // Check overrides first
      if (overrides[cardId]) {
        const overrideProductId = overrides[cardId].productId;
        product = productById.get(overrideProductId) || null;
      } else {
        // Strip set prefix from publicCode to get the number string
        const numberString = card.publicCode.replace(/^[A-Z]+-/, "");
        product = numberMap.get(numberString);
      }

      if (!product) {
        unmatched.push(cardId);
        continue;
      }

      // Look up prices for this product
      const priceEntries = priceMap.get(product.productId) || [];
      const cardPrices = {
        productId: product.productId,
        url: product.url || null,
      };

      for (const entry of priceEntries) {
        const subType = entry.subTypeName === "Foil" ? "foil" : "normal";
        cardPrices[subType] = {
          low: entry.lowPrice,
          mid: entry.midPrice,
          high: entry.highPrice,
          market: entry.marketPrice,
          directLow: entry.directLowPrice,
        };
      }

      cards[cardId] = cardPrices;
      matched++;
    }
  }

  // 6. Write output
  const output = {
    source: "tcgcsv.com",
    fetchedAt: summary.fetchedAt,
    cards,
    unmatched,
  };

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "prices.json");
  writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`\nDone: ${matched} matched, ${unmatched.length} unmatched`);
  console.log(`Output: ${outPath}`);
  if (unmatched.length > 0) {
    console.log(`Unmatched: ${unmatched.join(", ")}`);
  }
}

main();
