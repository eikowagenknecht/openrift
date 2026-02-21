#!/usr/bin/env node

/**
 * Fetches all card data from Riftcore's publicly readable Supabase database
 * and writes the raw JSON dump for manual exploration/comparison.
 *
 * This is NOT wired into the app's data pipeline — it outputs to a separate
 * file (riftcore.json) so it doesn't overwrite the gallery data.
 *
 * Usage: node scripts/fetch-riftcore.mjs
 *
 * Output: data/riftcore.json
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

const SUPABASE_URL = "https://qwdkezknmjggodbiqigy.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3ZGtlemtubWpnZ29kYmlxaWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk2OTM2MTIsImV4cCI6MjA3NTI2OTYxMn0.iWnIVAPjTjwSu8NGfPQVg-o0MP0jApqltCLKjEkcSVE";

/** Map Supabase set_code to display name */
const SET_NAMES = {
  OGS: "Proving Grounds",
  OGN: "Origins",
  SFD: "Spiritforged",
  "OGN-PROMO": "Origins Promos",
  "SFD-PROMO": "Spiritforged Promos",
};

/** Desired set ordering in output */
const SET_ORDER = ["OGS", "OGN", "OGN-PROMO", "SFD", "SFD-PROMO"];

/**
 * Parse the composite type field into base type + superTypes.
 * Supabase uses lowercase composite types like "champion unit", "signature spell", "token gear".
 */
function parseType(rawType) {
  const parts = rawType.split(" ");
  if (parts.length === 1) {
    return { type: capitalize(parts[0]), superTypes: [] };
  }
  // Last word is the base type, preceding words are superTypes
  const baseType = capitalize(parts.at(-1));
  const superTypes = parts.slice(0, -1).map(capitalize);
  return { type: baseType, superTypes };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Map Supabase domain array to our faction string.
 * ["fury"] → "Fury", ["fury","calm"] → "Fury/Calm", ["all"] → "Colorless"
 */
function mapFaction(domains) {
  if (!domains || domains.length === 0) {
    return "Colorless";
  }
  return domains
    .map((d) => {
      if (d === "all") {
        return "Colorless";
      }
      return capitalize(d);
    })
    .join("/");
}

/** Parse keywords from card description text (same logic as scrape-gallery.mjs) */
function parseKeywords(text) {
  const matches = text.match(/\[([A-Z][a-zA-Z\- ]+(?:\s+\d+)?)\]/g);
  if (!matches) {
    return [];
  }
  const seen = new Set();
  const keywords = [];
  for (const m of matches) {
    const kw = m.slice(1, -1);
    if (!seen.has(kw)) {
      seen.add(kw);
      keywords.push(kw);
    }
  }
  return keywords;
}

/** Parse collector number from card_number string like "001/298" → 1 */
function parseCollectorNumber(cardNumber) {
  if (!cardNumber) {
    return 0;
  }
  const num = cardNumber.split("/")[0].replaceAll(/[^0-9]/g, "");
  return Number.parseInt(num, 10) || 0;
}

/** Parse total cards in set from card_number string like "001/298" → 298 */
function parseTotalCards(cardNumber) {
  if (!cardNumber) {
    return 0;
  }
  const parts = cardNumber.split("/");
  if (parts.length < 2) {
    return 0;
  }
  return Number.parseInt(parts[1], 10) || 0;
}

/** Convert a Supabase card row to our app Card format */
function convertCard(src) {
  const { type, superTypes } = parseType(src.type);
  const collectorNumber = parseCollectorNumber(src.card_number);
  const totalInSet = parseTotalCards(src.card_number);
  const publicCode = totalInSet > 0 ? `${src.id}/${String(totalInSet).padStart(3, "0")}` : src.id;

  return {
    id: src.id,
    name: src.name,
    type,
    superTypes,
    rarity: capitalize(src.rarity),
    collectorNumber,
    faction: mapFaction(src.domain),
    stats: {
      might: src.might ?? 0,
      energy: src.rune_cost ?? 0,
      power: src.power_cost ?? 0,
    },
    keywords: parseKeywords(src.description || ""),
    description: src.description || "",
    effect: "",
    mightBonus: 0,
    set: SET_NAMES[src.set_code] || src.set_code,
    art: {
      thumbnailURL: src.image_url || "",
      fullURL: src.image_url || "",
      artist: src.artist || "",
    },
    tags: (src.tags || [])
      .filter((t) => t !== "PROMO")
      .map((t) =>
        t
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" "),
      ),
    orientation: type === "Battlefield" ? "landscape" : "portrait",
    publicCode,
    // Extra fields from Riftcore (not in gallery schema but useful)
    isPromo: src.is_promo || false,
    isAlwaysPremium: src.is_always_premium || false,
    isStandardOnly: src.is_standard_only || false,
    marketPriceUsd: src.market_price_usd,
    marketPriceFoilUsd: src.market_price_foil_usd,
    flavorText: src.flavor_text || "",
  };
}

