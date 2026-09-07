import { foldCached, foldForSearch, squashCached, squashForSearch } from "./search-fold.js";
import type { Printing } from "./types/catalog.js";
import type { SearchField } from "./types/search.js";
import { ALL_SEARCH_FIELDS, SEARCH_PREFIX_MAP } from "./types/search.js";
import { cardSearchAltNames } from "./utils.js";

interface ParsedSearchTerm {
  field: SearchField | null;
  text: string;
  folded: string;
  squashed: string;
}

function toTerm(field: SearchField | null, text: string): ParsedSearchTerm | null {
  const folded = foldForSearch(text);
  if (folded === "") {
    return null;
  }
  return { field, text, folded, squashed: squashForSearch(text) };
}

/** Kept as a source string so each caller builds its own stateful `g` regex; a shared instance would share `lastIndex`. */
const SEARCH_TERM_PATTERN =
  /(?:(?<prefix>id|ty|[ndktaf]):(?:"(?<quoted>[^"]*)"|(?<bare>[\S]*)))|(?:"(?<looseQuoted>[^"]*)")|(?<loose>\S+)/u
    .source;

/** Tokenizes a raw search string, supporting `n:Fireball`-style field prefixes and quoted phrases. */
export function parseSearchTerms(raw: string): ParsedSearchTerm[] {
  const terms: ParsedSearchTerm[] = [];
  const regex = new RegExp(SEARCH_TERM_PATTERN, "gu");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const groups = match.groups;
    const prefix = groups?.prefix;
    const text = (
      prefix ? (groups?.quoted ?? groups?.bare ?? "") : (groups?.looseQuoted ?? groups?.loose ?? "")
    ).trim();
    const term = text ? toTerm(prefix ? (SEARCH_PREFIX_MAP[prefix] ?? null) : null, text) : null;
    if (term) {
      terms.push(term);
    }
  }
  return terms;
}

/**
 * Unlike {@link parseSearchTerms}, this counts a prefix carrying no text yet,
 * so a half-typed `n:` already reports the name field.
 */
export function searchPrefixFields(raw: string): SearchField[] {
  const regex = new RegExp(SEARCH_TERM_PATTERN, "gu");
  const found = new Set<SearchField>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const prefix = match.groups?.prefix;
    const field = prefix ? SEARCH_PREFIX_MAP[prefix] : undefined;
    if (field) {
      found.add(field);
    }
  }
  return ALL_SEARCH_FIELDS.filter((field) => found.has(field));
}

function foldedContains(value: string | null | undefined, term: ParsedSearchTerm): boolean {
  return value ? foldCached(value).includes(term.folded) : false;
}

/**
 * As {@link foldedContains}, but also matches with separators stripped from
 * both sides. Restricted to identifier-like fields; see {@link squashForSearch}.
 */
function looselyContains(value: string | null | undefined, term: ParsedSearchTerm): boolean {
  if (!value) {
    return false;
  }
  return foldCached(value).includes(term.folded) || squashCached(value).includes(term.squashed);
}

function printingMatchesField(
  printing: Printing,
  field: SearchField,
  term: ParsedSearchTerm,
  keywordReverseMap?: Map<string, string>,
): boolean {
  const { card } = printing;
  if (field === "name") {
    return (
      looselyContains(card.name, term) ||
      looselyContains(printing.printedName, term) ||
      cardSearchAltNames(card).some((name) => looselyContains(name, term))
    );
  }
  if (field === "cardText") {
    return (
      foldedContains(card.errata?.correctedRulesText, term) ||
      foldedContains(card.errata?.correctedEffectText, term) ||
      foldedContains(printing.printedRulesText, term) ||
      foldedContains(printing.printedEffectText, term)
    );
  }
  if (field === "keywords") {
    if (card.keywords.some((kw) => looselyContains(kw, term))) {
      return true;
    }
    if (keywordReverseMap) {
      const canonical = keywordReverseMap.get(term.folded);
      if (canonical) {
        const foldedCanonical = foldForSearch(canonical);
        return card.keywords.some((kw) => foldCached(kw) === foldedCanonical);
      }
    }
    return false;
  }
  if (field === "tags") {
    return card.tags.some((tag) => looselyContains(tag, term));
  }
  if (field === "artist") {
    return looselyContains(printing.artist, term);
  }
  if (field === "flavorText") {
    return foldedContains(printing.flavorText, term);
  }
  if (field === "type") {
    return (
      card.types.some((t) => looselyContains(t, term)) ||
      card.superTypes.some((st) => looselyContains(st, term))
    );
  }
  return looselyContains(printing.shortCode, term) || looselyContains(printing.publicCode, term);
}

export function matchesSearch(
  printing: Printing,
  terms: ParsedSearchTerm[],
  hasPrefixes: boolean,
  searchScope: SearchField[],
  keywordReverseMap?: Map<string, string>,
): boolean {
  if (terms.length === 0) {
    return true;
  }
  return terms.every((term) => {
    if (term.field) {
      return printingMatchesField(printing, term.field, term, keywordReverseMap);
    }
    // Un-prefixed terms widen to all fields when any prefix is present (e.g. "n:Dragon fire"
    // searches "fire" everywhere), but respect the user's search scope when no prefixes are used.
    const fields = hasPrefixes ? ALL_SEARCH_FIELDS : searchScope;
    return fields.some((f) => printingMatchesField(printing, f, term, keywordReverseMap));
  });
}
