import type { Client } from "discord.js";

export type GlyphEmojis = ReadonlyMap<string, string>;

const GLYPH_EMOJI_PREFIX = "rb_";

export const NO_GLYPH_EMOJIS: GlyphEmojis = new Map();

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
