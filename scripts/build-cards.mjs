#!/usr/bin/env node

/**
 * Transforms the raw gallery dump into cards.json for the app.
 *
 * Reads the raw card data dumped by dump-gallery.mjs, validates each card
 * against the Zod schema, converts to the app format, and writes cards.json.
 *
 * Usage: node scripts/build-cards.mjs
 *
 * Reads:  data/gallery-dump/cards.json
 * Output: data/cards.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { galleryCardSchema } from "../packages/shared/src/schemas.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const dataDir = join(rootDir, "data");
const dumpPath = join(dataDir, "gallery-dump", "cards.json");

function stripHtml(html) {
  return html
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .trim();
}

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

function convertCard(src) {
  const id = src.publicCode.split("/")[0];
  const type = src.cardType.type[0]?.label ?? "Unit";
  const superTypes = (src.cardType.superType ?? []).map((s) => s.label);
  const rarity = src.rarity.value.label;
  const faction = src.domain.values.map((d) => d.label).join("/");

  const stats = {
    might: src.might?.value.id ?? 0,
    energy: src.energy?.value.id ?? 0,
    power: src.power?.value.id ?? 0,
  };

  const description = stripHtml(src.text.richText.body);
  const effect = src.effect ? stripHtml(src.effect.richText.body) : "";
  const mightBonus = src.mightBonus?.value.id ?? 0;

  const keywords = [...new Set([...parseKeywords(description), ...parseKeywords(effect)])];

  const art = {
    thumbnailURL: src.cardImage.url,
    fullURL: src.cardImage.url,
    artist: src.illustrator.values.map((a) => a.label).join(", "),
  };

  const setName = src.set.value.label;
  const tags = src.tags?.tags ?? [];

  return {
    id,
    name: src.name,
    type,
    superTypes,
    rarity,
    collectorNumber: src.collectorNumber,
    faction,
    stats,
    keywords,
    description,
    effect,
    mightBonus,
    set: setName,
    art,
    tags,
    orientation: src.orientation,
    publicCode: src.publicCode,
  };
}

function main() {
  const dump = JSON.parse(readFileSync(dumpPath, "utf-8"));
  const cards = dump.cards;
  console.log(`Loaded ${cards.length} raw cards from gallery dump`);

  // Validate each card against the schema
  const validated = [];
  const errors = [];
  for (const raw of cards) {
    const result = galleryCardSchema.safeParse(raw);
    if (result.success) {
      validated.push(result.data);
    } else {
      const id = raw.publicCode?.split("/")[0] ?? raw.name ?? "unknown";
      errors.push({ id, issues: result.error.issues });
    }
  }
  if (errors.length > 0) {
    console.warn(`${errors.length} cards failed validation:`);
    for (const e of errors.slice(0, 5)) {
      console.warn(
        `  ${e.id}: ${e.issues.map((i) => `${i.path.join(".")} - ${i.message}`).join(", ")}`,
      );
    }
    if (errors.length > 5) {
      console.warn(`  ...and ${errors.length - 5} more`);
    }
  }
  console.log(`Validated ${validated.length}/${cards.length} cards`);

  // Group cards by set, preserving order of first appearance
  const setOrder = [];
  const setMap = new Map();

  for (const raw of validated) {
    const setId = raw.set.value.id;
    if (!setMap.has(setId)) {
      setOrder.push(setId);
      const totalCards = Number.parseInt(raw.publicCode.split("/")[1], 10) || 0;
      setMap.set(setId, {
        id: raw.set.value.label,
        name: raw.set.value.label,
        totalCards,
        cards: [],
      });
    }
    setMap.get(setId).cards.push(convertCard(raw));
  }

  // Sort cards within each set by collector number
  for (const set of setMap.values()) {
    set.cards.sort((a, b) => a.collectorNumber - b.collectorNumber);
  }

  const output = {
    game: "Riftbound",
    version: "1.0.0",
    lastUpdated: new Date().toISOString().split("T")[0],
    sets: setOrder
      .map((code) => setMap.get(code))
      .sort((a, b) => {
        const order = ["Proving Grounds", "Origins", "Spiritforged"];
        const ai = order.indexOf(a.name);
        const bi = order.indexOf(b.name);
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
      }),
  };

  const outputPath = join(dataDir, "cards.json");
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  // Summary
  const totalCards = output.sets.reduce((sum, s) => sum + s.cards.length, 0);
  console.log(`Converted ${totalCards} cards across ${output.sets.length} sets:`);
  for (const set of output.sets) {
    console.log(`  ${set.id}: ${set.cards.length} cards`);
  }

  const allCards = output.sets.flatMap((s) => s.cards);
  const withSuperTypes = allCards.filter((c) => c.superTypes.length > 0).length;
  const withTags = allCards.filter((c) => c.tags.length > 0).length;
  const withEffect = allCards.filter((c) => c.effect).length;
  const withMightBonus = allCards.filter((c) => c.mightBonus > 0).length;
  console.log(`  ${withSuperTypes} with superTypes, ${withTags} with tags`);
  console.log(`  ${withEffect} with effect, ${withMightBonus} with mightBonus`);
  console.log(`Written to ${outputPath}`);
}

main();
