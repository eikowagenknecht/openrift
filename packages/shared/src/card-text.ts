/**
 * The catalog's card-text markup, as one grammar. Rules and effect text are
 * stored with `:rb_glyph:` tokens, `[Keyword]` chips, `(reminder text)`,
 * `_italics_`, and hard line breaks, and every surface that shows card text
 * parses that same markup. Only the parse lives here — the site turns the
 * tokens into JSX chips and glyph images, the Discord bot turns them into
 * custom emojis and inline code, and each keeps its own renderer.
 */

// One pass over every construct. Ordering is load-bearing twice: glyphs come
// first so the underscores inside a `:rb_energy_1:` token cannot open an italic
// run, and parens come before italics so a glyph inside `(...)` is consumed by
// the paren instead of by a stray italic. Italic allows glyph tokens inside for
// the same reason.
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

/**
 * Parses one card-text string into its tokens. Keywords, parens and italics
 * carry their own tokenized contents, so a glyph inside a chip or a keyword
 * inside reminder text comes back as a token rather than as raw markup.
 *
 * A keyword's `name` is its contents with the glyph tokens stripped, which is
 * what identifies the keyword; `children` is the same contents tokenized, which
 * is what gets rendered.
 *
 * @returns The token stream, in source order.
 */
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

  // Merge [>] into the preceding keyword as a shape modifier (pointed right edge).
  // Merge [>>] into the following keyword as a shape modifier (pointed left edge).
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (tok.type !== "keyword") {
      continue;
    }
    if (tok.name === ">" && i > 0 && tokens[i - 1].type === "keyword") {
      (tokens[i - 1] as Extract<CardTextToken, { type: "keyword" }>).pointedRight = true;
      tokens.splice(i, 1);
    } else if (tok.name === ">>" && i < tokens.length - 1 && tokens[i + 1].type === "keyword") {
      (tokens[i + 1] as Extract<CardTextToken, { type: "keyword" }>).pointedLeft = true;
      tokens.splice(i, 1);
    }
  }

  return tokens;
}
