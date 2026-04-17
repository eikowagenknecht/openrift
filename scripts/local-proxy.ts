// Reverse proxy for `bun run start` so /api/* reaches the API server and
// /media/* streams from disk. Mirrors nginx's role in prod (see nginx/web.conf).
// Not used by `bun dev` — that uses Vite's server.proxy and a dev-only
// /media middleware (see apps/web/vite.config.ts).

// oxlint-disable-next-line import/no-nodejs-modules -- script runs in Bun
import { readFile } from "node:fs/promises";
// oxlint-disable-next-line import/no-nodejs-modules -- script runs in Bun
import path from "node:path";

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 5173);
const WEB_TARGET = process.env.WEB_TARGET ?? "http://localhost:5174";
const API_TARGET = process.env.API_TARGET ?? "http://localhost:3000";
const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR ?? path.join(import.meta.dir, "..", "media"));

const MEDIA_MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

async function serveMedia(pathname: string): Promise<Response> {
  const relative = decodeURIComponent(pathname.slice("/media/".length));
  const resolved = path.resolve(MEDIA_DIR, relative);
  if (!resolved.startsWith(`${MEDIA_DIR}${path.sep}`)) {
    return new Response("Forbidden", { status: 403 });
  }
  let buffer: Buffer;
  try {
    buffer = await readFile(resolved);
  } catch {
    return new Response("Not Found", { status: 404 });
  }
  const bytes = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(bytes).set(buffer);
  const mime = MEDIA_MIME[path.extname(resolved).toLowerCase()] ?? "application/octet-stream";
  return new Response(new Blob([bytes], { type: mime }), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

const server = Bun.serve({
  port: PROXY_PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/media/")) {
      return serveMedia(url.pathname);
    }
    const base = url.pathname.startsWith("/api/") ? API_TARGET : WEB_TARGET;
    return fetch(`${base}${url.pathname}${url.search}`, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      redirect: "manual",
    });
  },
});

// oxlint-disable-next-line no-console -- local dev aid, single startup line
console.log(
  `[local-proxy] :${server.port} → /api/* ${API_TARGET}, /media/* ${MEDIA_DIR}, * ${WEB_TARGET}`,
);
