#!/usr/bin/env node

/**
 * Scrapes the Riftbound card gallery page and converts it into the
 * gallery.json format used by the app.
 *
 * This is the primary data source — it replaces both source.json/content.json
 * and gallery-extra.json with a single, richer dataset.
 *
 * Usage: node packages/shared/scripts/scrape-gallery.mjs
 *
 * Output: packages/shared/data/gallery.json
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { galleryCardSchema } from "../src/schemas.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

const GALLERY_URL = "https://riftbound.leagueoflegends.com/en-us/card-gallery/";

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

async function scrape() {
  console.log(`Fetching ${GALLERY_URL} ...`);
  const res = await fetch(GALLERY_URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const html = await res.text();

  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match) {
    throw new Error("Could not find __NEXT_DATA__ script tag in the page");
  }

  const nextData = JSON.parse(match[1]);
  const blades = nextData.props?.pageProps?.page?.blades ?? [];
  const galleryBlade = blades.find((b) => b.type === "riftboundCardGallery");
  const cards = galleryBlade?.cards?.items;
  if (!cards || cards.length === 0) {
    throw new Error("Could not find riftboundCardGallery blade in __NEXT_DATA__");
  }

  console.log(`Found ${cards.length} cards in gallery data`);

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

  const outputPath = join(dataDir, "gallery.json");
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

scrape().catch((error) => {
  console.error("Scrape failed:", error.message);
  process.exit(1);
});
