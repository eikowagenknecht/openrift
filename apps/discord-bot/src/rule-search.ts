import type { RuleKind, RuleResponse } from "@openrift/shared";
import { buildTermAnchors, compareRuleNumbers, formatRuleNumber } from "@openrift/shared";

import type { RulesSnapshot } from "./rules-cache.js";

/** The display prefix convention: CR = core rules, TR = tournament rules. */
const KIND_PREFIX: Record<RuleKind, string> = { core: "CR", tournament: "TR" };

export interface IndexedRule {
  rule: RuleResponse;
  kind: RuleKind;
  /** `CR` or `TR`, per the house convention for citing rules. */
  prefix: string;
  /** Display form of the rule number (trailing dot stripped). */
  number: string;
  numberLower: string;
  /** Number with the dots removed, for forgiving lookups (`1031a` → 103.1.a). */
  squashedNumber: string;
  contentLower: string;
  /** Single-line content with markdown emphasis stripped, for labels/snippets. */
  plain: string;
  plainLower: string;
}

export interface RuleIndex {
  /** Core rules in document order, then tournament rules in document order. */
  entries: IndexedRule[];
  /** Lowercased `cr 103.1`-style citation → entry. */
  byKey: Map<string, IndexedRule>;
  /** Lowercased game term (from the shared term anchors) → its defining rule. */
  termTargets: Map<string, IndexedRule>;
  versions: Record<RuleKind, string>;
}

/**
 * Flattens a rule body to a single plain-text line: markdown emphasis markers
 * removed, whitespace collapsed.
 *
 * @returns The plain-text form.
 */
function plainRuleText(content: string): string {
  return content.replaceAll(/[*_]/gu, "").replaceAll(/\s+/gu, " ").trim();
}

function indexKind(kind: RuleKind, rules: RuleResponse[]): IndexedRule[] {
  return rules
    .toSorted((a, b) => compareRuleNumbers(a.ruleNumber, b.ruleNumber))
    .map((rule) => {
      const number = formatRuleNumber(rule.ruleNumber);
      const plain = plainRuleText(rule.content);
      return {
        rule,
        kind,
        prefix: KIND_PREFIX[kind],
        number,
        numberLower: number.toLowerCase(),
        squashedNumber: number.replaceAll(".", "").toLowerCase(),
        contentLower: rule.content.toLowerCase(),
        plain,
        plainLower: plain.toLowerCase(),
      };
    });
}

/**
 * Precomputes lookup structures for both rule kinds once per rules refresh:
 * document-ordered entries (core first), a citation-key map for exact `CR
 * 103.1` lookups, and a game-term map (from the same term anchors the site
 * uses) so `stun` resolves to the rule that defines it.
 *
 * @returns The search index for the given rules snapshot.
 */
export function buildRuleIndex(snapshot: RulesSnapshot): RuleIndex {
  const entries = [
    ...indexKind("core", snapshot.core.rules),
    ...indexKind("tournament", snapshot.tournament.rules),
  ];
  const byKey = new Map<string, IndexedRule>();
  for (const entry of entries) {
    byKey.set(`${entry.prefix.toLowerCase()} ${entry.numberLower}`, entry);
  }
  // Tournament terms first so core wins when both kinds define the same term.
  const termTargets = new Map<string, IndexedRule>();
  for (const kind of ["tournament", "core"] as const) {
    const rules = kind === "core" ? snapshot.core.rules : snapshot.tournament.rules;
    for (const [term, ruleNumber] of buildTermAnchors(rules)) {
      const target = byKey.get(`${KIND_PREFIX[kind].toLowerCase()} ${ruleNumber.toLowerCase()}`);
      if (target) {
        termTargets.set(term, target);
      }
    }
  }
  return {
    entries,
    byKey,
    termTargets,
    versions: { core: snapshot.core.version, tournament: snapshot.tournament.version },
  };
}

const KIND_PREFIX_QUERY_REGEX = /^(?<prefix>cr|tr)(?![a-z])[\s.:-]*/iu;

/**
 * Splits a query into an optional CR/TR kind prefix and the rest. The prefix
 * must not run into more letters, so a text search like `creature` is not
 * read as `cr eature`.
 *
 * @returns The detected kind (if any) and the remaining query text.
 */
export function parseRuleQuery(query: string): { kind?: RuleKind; rest: string } {
  const trimmed = query.trim();
  const match = trimmed.match(KIND_PREFIX_QUERY_REGEX);
  if (!match?.groups) {
    return { rest: trimmed };
  }
  const kind: RuleKind = match.groups.prefix.toLowerCase() === "cr" ? "core" : "tournament";
  return { kind, rest: trimmed.slice(match[0].length).trim() };
}

