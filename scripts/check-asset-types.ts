/* oxlint-disable import/no-nodejs-modules -- standalone script */
/**
 * An extension missing from the deployed nginx's mime.types is served as
 * application/octet-stream, which the browser refuses to run as a module or
 * wasm. Before adding an extension, check
 * `docker run --rm nginx:<tag> grep <ext> /etc/nginx/mime.types` and add a
 * `types` entry to nginx/web.conf if it's missing.
 */

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const TYPED_EXTENSIONS = new Set([
  // `mjs` is not in nginx's mime.types; it's mapped by nginx/web.conf.
  "js",
  "mjs",
  "css",
  "wasm",
  "bin",
  "json",
  "map",
  "md",
  "onnx",
  "txt",
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
