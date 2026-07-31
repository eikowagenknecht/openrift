import type { Client } from "discord.js";

/** Glyph token name (`might`, `energy_2`, `rune_fury`) → Discord emoji mention. */
export type GlyphEmojis = ReadonlyMap<string, string>;

/** Namespace prefix on the uploaded emoji names, so `might` can't collide with an unrelated app emoji. */
const GLYPH_EMOJI_PREFIX = "rb_";

/** Used before the first fetch and whenever the app has no emojis uploaded. */
export const NO_GLYPH_EMOJIS: GlyphEmojis = new Map();

/**
 * Reads the application-owned emojis (usable in every server the app is in,
 * no per-guild upload) and indexes the `rb_`-prefixed ones by glyph token.
 * Upload them with `bun run scripts/upload-discord-emojis.ts`; without that
 * step this map is empty and card text falls back to plain words.
 *
 * @returns The glyph token → mention map.
 */
export async function fetchGlyphEmojis(client: Client<true>): Promise<GlyphEmojis> {
  const emojis = await client.application.emojis.fetch();
  const map = new Map<string, string>();
  for (const emoji of emojis.values()) {
    if (emoji.name?.startsWith(GLYPH_EMOJI_PREFIX)) {
      map.set(emoji.name.slice(GLYPH_EMOJI_PREFIX.length), `<:${emoji.name}:${emoji.id}>`);
    }
  }
  return map;
}
