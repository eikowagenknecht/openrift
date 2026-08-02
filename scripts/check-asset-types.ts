/* oxlint-disable import/no-nodejs-modules -- standalone script */
/**
 * Fail when the web build emits an asset nginx cannot give a content type.
 *
 * `apps/web/.output/public` is copied verbatim into the proxy image and served
 * from /srv/static, so any extension missing from the image's mime.types goes
 * out as `application/octet-stream`. For bytes we fetch ourselves that is
 * harmless, but the browser refuses to evaluate a module script or stream a
 * wasm binary with the wrong type, and /assets/ sends `nosniff`, so there is
 * no sniffing to fall back on. That is how one `.mjs` asset took the card
 * scanner down: the refused module import surfaced three layers away as
 * "no available backend found. ERR: [wasm] ReferenceError: window".
 *
 * Adding an extension here is meant to be a deliberate step. Check what the
 * image sends for it first:
 *
 *   docker run --rm nginx:<tag> grep <ext> /etc/nginx/mime.types
 *
 * If that finds nothing, add a `types` entry to nginx/web.conf, then list the
 * extension below.
 *
 * Usage: bun scripts/check-asset-types.ts
 */

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Extensions the deployed nginx serves with a type the browser accepts. */
const TYPED_EXTENSIONS = new Set([
  // Executed or compiled by the browser, so the type has to be right.
  // `mjs` is not in nginx's mime.types and is mapped by nginx/web.conf.
  "js",
  "mjs",
  "css",
  "wasm",
  // Fetched as bytes or text, where the type only has to not break caching.
  "bin",
  "json",
  "map",
  "md",
  "onnx",
  "txt",
  // Images and fonts.
  "avif",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
  "woff",
  "woff2",
]);

const publicDir = resolve(import.meta.dirname ?? ".", "../apps/web/.output/public");

if (!statSync(publicDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`No build output at ${publicDir}. Run \`bun run build\` first.`);
  process.exit(1);
}

const untyped = new Map<string, string[]>();
for (const entry of readdirSync(publicDir, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) {
    continue;
  }
  const dot = entry.name.lastIndexOf(".");
  const extension = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : "";
  if (TYPED_EXTENSIONS.has(extension)) {
    continue;
  }
  const relativePath = join(entry.parentPath, entry.name).slice(publicDir.length + 1);
  untyped.set(extension, [...(untyped.get(extension) ?? []), relativePath]);
}

if (untyped.size > 0) {
  console.error("Build output contains assets nginx has no content type for:\n");
  for (const [extension, files] of untyped) {
    console.error(`  .${extension || "(no extension)"}`);
    for (const file of files.slice(0, 5)) {
      console.error(`    ${file}`);
    }
    if (files.length > 5) {
      console.error(`    …and ${files.length - 5} more`);
    }
  }
  console.error(
    "\nnginx serves these as application/octet-stream, which the browser refuses" +
      "\nto execute. Add a type to nginx/web.conf if the file is loaded as code," +
      "\nthen list the extension in scripts/check-asset-types.ts.",
  );
  process.exit(1);
}

console.log(`Asset types OK (${TYPED_EXTENSIONS.size} known extensions).`);
