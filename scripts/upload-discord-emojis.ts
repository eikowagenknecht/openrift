/**
 * Uploads the card-text glyphs as application-owned emojis of a Discord app,
 * so the bot can render `:rb_might:` and friends as icons instead of words.
 * Application emojis work in every server the app is in — no per-guild upload.
 *
 * Run once per Discord application (dev and prod have separate tokens):
 *
 *   bun run discord:emojis              # uses DISCORD_BOT_TOKEN from .env
 *   bun run discord:emojis -- --dry-run # render only, upload nothing
 *   bun run discord:emojis -- --force   # re-upload, replacing existing glyphs
 *
 * The bot picks the emojis up on its next start; anything missing here falls
 * back to plain words (`1 energy`, `Might`), so a partial upload is harmless.
 */
/* oxlint-disable import/no-nodejs-modules -- standalone CLI tooling, never bundled */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { requireEnv } from "./env.js";

const API = "https://discord.com/api/v10";
const GLYPH_DIR = path.join(import.meta.dirname, "../apps/web/public/images/glyphs");

/** Discord's recommended emoji size; the 256 KB per-image cap is far away at this resolution. */
const SIZE = 128;
/** Breathing room for the outline the monochrome glyphs get. */
const PAD = 8;

// The catalog only prints energy costs up to 12. A higher one would simply
// render as "13 energy" until this range grows and the script is re-run.
const MAX_ENERGY = 12;

// Glyphs whose artwork is a flat white shape (the site recolors them per
// theme). Discord can't, so they get a dark outline that reads on both the
// light and the dark client theme.
const MONOCHROME = new Set(["might", "exhaust"]);

// Eight-way offset stamp of the dark silhouette behind the white glyph — a
// cheap dilation that needs no alpha-channel surgery.
const OUTLINE_OFFSETS = [
  [-3, 0],
  [3, 0],
  [0, -3],
  [0, 3],
  [-2, -2],
  [2, -2],
  [-2, 2],
  [2, 2],
] as const;

interface GlyphAsset {
  /** Glyph token name as it appears in card text, e.g. `rune_fury`. */
  token: string;
  png: Buffer;
}

interface ApplicationEmoji {
  id: string;
  name: string;
}

function transparent(): { r: number; g: number; b: number; alpha: number } {
  return { r: 0, g: 0, b: 0, alpha: 0 };
}

/** @returns The SVG rasterized to a transparent square PNG of the given size. */
function rasterize(svg: Buffer, size: number): Promise<Buffer> {
  return sharp(svg, { density: 600 })
    .resize(size, size, { fit: "contain", background: transparent() })
    .png()
    .toBuffer();
}

/** @returns The white glyph stamped over a dark silhouette of itself. */
async function withOutline(svg: Buffer): Promise<Buffer> {
  const glyph = await rasterize(svg, SIZE - PAD * 2);
  const silhouette = await sharp(glyph).negate({ alpha: false }).png().toBuffer();
  return sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: transparent() },
  })
    .composite([
      ...OUTLINE_OFFSETS.map(([dx, dy]) => ({ input: silhouette, left: PAD + dx, top: PAD + dy })),
      { input: glyph, left: PAD, top: PAD },
    ])
    .png()
    .toBuffer();
}

/**
 * The energy cost badge: the number in a filled disc, like the site's own
 * energy glyph. Drawn rather than rasterized — the site builds it from a
 * styled span, so there is no SVG to read.
 *
 * @returns The badge as an SVG source string.
 */
function energySvg(amount: number): string {
  const fontSize = amount > 9 ? 58 : 76;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <circle cx="64" cy="64" r="56" fill="#ffffff" stroke="#111111" stroke-width="8"/>
  <text x="64" y="64" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#111111">${amount}</text>
</svg>`;
}

/**
 * Renders every glyph the bot can meet in card text: the icon SVGs the site
 * ships (`rune-fury.svg` → token `rune_fury`, unfilled variants only — the
 * filled ones are a card-frame treatment, never a text glyph) plus one badge
 * per energy cost.
 *
 * @returns The rendered glyphs, in upload order.
 */
async function renderGlyphs(): Promise<GlyphAsset[]> {
  const entries = await readdir(GLYPH_DIR);
  const files = entries
    .filter((file) => file.endsWith(".svg") && !file.endsWith("-filled.svg"))
    .toSorted();
  const assets: GlyphAsset[] = [];
  for (const file of files) {
    const token = path.basename(file, ".svg").replaceAll("-", "_");
    const svg = await readFile(path.join(GLYPH_DIR, file));
    assets.push({
      token,
      png: MONOCHROME.has(token) ? await withOutline(svg) : await rasterize(svg, SIZE),
    });
  }
  for (let amount = 0; amount <= MAX_ENERGY; amount++) {
    assets.push({
      token: `energy_${amount}`,
      png: await sharp(Buffer.from(energySvg(amount)))
        .png()
        .toBuffer(),
    });
  }
  return assets;
}

async function discord(token: string, method: string, route: string, body?: unknown) {
  for (;;) {
    const response = await fetch(`${API}${route}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429) {
      const limit = (await response.json()) as { retry_after?: number };
      const wait = limit.retry_after ?? 1;
      console.log(`Rate limited, waiting ${wait}s`);
      await Bun.sleep(wait * 1000);
      continue;
    }
    if (!response.ok) {
      throw new Error(`${method} ${route} failed: ${response.status} ${await response.text()}`);
    }
    return response.status === 204 ? undefined : await response.json();
  }
}

const force = process.argv.includes("--force");

// Renders everything and reports, without touching the Discord application —
// the safe way to check the artwork after changing a glyph or this script.
if (process.argv.includes("--dry-run")) {
  const rendered = await renderGlyphs();
  for (const asset of rendered) {
    console.log(`  rb_${asset.token}: ${(asset.png.length / 1024).toFixed(1)} KB`);
  }
  console.log(`Dry run: ${rendered.length} glyphs rendered, nothing uploaded.`);
  process.exit(0);
}

const token = requireEnv("DISCORD_BOT_TOKEN");
const app = (await discord(token, "GET", "/applications/@me")) as { id: string; name: string };
const existing = (await discord(token, "GET", `/applications/${app.id}/emojis`)) as {
  items: ApplicationEmoji[];
};
const byName = new Map(existing.items.map((emoji) => [emoji.name, emoji]));
console.log(`Application ${app.name} (${app.id}): ${existing.items.length} emojis`);

const assets = await renderGlyphs();
let created = 0;
let skipped = 0;
for (const asset of assets) {
  const name = `rb_${asset.token}`;
  const current = byName.get(name);
  if (current && !force) {
    skipped++;
    continue;
  }
  if (current) {
    await discord(token, "DELETE", `/applications/${app.id}/emojis/${current.id}`);
  }
  await discord(token, "POST", `/applications/${app.id}/emojis`, {
    name,
    image: `data:image/png;base64,${asset.png.toString("base64")}`,
  });
  created++;
  console.log(`  ${current ? "replaced" : "created"} ${name}`);
}
console.log(`Done: ${created} uploaded, ${skipped} already present.`);