async function fetchAllCards() {
  const url = `${SUPABASE_URL}/rest/v1/cards?select=*&order=id`;
  console.log("Fetching all cards from Riftcore Supabase...");

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase API error ${res.status}: ${body}`);
  }

  const cards = await res.json();
  console.log(`Fetched ${cards.length} cards`);
  return cards;
}

async function main() {
  const rawCards = await fetchAllCards();

  // Group by set_code
  const setMap = new Map();
  const setTotals = new Map();

  for (const raw of rawCards) {
    const setCode = raw.set_code;
    if (!setMap.has(setCode)) {
      setMap.set(setCode, []);
    }
    setMap.get(setCode).push(raw);

    // Track the max totalCards seen for each set
    const total = parseTotalCards(raw.card_number);
    if (total > (setTotals.get(setCode) || 0)) {
      setTotals.set(setCode, total);
    }
  }

  // Convert and build output
  const sets = [];
  for (const setCode of SET_ORDER) {
    const rawSetCards = setMap.get(setCode);
    if (!rawSetCards) {
      continue;
    }

    const cards = rawSetCards.map(convertCard);
    cards.sort((a, b) => a.id.localeCompare(b.id));

    sets.push({
      id: SET_NAMES[setCode] || setCode,
      name: SET_NAMES[setCode] || setCode,
      totalCards: setTotals.get(setCode) || cards.length,
      cards,
    });
  }

  // Include any sets not in SET_ORDER
  for (const [setCode, rawSetCards] of setMap) {
    if (SET_ORDER.includes(setCode)) {
      continue;
    }
    const cards = rawSetCards.map(convertCard);
    cards.sort((a, b) => a.id.localeCompare(b.id));
    sets.push({
      id: SET_NAMES[setCode] || setCode,
      name: SET_NAMES[setCode] || setCode,
      totalCards: setTotals.get(setCode) || cards.length,
      cards,
    });
  }

  const output = {
    game: "Riftbound",
    version: "1.0.0",
    lastUpdated: new Date().toISOString().split("T")[0],
    sets,
  };

  const outputPath = join(dataDir, "riftcore.json");
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  // Summary
  const totalCards = output.sets.reduce((sum, s) => sum + s.cards.length, 0);
  console.log(`\nConverted ${totalCards} cards across ${output.sets.length} sets:`);
  for (const set of output.sets) {
    const promos = set.cards.filter((c) => c.isPromo).length;
    const promoSuffix = promos > 0 ? ` (${promos} promos)` : "";
    console.log(`  ${set.id}: ${set.cards.length} cards${promoSuffix}`);
  }

  const allCards = output.sets.flatMap((s) => s.cards);
  const withPromo = allCards.filter((c) => c.isPromo).length;
  const withPrice = allCards.filter((c) => c.marketPriceUsd != null).length;
  const withFoilPrice = allCards.filter((c) => c.marketPriceFoilUsd != null).length;
  const withSuperTypes = allCards.filter((c) => c.superTypes.length > 0).length;
  console.log(`\n  ${withPromo} promos, ${withSuperTypes} with superTypes`);
  console.log(`  ${withPrice} with standard price, ${withFoilPrice} with foil price`);
  console.log(`\nWritten to ${outputPath}`);
}

main().catch((error) => {
  console.error("Fetch failed:", error.message);
  process.exit(1);
});
