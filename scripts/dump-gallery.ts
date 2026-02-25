#!/usr/bin/env tsx

/**
 * Dumps raw card data from the official Riftbound card gallery page.
 *
 * Fetches the gallery HTML, extracts the __NEXT_DATA__ JSON payload,
 * and saves the raw card items to disk.
 *
 * Usage: pnpm tsx scripts/dump-gallery.ts
 *
 * Output: data/gallery-dump/cards.json
 */

import { join } from "node:path";

import { createDumpDir, runDump, writeJson } from "./dump-utils.js";

const dumpDir = createDumpDir(import.meta.url, "gallery");

const GALLERY_URL = "https://riftbound.leagueoflegends.com/en-us/card-gallery/";

async function main() {
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

  const output = {
    source: "riftbound.leagueoflegends.com",
    fetchedAt: new Date().toISOString(),
    totalCards: cards.length,
    cards,
  };

  const outPath = join(dumpDir, "cards.json");
  writeJson(outPath, output);

  console.log(`Dumped ${cards.length} raw cards`);
  console.log(`Written to ${outPath}`);
}

runDump(main);
