import type { RuleKind, RuleResponse } from "@openrift/shared";
import { buildTermAnchors, compareRuleNumbers, formatRuleNumber } from "@openrift/shared";

import type { RulesSnapshot } from "./rules-cache.js";

const KIND_PREFIX: Record<RuleKind, string> = { core: "CR", tournament: "TR" };

export interface IndexedRule {
  rule: RuleResponse;
  kind: RuleKind;
  prefix: string;
  number: string;
  numberLower: string;
  squashedNumber: string;
  contentLower: string;
  plain: string;
  plainLower: string;
}

export interface RuleIndex {
  entries: IndexedRule[];
  byKey: Map<string, IndexedRule>;
  termTargets: Map<string, IndexedRule>;
  versions: Record<RuleKind, string>;
}

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

export function parseRuleQuery(query: string): { kind?: RuleKind; rest: string } {
  const trimmed = query.trim();
  const match = KIND_PREFIX_QUERY_REGEX.exec(trimmed);
  const prefix = match?.groups?.prefix;
  if (match === null || prefix === undefined) {
    return { rest: trimmed };
  }
  const kind: RuleKind = prefix.toLowerCase() === "cr" ? "core" : "tournament";
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

// Card names and printing codes always start with letters, so a number-shaped
// `[[…]]` reference can be routed to the rule index safely.
export function isRuleCitation(reference: string): boolean {
  const { rest } = parseRuleQuery(reference);
  return /^\d[\d.a-z]*$/iu.test(rest);
}

export function findRule(index: RuleIndex, query: string): IndexedRule | undefined {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/gu, " ");
  return index.byKey.get(normalized) ?? searchRules(index, query, 1)[0];
}

// Discord caps both the label and the value at 100 characters.
export function ruleChoice(entry: IndexedRule): { name: string; value: string } {
  const citation = `${entry.prefix} ${entry.number}`;
  const label = `${citation} — ${entry.plain}`;
  return { name: label.length > 100 ? `${label.slice(0, 99)}…` : label, value: citation };
}
