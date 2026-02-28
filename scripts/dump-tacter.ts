#!/usr/bin/env tsx

/**
 * Dumps the Tacter S3 bucket image listing for Riftbound card images.
 *
 * Tacter has no card data API, but the S3 bucket is publicly listable.
 * This script enumerates all card images and writes the listing as JSON.
 * Images are NOT downloaded — only metadata (key, size, lastModified).
 *
 * Usage: bun scripts/dump-tacter.ts
 *
 * Output: data/tacter-dump/image-listing.json
 */

import { join } from "node:path";

import { createDumpDir, runDump, writeJson } from "./dump-utils.js";

const dumpDir = createDumpDir(import.meta.url, "tacter");

const S3_URL = "https://s3.us-east-1.amazonaws.com/assets.tacter.com";
const PREFIX = "images/riftbound/cards/";
const MAX_KEYS = 1000;

/** Parse S3 ListObjectsV2 XML response */
function parseS3Listing(xml: string) {
  const contents = [];
  const regex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const key = block.match(/<Key>(.*?)<\/Key>/)?.[1] || "";
    const size = Number.parseInt(block.match(/<Size>(.*?)<\/Size>/)?.[1] || "0", 10);
    const lastModified = block.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] || "";
    contents.push({ key, size, lastModified });
  }

  const isTruncated = xml.includes("<IsTruncated>true</IsTruncated>");
  const nextToken = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/)?.[1];

  return { contents, isTruncated, nextToken };
}

async function main() {
  console.log("Listing Tacter S3 bucket for Riftbound card images...");

  const allFiles = [];
  let continuationToken = null;

  while (true) {
    let url = `${S3_URL}?list-type=2&prefix=${PREFIX}&max-keys=${MAX_KEYS}`;
    if (continuationToken) {
      url += `&continuation-token=${encodeURIComponent(continuationToken)}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const xml = await res.text();
    const { contents, isTruncated, nextToken } = parseS3Listing(xml);

    allFiles.push(...contents);
    console.log(`  Fetched ${allFiles.length} files...`);

    if (!isTruncated) break;
    continuationToken = nextToken;
  }

  // Extract card info from file keys
  const images = allFiles
    .filter((f) => f.key.match(/\.(webp|png|jpe?g)$/i))
    .map((f) => {
      const filename = f.key.split("/").pop();
      const parts = filename.replace(/\.(webp|png|jpe?g)$/i, "").split("-");
      const set = parts[0];
      const numberPart = parts.slice(1).join("-");
      return {
        key: f.key,
        filename,
        set,
        numberPart,
        size: f.size,
        lastModified: f.lastModified,
        cdnUrl: `https://assets.tacter.com/${f.key}`,
      };
    });

  const output = {
    source: "assets.tacter.com (S3)",
    fetchedAt: new Date().toISOString(),
    totalFiles: allFiles.length,
    totalImages: images.length,
    images,
  };

  const outputPath = join(dumpDir, "image-listing.json");
  writeJson(outputPath, output);

  // Summary by set
  const setMap = new Map();
  for (const img of images) {
    setMap.set(img.set, (setMap.get(img.set) || 0) + 1);
  }

  // Count variants
  const variants = images.filter((i) => i.numberPart.match(/[a-cs]$/));
  const base = images.filter((i) => !i.numberPart.match(/[a-cs]$/));

  console.log(`\nFound ${images.length} card images (${allFiles.length} total files):`);
  console.log(`  ${base.length} base, ${variants.length} variants`);

  console.log("\nSets:");
  for (const [set, count] of [...setMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${set}: ${count}`);
  }

  console.log(`\nWritten to ${outputPath}`);
  console.log("(Images not downloaded — listing only. Use CDN URLs to fetch individual images.)");
}

runDump(main);
