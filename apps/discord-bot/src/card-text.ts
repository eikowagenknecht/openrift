/**
 * Card text markup → Discord markdown. The catalog stores rules and effect
 * text in the site's own markup: `:rb_glyph:` tokens, `[Keyword]` chips,
 * `_reminder text_`, and `[>]` / `[>>]` chip-shape markers. Parsing that markup
 * is `tokenizeCardText` from `@openrift/shared`, the same one the site renders
 * from; what lives here is only the Discord half — custom emojis for the glyphs
 * (see `glyph-emoji.ts`) and inline code for the keywords, which is the closest
 * it has to the site's chip.
 */

import type { CardTextToken } from "@openrift/shared";
import { tokenizeCardText } from "@openrift/shared";

import type { GlyphEmojis } from "./glyph-emoji.js";

const ENERGY_PATTERN = /^energy_(?<amount>\d+)$/u;
const RUNE_PATTERN = /^rune_(?<domain>\w+)$/u;

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
 * literally — so the chip breaks around the glyph, at whatever depth it sits,
 * rather than swallowing the emoji mention. The runs between the glyphs are
 * spanned as the catalog wrote them: a code span is already literal, so
 * re-rendering markup inside one would only leak stray asterisks.
 *
 * @returns The chip, code-spanned text runs and emojis alternating.
 */
function keywordChip(children: CardTextToken[], emojis: GlyphEmojis): string {
  const parts: string[] = [];
  let run = "";

  function flushRun(): void {
    const text = run.trim();
    if (text.length > 0) {
      parts.push(`\`${text}\``);
    }
    run = "";
  }

  function walk(tokens: CardTextToken[]): void {
    for (const token of tokens) {
      switch (token.type) {
        case "glyph": {
          flushRun();
          parts.push(emojis.get(token.name) ?? glyphFallback(token.name));
          break;
        }
        case "text": {
          run += token.value;
          break;
        }
        case "newline": {
          run += "\n";
          break;
        }
        case "keyword": {
          run += "[";
          walk(token.children);
          run += "]";
          break;
        }
        case "paren": {
          run += "(";
          walk(token.children);
          run += ")";
          break;
        }
        case "italic": {
          run += "_";
          walk(token.children);
          run += "_";
          break;
        }
      }
    }
  }

  walk(children);
  flushRun();
  return parts.filter((part) => part.length > 0).join(" ");
}

/**
 * One token as Discord markdown.
 *
 * @returns The rendered text, empty for anything Discord cannot express.
 */
function renderToken(token: CardTextToken, emojis: GlyphEmojis): string {
  switch (token.type) {
    case "text": {
      return token.value;
    }
    case "newline": {
      return "\n";
    }
    case "glyph": {
      return emojis.get(token.name) ?? glyphFallback(token.name);
    }
    case "keyword": {
      // The chip-shape markers: the site angles the neighbouring chip's edge,
      // Discord has no chip shapes. A marker the tokenizer folded into its
      // neighbour is already gone from the stream; a stray one is dropped here.
      return token.name === ">" || token.name === ">>" ? "" : keywordChip(token.children, emojis);
    }
    case "paren": {
      // Reminder text the catalog parenthesised rather than underscored: the
      // site italicises it, Discord keeps the parens and the text plain, which
      // is what the markup itself already said.
      return `(${renderTokens(token.children, emojis)})`;
    }
    case "italic": {
      // Rewritten to `*...*` rather than left alone, because Discord's `_..._`
      // italics need a word boundary at the closing underscore that an emoji
      // mention right before it doesn't give.
      return `*${renderTokens(token.children, emojis)}*`;
    }
  }
}

function renderTokens(tokens: CardTextToken[], emojis: GlyphEmojis): string {
  return tokens.map((token) => renderToken(token, emojis)).join("");
}

/**
 * Renders one card-text string as Discord markdown: glyph tokens become the
 * app's custom emojis (or their plain-text fallback), keyword chips become
 * inline code, reminder text stays italic, and the chip-shape markers are
 * dropped.
 *
 * @returns The Discord-ready text.
 */
export function formatCardText(text: string, emojis: GlyphEmojis): string {
  return renderTokens(tokenizeCardText(text), emojis).trim();
}
