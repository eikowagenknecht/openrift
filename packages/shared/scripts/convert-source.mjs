#!/usr/bin/env node

/**
 * Converts Riftbound source data (from the official API/gist) into the
 * content.json format used by the app (matches riftbound-content-api.schema.json).
 *
 * Usage: node packages/shared/scripts/convert-source.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

const source = JSON.parse(readFileSync(join(dataDir, "source.json"), "utf8"));

// Manual set name overrides (the source returns "SFD" as setName for Spiritforged)
const SET_NAME_MAP = {
  SFD: "Spiritforged",
};

function stripHtml(html) {
  return html
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .trim();
}

function convertCard(src) {
  // ID: first part of publicCode e.g. "OGN-001" from "OGN-001/298"
  const id = src.publicCode.split("/")[0];

  // Type: first cardType label
  const type = src.cardType[0]?.label ?? "Unit";

  // Rarity
  const rarity = src.rarity.label;

  // Faction: join domain labels with "/"
  const faction = src.domains.map((d) => d.label).join("/");

  // Stats: source only has energy and power; map energy → cost as well
  // since energy is the play cost in Riftbound
  const stats = {
    cost: src.energy ?? 0,
    might: 0,
    energy: src.energy ?? 0,
    power: src.power ?? 0,
  };

  // Description: strip HTML tags from text
  const description = stripHtml(src.text ?? "");

  // Art
  const art = {
    thumbnailURL: src.cardImage?.url ?? "",
    fullURL: src.cardImage?.url ?? "",
    artist: (src.illustrator ?? []).join(", "),
  };

  // Set name: use override or source setName
  const setName = SET_NAME_MAP[src.set] ?? src.setName;

  return {
    id,
    name: src.name,
    type,
    rarity,
    collectorNumber: src.collectorNumber,
    faction,
    stats,
    keywords: [],
    description,
    flavorText: "",
    set: setName,
    art,
    tags: [],
  };
}

// Group cards by set code, preserving order of first appearance
const setOrder = [];
const setMap = new Map();

for (const card of source) {
  if (!setMap.has(card.set)) {
    setOrder.push(card.set);
    setMap.set(card.set, {
      code: card.set,
      name: SET_NAME_MAP[card.set] ?? card.setName,
      cards: [],
    });
  }
  setMap.get(card.set).cards.push(convertCard(card));
}

// Sort cards within each set by collector number
for (const set of setMap.values()) {
  set.cards.sort((a, b) => a.collectorNumber - b.collectorNumber);
}

const output = {
  game: "Riftbound",
  version: "1.0.0",
  lastUpdated: new Date().toISOString().split("T")[0],
  sets: setOrder.map((code) => {
    const set = setMap.get(code);
    return {
      id: set.name,
      name: set.name,
      cards: set.cards,
    };
  }),
};

const outputPath = join(dataDir, "content.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

// Summary
const totalCards = output.sets.reduce((sum, s) => sum + s.cards.length, 0);
console.log(`Converted ${totalCards} cards across ${output.sets.length} sets:`);
for (const set of output.sets) {
  console.log(`  ${set.id}: ${set.cards.length} cards`);
}
console.log(`Written to ${outputPath}`);