function searchByNumber(candidates: IndexedRule[], rest: string, limit: number): IndexedRule[] {
  const q = rest.toLowerCase().replace(/\.$/u, "");
  const squashed = q.replaceAll(".", "");
  const tiers: IndexedRule[][] = [[], [], []];
  for (const entry of candidates) {
    if (entry.numberLower === q || entry.squashedNumber === squashed) {
      tiers[0]?.push(entry);
    } else if (entry.numberLower.startsWith(`${q}.`)) {
      tiers[1]?.push(entry);
    } else if (entry.squashedNumber.startsWith(squashed)) {
      tiers[2]?.push(entry);
    }
  }
  return tiers.flat().slice(0, limit);
}

function searchByText(
  index: RuleIndex,
  candidates: IndexedRule[],
  rest: string,
  kind: RuleKind | undefined,
  limit: number,
): IndexedRule[] {
  const lower = rest.toLowerCase().replace(/[.,:;]+$/u, "");
  const terms = lower.split(/\s+/u).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }
  const termTarget = index.termTargets.get(lower);
  const results: IndexedRule[] = [];
  if (termTarget && (!kind || termTarget.kind === kind)) {
    results.push(termTarget);
  }
  // After the term anchor: headings, then rules that open with the queried
  // phrase, then rules using it as an italicized game term (`*Stunned Unit*`
  // ranks over a rule that merely mentions "stunned" mid-sentence), then any
  // rule containing every word.
  const italicTerm = `*${lower}`;
  const tiers: IndexedRule[][] = [[], [], [], []];
  for (const entry of candidates) {
    if (entry === termTarget) {
      continue;
    }
    const matches = terms.every((term) => entry.contentLower.includes(term));
    if (!matches) {
      continue;
    }
    if (entry.rule.ruleType !== "text") {
      tiers[0]?.push(entry);
    } else if (entry.plainLower.startsWith(lower)) {
      tiers[1]?.push(entry);
    } else if (entry.contentLower.includes(italicTerm)) {
      tiers[2]?.push(entry);
    } else {
      tiers[3]?.push(entry);
    }
  }
  return [...results, ...tiers.flat()].slice(0, limit);
}

/**
 * Ranks rules against a query. A `CR`/`TR` prefix restricts the kind. A
 * numeric rest matches by rule number: exact (dots optional) first, then
 * sub-rules, then loose prefixes. A text rest matches the defining rule of a
 * game term first (via the shared term anchors), then headings, then rules
 * containing every word — each tier in document order, core before tournament.
 *
 * @returns Up to `limit` matching rules, best first.
 */
export function searchRules(index: RuleIndex, query: string, limit: number): IndexedRule[] {
  const { kind, rest } = parseRuleQuery(query);
  if (!rest) {
    return [];
  }
  const candidates = kind ? index.entries.filter((entry) => entry.kind === kind) : index.entries;
  if (/^\d/u.test(rest)) {
    return searchByNumber(candidates, rest, limit);
  }
  return searchByText(index, candidates, rest, kind, limit);
}

/**
 * Whether a `[[…]]` message reference is a rule citation rather than a card
 * name: an optional CR/TR prefix followed by a number-shaped rest (`cr
 * 103.1`, `tr202`, bare `103.1`). Number-shaped bracket content can't collide
 * with card names or printing codes (those start with letters), so citations
 * route to the rule index and everything else stays a card lookup.
 *
 * @returns True when the reference should be resolved as a rule.
 */
export function isRuleCitation(reference: string): boolean {
  const { rest } = parseRuleQuery(reference);
  return /^\d[\d.a-z]*$/iu.test(rest);
}

/**
 * Resolves a query to a single rule: an exact `CR 103.1`-style citation (the
 * slash command's autocomplete round-trips these) or the best search match.
 *
 * @returns The matched rule, or undefined when nothing matches.
 */
export function findRule(index: RuleIndex, query: string): IndexedRule | undefined {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/gu, " ");
  return index.byKey.get(normalized) ?? searchRules(index, query, 1)[0];
}

/**
 * Builds the autocomplete choice for a rule: `CR 103.2 — <start of the rule
 * text>` as the label, the bare `CR 103.2` citation as the round-trip value.
 * Discord caps both at 100 characters.
 *
 * @returns The choice name/value pair.
 */
export function ruleChoice(entry: IndexedRule): { name: string; value: string } {
  const citation = `${entry.prefix} ${entry.number}`;
  const label = `${citation} — ${entry.plain}`;
  return { name: label.length > 100 ? `${label.slice(0, 99)}…` : label, value: citation };
}
