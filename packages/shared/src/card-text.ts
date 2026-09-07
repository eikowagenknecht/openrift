/**
 * Only the parse of the catalog's card-text markup lives here; each surface
 * (site, Discord bot) keeps its own renderer for the resulting tokens.
 */

// Ordering is load-bearing: glyphs must precede italics (an italic run can't
// swallow a glyph's underscores), and parens must precede italics.
const TOKEN_PATTERN =
  /:rb_(?<glyph>\w+):|\[(?<keyword>[^\]]+)\]|\((?<paren>[^)]+)\)|_(?<italic>(?::rb_\w+:|[^_])+)_|\n/gu;

export type CardTextToken =
  | { type: "text"; value: string }
  | { type: "glyph"; name: string }
  | {
      type: "keyword";
      name: string;
      children: CardTextToken[];
      pointedRight?: boolean;
      pointedLeft?: boolean;
    }
  | { type: "paren"; children: CardTextToken[] }
  | { type: "italic"; children: CardTextToken[] }
  | { type: "newline" };

/** A keyword's `name` is its contents with glyph tokens stripped; `children` is the same contents tokenized. */
export function tokenizeCardText(text: string): CardTextToken[] {
  const tokens: CardTextToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      tokens.push({ type: "glyph", name: match[1] });
    } else if (match[2]) {
      const raw = match[2];
      const name = raw.replaceAll(/:rb_\w+:/gu, "").trim();
      tokens.push({ type: "keyword", name, children: tokenizeCardText(raw) });
    } else if (match[3]) {
      tokens.push({ type: "paren", children: tokenizeCardText(match[3]) });
    } else if (match[4]) {
      tokens.push({ type: "italic", children: tokenizeCardText(match[4]) });
    } else {
      tokens.push({ type: "newline" });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (tok?.type !== "keyword") {
      continue;
    }
    const previous = tokens[i - 1];
    const next = tokens[i + 1];
    if (tok.name === ">" && previous?.type === "keyword") {
      previous.pointedRight = true;
      tokens.splice(i, 1);
    } else if (tok.name === ">>" && next?.type === "keyword") {
      next.pointedLeft = true;
      tokens.splice(i, 1);
    }
  }

  return tokens;
}
