/**
 * Formats a rule number for display by stripping trailing dots.
 *
 * @returns Cleaned rule number string.
 */
export function formatRuleNumber(ruleNumber: string): string {
  return ruleNumber.replace(/\.$/u, "");
}

// Rule references inside rule body text. Three forms:
//   - "rule N" / "Rule N" / "rules N" → same-page anchor (#rule-N)
//   - bare "N.M…" with at least one dot, starting at 3 digits → same-page anchor
//   - "CR N" → cross-link to the core rules page
//
// The number's tail is constrained: digits, optional `.digit` segments,
// optional single `.letter` segment, optional final `.digit`. This keeps
// matches from bleeding into the next sentence (e.g. "rule 540.4.b. Continue"
// matches "540.4.b", not "540.4.b.C…").
export const RULE_REFERENCE_REGEX =
  /(?:\b(?<keyword>[Rr]ules?|CR)\s+(?<dotted>\d+(?:\.\d+)*(?:\.[a-z](?:\.\d+)?)?)|\b(?<bare>\d{3}(?:\.\d+)+(?:\.[a-z](?:\.\d+)?)?))/gu;

// Game terms that get auto-linked when they appear in italics. Three sources:
//   - Subtitles (depth-0 section headings: "Game Objects" → 120, "Combat" → 454)
//   - Text rules whose body is a Title Case `*Term*` phrase (verbs like
//     "*Stun*" → 423, keyword glossary entries like "*Accelerate*" → 805,
//     multi-word terms like "*Battlefield Zone*" → 107.2)
//   - Depth-0 text rules whose body is plain Title Case (no italics) acting
//     as section headings — "Passive Abilities" → 363, "Replacement Effects"
//     → 367. These are styled as headings in the source but stored without
//     asterisks, so we detect them structurally.
// Later passes override earlier ones: italic terms beat heading-style ones,
// and subtitles override everything.
const TITLE_WORD = "[A-Z][A-Za-z0-9-]*";
const HEADING_STOP_WORD = "(?:of|or|the|and|to|a|an)";
const TITLE_CASE_PHRASE = `${TITLE_WORD}(?:\\s+(?:${TITLE_WORD}|${HEADING_STOP_WORD}))*`;
const TERM_DEFINITION_REGEX = new RegExp(`^\\*(${TITLE_CASE_PHRASE})\\*\\.?$`, "u");
const HEADING_TEXT_REGEX = new RegExp(`^${TITLE_CASE_PHRASE}$`, "u");

function addTermAnchor(map: Map<string, string>, term: string, ruleNumber: string): void {
  const key = term.toLowerCase();
  map.set(key, ruleNumber);
  // Plural ↔ singular fallback so "*Battlefield*" finds the "Battlefields"
  // anchor and vice versa. Always overwrite — the singular and plural form
  // share semantics, so they should always point to the same anchor as the
  // most recent definition.
  // Handle the `-y/-ies` pattern explicitly (Ability/Abilities) before falling
  // back to the trailing-`s` rule, which would otherwise produce nonsense
  // forms like "abilitie" or "abilitys".
  if (/[^aeiou]ies$/u.test(key)) {
    map.set(`${key.slice(0, -3)}y`, ruleNumber);
  } else if (/[^aeiou]y$/u.test(key)) {
    map.set(`${key.slice(0, -1)}ies`, ruleNumber);
  } else if (key.endsWith("s") && key.length > 2) {
    map.set(key.slice(0, -1), ruleNumber);
  } else if (key.length > 1) {
    map.set(`${key}s`, ruleNumber);
  }
}

/**
 * Builds the game-term → rule-number map used to resolve terms like "stun" or
 * "battlefield zone" to their defining rule (see the pass comments above).
 *
 * @returns Lowercased term (plus singular/plural variants) → rule number.
 */
export function buildTermAnchors(
  rules: readonly { ruleNumber: string; ruleType: string; depth: number; content: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  // Pass 1: depth-0 text rules whose body is plain Title Case (no italics).
  // These are section headings stored as text rules — e.g. "Passive Abilities"
  // (363), "Replacement Effects" (367). Done first so later italicized-term
  // entries override them when the same term is defined both ways.
  for (const rule of rules) {
    if (rule.ruleType !== "text" || rule.depth !== 0) {
      continue;
    }
    if (rule.content.includes("*")) {
      continue;
    }
    if (!HEADING_TEXT_REGEX.test(rule.content)) {
      continue;
    }
    for (const part of rule.content.split(/\s+and\s+/iu)) {
      const term = part.trim();
      if (term.length > 0 && /^[A-Z]/u.test(term)) {
        addTermAnchor(map, term, rule.ruleNumber);
      }
    }
  }
  // Pass 2: text rules whose entire body is `*Term*` (or a Title Case phrase
  // wrapped in asterisks, e.g. `*Battlefield Zone*`). Iterating in document
  // order with last-wins means the keyword glossary at 805+ overrides earlier
  // subsection headings (e.g. `*Action*` resolves to the keyword at 806, not
  // the timing subsection at 158.2.a).
  for (const rule of rules) {
    if (rule.ruleType !== "text") {
      continue;
    }
    const match = rule.content.match(TERM_DEFINITION_REGEX);
    if (match) {
      addTermAnchor(map, match[1], rule.ruleNumber);
    }
  }
  // Pass 3: subtitles override everything. Split on " and " so compound
  // headings like "Chains and Showdowns" anchor both halves at the same rule.
  for (const rule of rules) {
    if (rule.ruleType !== "subtitle") {
      continue;
    }
    for (const part of rule.content.split(/\s+and\s+/iu)) {
      const term = part.trim();
      if (term.length > 0 && /^[A-Z]/u.test(term)) {
        addTermAnchor(map, term, rule.ruleNumber);
      }
    }
  }
  return map;
}

/**
 * Compares two rule numbers in their natural numeric/alphabetic order so that
 * `100 < 100.1 < 100.1.a < 200 < 1000`. Each dot-separated segment is parsed
 * as a number when possible; pure-digit segments sort before letter segments
 * at the same depth.
 *
 * @returns Negative if a < b, positive if a > b, 0 if equal.
 */
export function compareRuleNumbers(a: string, b: string): number {
  const partsA = a.split(".");
  const partsB = b.split(".");
  const len = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const partA = partsA[i];
    const partB = partsB[i];
    const numA = Number(partA);
    const numB = Number(partB);
    const aIsNum = !Number.isNaN(numA) && partA !== "";
    const bIsNum = !Number.isNaN(numB) && partB !== "";
    if (aIsNum && bIsNum) {
      if (numA !== numB) {
        return numA - numB;
      }
    } else if (aIsNum) {
      return -1;
    } else if (bIsNum) {
      return 1;
    } else {
      const cmp = partA.localeCompare(partB);
      if (cmp !== 0) {
        return cmp;
      }
    }
  }
  return partsA.length - partsB.length;
}
