import type { CardTextToken } from "./card-text.js";
import { tokenizeCardText } from "./card-text.js";

/**
 * The label of every `[...]` span in card text, in source order.
 *
 * Both extractors below start here, so the bracket grammar itself lives in one
 * place: `tokenizeCardText`, the parser every card-text surface already uses. A
 * keyword token's `name` is its contents with the `:rb_*:` glyphs stripped, so
 * all that is left here is dropping the parameters that follow the label
 * (`[Shield 2]` becomes `Shield`) and walking into reminder text and italics,
 * where keywords also appear (`(gain [Flying])`).
 *
 * The tokenizer folds the `[>]` / `[>>]` shape markers into the keyword they
 * decorate, so a marker attached to a keyword never surfaces as a label of its
 * own. That is what we want either way: a marker is layout, not a term.
 *
 * @returns The first whitespace-separated word of each bracketed span.
 */
function bracketLabels(text: string): string[] {
  const labels: string[] = [];

  function walk(tokens: CardTextToken[]): void {
    for (const token of tokens) {
      if (token.type === "text" || token.type === "glyph" || token.type === "newline") {
        continue;
      }
      if (token.type === "keyword") {
        // Drop trailing parameters: "Shield 2" → "Shield", "Assault 3" → "Assault".
        const label = token.name.split(/\s+/u).filter(Boolean)[0];
        if (label) {
          labels.push(label);
        }
      }
      walk(token.children);
    }
  }

  walk(tokenizeCardText(text));
  return labels;
}

/**
 * Whether a bracketed label can name a keyword at all. Pure numbers (`[3]`) and
 * single characters (`[X]`, `[>]`) are bracket contents that carry no name.
 *
 * @returns True when the label is long enough and is not just a number.
 */
function isTermLike(label: string): boolean {
  return label.length >= 2 && !/^\d+$/u.test(label);
}

/**
 * CJK text writes a keyword's parameters flush against it with no space, so the
 * whitespace split in `bracketLabels` cannot separate them. Strip trailing color
 * words, digits, symbols and Latin letters instead: 坚守2 → 坚守, 装配蓝色 → 装配,
 * 回响4蓝色 → 回响, 等级6> → 等级. A label that shrinks below two characters was a
 * color word in its own right (`[蓝色]`), so keep it as it was.
 *
 * @returns The label with any trailing parameters removed.
 */
function stripCjkParameters(label: string): string {
  if (!/[\u4E00-\u9FFF]/u.test(label)) {
    return label;
  }
  const cleaned = label
    .replace(/(?:蓝色|红色|绿色|橙色|紫色|白色|黑色)+$/u, "")
    .replace(/[A-Za-z\d>]+$/u, "");
  return cleaned.length >= 2 ? cleaned : label;
}

/**
 * Extracts all bracketed terms from card text, preserving order. Works with any
 * language (including CJK). Strips resource glyphs and numeric parameters but
 * keeps the base keyword/label. Does not deduplicate, so positional correlation
 * between languages is preserved.
 *
 * @returns Array of base keyword labels in order of appearance.
 */
export function extractBracketedTerms(text: string): string[] {
  if (!text) {
    return [];
  }
  const terms: string[] = [];
  for (const label of bracketLabels(text)) {
    // The length/number test runs before the CJK strip on purpose: a bare color
    // word is a term, and stripping it first would leave nothing to test.
    if (!isTermLike(label)) {
      continue;
    }
    terms.push(stripCjkParameters(label));
  }
  return terms;
}

/**
 * Extracts unique keywords from rules/effect text by finding bracketed terms
 * like `[Shield]` or `[Equip :rb_rune_mind:]`. Strips resource glyphs and
 * numeric parameters, returning only the base keyword name.
 *
 * Only use on English text — non-EN printings may use brackets differently.
 * @returns Array of unique keyword names found in the text.
 */
export function extractKeywords(text: string): string[] {
  if (!text) {
    return [];
  }
  const found = new Set<string>();
  for (const label of bracketLabels(text)) {
    // English keywords always contain a letter, which rules out symbol-only
    // bracket contents like `[>>]`.
    if (isTermLike(label) && /[a-zA-Z]/u.test(label)) {
      found.add(label);
    }
  }
  return [...found];
}
