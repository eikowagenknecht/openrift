/**
 * Card text markup → Discord markdown. The catalog stores rules and effect
 * text in the site's own markup: `:rb_glyph:` tokens, `[Keyword]` chips,
 * `_reminder text_`, and `[>]` / `[>>]` chip-shape markers. The site renders
 * those as icons and shaped chips; Discord gets custom emojis for the glyphs
 * (see `glyph-emoji.ts`) and inline code for the keywords, which is the
 * closest it has to the site's chip.
 */

import type { GlyphEmojis } from "./glyph-emoji.js";

// One pass over all three constructs, glyphs first: the site's tokenizer is
// ordered the same way, and it is what keeps the underscores inside a
// `:rb_energy_1:` token from opening an italic run.
//
// - glyph: `:rb_might:`, rendered as a custom emoji
// - keyword: `[Reaction]` chips, plus the bare `[>]` / `[>>]` shape markers the
//   site merges into the neighbouring chip (Discord has no chip shapes — drop)
// - italic: reminder text `_(...)_`, rewritten to `*...*` rather than left
//   alone, because Discord's `_..._` italics need a word boundary at the
//   closing underscore that an emoji mention right before it doesn't give
const TOKEN_PATTERN = /:rb_(?<glyph>\w+):|\[(?<keyword>[^\]]+)\]|_(?<italic>(?::rb_\w+:|[^_])+)_/gu;

const ENERGY_PATTERN = /^energy_(?<amount>\d+)$/u;
const RUNE_PATTERN = /^rune_(?<domain>\w+)$/u;

/** Splits a keyword's contents into its text runs and its glyph tokens. */
const GLYPH_SPLIT_PATTERN = /(?<glyph>:rb_\w+:)/gu;
const GLYPH_ONLY_PATTERN = /^:rb_(?<name>\w+):$/u;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The words a glyph falls back to when the app has no emoji for it — an
 * un-uploaded emoji set degrades to readable text instead of raw `:rb_x:`
 * tokens.
 *
 * @returns The plain-text stand-in for one glyph token.
 */
export function glyphFallback(name: string): string {
  const energy = ENERGY_PATTERN.exec(name);
  if (energy) {
    return `${energy[1]} energy`;
  }
  const rune = RUNE_PATTERN.exec(name);
  if (rune) {
    return `${capitalize(rune[1])} rune`;
  }
  return capitalize(name);
}

/**
 * One keyword chip as inline code. A chip can carry a glyph of its own
 * (`[Repeat :rb_energy_2:]`), and Discord prints anything inside a code span
 * literally — so the chip breaks around the glyph rather than swallowing the
 * emoji mention.
 *
 * @returns The chip, code-spanned text runs and emojis alternating.
 */
function keywordChip(keyword: string, emojis: GlyphEmojis): string {
  return keyword
    .split(GLYPH_SPLIT_PATTERN)
    .map((part) => {
      const glyph = GLYPH_ONLY_PATTERN.exec(part);
      if (glyph) {
        return emojis.get(glyph[1]) ?? glyphFallback(glyph[1]);
      }
      const text = part.trim();
      return text.length > 0 ? `\`${text}\`` : "";
    })
    .filter((part) => part.length > 0)
    .join(" ");
}

// Reminder text can hold glyphs and keywords of its own, so its contents go
// through another pass.
function render(text: string, emojis: GlyphEmojis): string {
  return text.replace(
    TOKEN_PATTERN,
    (
      _match,
      glyph: string | undefined,
      keyword: string | undefined,
      italic: string | undefined,
    ) => {
      if (glyph !== undefined) {
        return emojis.get(glyph) ?? glyphFallback(glyph);
      }
      if (keyword !== undefined) {
        return keyword === ">" || keyword === ">>" ? "" : keywordChip(keyword, emojis);
      }
      return `*${render(italic ?? "", emojis)}*`;
    },
  );
}

/**
 * Renders one card-text string as Discord markdown: glyph tokens become the
 * app's custom emojis (or their plain-text fallback), keyword chips become
 * bold, reminder text stays italic, and the chip-shape markers are dropped.
 *
 * @returns The Discord-ready text.
 */
export function formatCardText(text: string, emojis: GlyphEmojis): string {
  return render(text, emojis).trim();
}
