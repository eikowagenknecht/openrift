import type { CardTextToken } from "./card-text.js";
import { tokenizeCardText } from "./card-text.js";

/**
 * The tokenizer folds `[>]` / `[>>]` shape markers into the keyword they
 * decorate, so a marker never surfaces as a label of its own.
 */
function bracketLabels(text: string): string[] {
  const labels: string[] = [];

  function walk(tokens: CardTextToken[]): void {
    for (const token of tokens) {
      if (token.type === "text" || token.type === "glyph" || token.type === "newline") {
        continue;
      }
      if (token.type === "keyword") {
        const label = token.name.split(/\s+/u).find(Boolean);
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

function isTermLike(label: string): boolean {
  return label.length >= 2 && !/^\d+$/u.test(label);
}

/**
 * CJK writes a keyword's parameters flush against it with no space, so
 * `bracketLabels`'s whitespace split can't separate them: 坚守2 → 坚守,
 * 装配蓝色 → 装配. A label that shrinks below two characters was a color word
 * in its own right (`[蓝色]`), so it's kept as-is.
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

export function extractBracketedTerms(text: string): string[] {
  if (!text) {
    return [];
  }
  const terms: string[] = [];
  for (const label of bracketLabels(text)) {
    // Runs before the CJK strip on purpose: a bare color word is a term, and
    // stripping it first would leave nothing to test.
    if (!isTermLike(label)) {
      continue;
    }
    terms.push(stripCjkParameters(label));
  }
  return terms;
}

/** Only use on English text — non-EN printings may use brackets differently. */
export function extractKeywords(text: string): string[] {
  if (!text) {
    return [];
  }
  const found = new Set<string>();
  for (const label of bracketLabels(text)) {
    if (isTermLike(label) && /[a-zA-Z]/u.test(label)) {
      found.add(label);
    }
  }
  return [...found];
}
