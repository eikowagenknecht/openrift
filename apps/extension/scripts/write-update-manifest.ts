/* oxlint-disable import/no-nodejs-modules -- standalone script */
/**
 * Writes the Firefox update manifest for a signed build.
 *
 * Usage: bun scripts/write-update-manifest.ts <signed.xpi> <out.json>
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { buildUpdateManifest, xpiDownloadUrl } from "../src/lib/firefox-distribution";

const [xpiArg, outArg] = process.argv.slice(2);

if (xpiArg === undefined || outArg === undefined) {
  console.error("Usage: bun scripts/write-update-manifest.ts <signed.xpi> <out.json>");
  process.exit(1);
}

const packageJsonPath = resolve(import.meta.dirname ?? ".", "../package.json");
const { version } = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version: string };

const xpiPath = resolve(xpiArg);
const xpiBytes = readFileSync(xpiPath);
const sha256 = createHash("sha256").update(xpiBytes).digest("hex");
const fileName = basename(xpiPath);

const manifest = buildUpdateManifest({
  version,
  xpiUrl: xpiDownloadUrl(version, fileName),
  sha256,
});

writeFileSync(resolve(outArg), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Update manifest for ${version} written to ${outArg}`);
console.log(`  xpi:    ${fileName} (${(xpiBytes.length / 1024).toFixed(1)} KiB)`);
console.log(`  sha256: ${sha256}`);
