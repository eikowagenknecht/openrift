// oxlint-disable-next-line import/no-nodejs-modules -- server-side static-asset reads, never reaches the browser
import { readFile } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- resolves swagger-ui-dist files from node_modules at runtime
import { createRequire } from "node:module";

import { Hono } from "hono";

import type { Variables } from "../../types.js";

// Base URL passed to the swaggerUI middleware in app.ts. The middleware appends
// `/swagger-ui-dist/<file>` to it, which is exactly the path this route serves —
// keeping the constant here ties the page's asset URLs to the route that
// answers them. Self-hosted because the site CSP only allows 'self' for
// scripts and styles, so the middleware's default jsDelivr assets are blocked.
export const SWAGGER_ASSETS_BASE_URL = "/api";

// The two files the swagger page loads, plus their source maps so devtools
// don't 404. Whitelist doubles as the content-type map and blocks traversal.
const ASSETS: Record<string, string> = {
  "swagger-ui.css": "text/css; charset=utf-8",
  "swagger-ui.css.map": "application/json",
  "swagger-ui-bundle.js": "text/javascript; charset=utf-8",
  "swagger-ui-bundle.js.map": "application/json",
};

const require = createRequire(import.meta.url);
const assetCache = new Map<string, Uint8Array<ArrayBuffer>>();

async function loadAsset(file: string): Promise<Uint8Array<ArrayBuffer>> {
  const cached = assetCache.get(file);
  if (cached) {
    return cached;
  }
  // Copied into a plain Uint8Array: Buffer is typed over ArrayBufferLike,
  // which Hono's body type rejects.
  const content = new Uint8Array(await readFile(require.resolve(`swagger-ui-dist/${file}`)));
  assetCache.set(file, content);
  return content;
}

export const swaggerAssetsRoute = new Hono<{ Variables: Variables }>().get(
  "/swagger-ui-dist/:file",
  async (c) => {
    const file = c.req.param("file");
    const contentType = ASSETS[file];
    if (!contentType) {
      return c.notFound();
    }
    const content = await loadAsset(file);
    c.header("Content-Type", contentType);
    // Unversioned URLs, but the files only change when the API is redeployed
    // with a bumped swagger-ui-dist — a day of staleness on a docs page is fine.
    c.header("Cache-Control", "public, max-age=86400");
    return c.body(content);
  },
);
