import { compareRuleNumbers, RULE_REFERENCE_REGEX } from "@openrift/shared/rules";
import type { RuleChangesResponse, RuleResponse } from "@openrift/shared/types/api/rules";

import { hasVisibleRuleChanges } from "@/lib/rules-markdown";

export type ChangeKind = "new" | "changed" | "moved" | "replaced" | "removed";

export const CHANGE_KIND_BADGE: Record<ChangeKind, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "bg-success-soft text-success",
  },
  changed: {
    label: "Changed",
    className: "bg-warning-soft text-warning",
  },
  moved: {
    label: "Moved",
    className: "bg-info-soft text-info",
  },
  replaced: {
    label: "Replaced",
    className: "bg-violet-soft text-violet",
  },
  removed: {
    label: "Removed",
    className: "bg-destructive-soft text-destructive",
  },
};

export interface RuleMoves {
  oldToNew: Map<string, string>;
  newToOld: Map<string, string>;
  fromRemovedSet: Set<string>;
  toAddedSet: Set<string>;
  displacedSet: Set<string>;
}

// Must keep its own lastIndex state, separate from RULE_REFERENCE_REGEX,
// or it corrupts the markdown pipeline's iteration over that regex.
const RULE_REFERENCE_NORMALIZE_REGEX = new RegExp(RULE_REFERENCE_REGEX.source, "gu");

/**
 * Strips emphasis/code markers and rule cross-references so a rule whose only
 * change is renumbered cross-refs still matches its previous-version twin.
 */
function normalizeForMoveDetection(text: string): string {
  return text
    .replaceAll(RULE_REFERENCE_NORMALIZE_REGEX, "REF")
    .replaceAll(/[*_`]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/**
 * Detects a tombstone's content reappearing under a new rule_number, or a modified
 * rule's previous content matching another rule's current content (renumber-shift).
 */
export function detectMoves(
  rules: readonly RuleResponse[],
  changes: RuleChangesResponse,
  version: string,
): RuleMoves {
  const addedSet = new Set(changes.added);

  // First-write-wins for duplicate content, so generic boilerplate doesn't
  // generate spurious moves.
  const targetByContent = new Map<string, string>();
  for (const rule of rules) {
    const isAdded = addedSet.has(rule.ruleNumber);
    const isModifiedNow = rule.changeType === "modified" && rule.version === version;
    if (!isAdded && !isModifiedNow) {
      continue;
    }
    const norm = normalizeForMoveDetection(rule.content);
    if (!norm) {
      continue;
    }
    if (!targetByContent.has(norm)) {
      targetByContent.set(norm, rule.ruleNumber);
    }
  }

  const oldToNew = new Map<string, string>();
  const newToOld = new Map<string, string>();
  const fromRemovedSet = new Set<string>();
  const toAddedSet = new Set<string>();

  function tryRecordMove(oldRuleNumber: string, oldContent: string, fromRemoved: boolean) {
    const norm = normalizeForMoveDetection(oldContent);
    if (!norm) {
      return;
    }
    if (oldToNew.has(oldRuleNumber)) {
      return;
    }
    const newRuleNumber = targetByContent.get(norm);
    if (newRuleNumber === undefined || newRuleNumber === oldRuleNumber) {
      return;
    }
    if (newToOld.has(newRuleNumber)) {
      return;
    }
    oldToNew.set(oldRuleNumber, newRuleNumber);
    newToOld.set(newRuleNumber, oldRuleNumber);
    if (fromRemoved) {
      fromRemovedSet.add(oldRuleNumber);
    }
    if (addedSet.has(newRuleNumber)) {
      toAddedSet.add(newRuleNumber);
    }
  }

  for (const tombstone of changes.removed) {
    tryRecordMove(tombstone.ruleNumber, tombstone.content, true);
  }
  for (const [oldRuleNumber, prevContent] of Object.entries(changes.modifiedPrev)) {
    tryRecordMove(oldRuleNumber, prevContent, false);
  }

  // Displaced: old content moved elsewhere, but this rule_number didn't itself
  // receive content from another tracked rule.
  const displacedSet = new Set<string>();
  for (const oldRuleNumber of oldToNew.keys()) {
    if (fromRemovedSet.has(oldRuleNumber)) {
      continue;
    }
    if (newToOld.has(oldRuleNumber)) {
      continue;
    }
    displacedSet.add(oldRuleNumber);
  }

  return { oldToNew, newToOld, fromRemovedSet, toAddedSet, displacedSet };
}

/**
 * Rules marked modified whose rendered diff shows no marks (whitespace, emphasis, or
 * link-only edits). Moved or displaced rules are excluded; they carry their own badge.
 */
export function detectSilentChanges(
  rules: readonly RuleResponse[],
  changes: RuleChangesResponse,
  version: string,
  newToOld: ReadonlyMap<string, string>,
  displacedSet: ReadonlySet<string>,
): Set<string> {
  const silent = new Set<string>();
  for (const rule of rules) {
    if (rule.version !== version || rule.changeType !== "modified") {
      continue;
    }
    if (newToOld.has(rule.ruleNumber) || displacedSet.has(rule.ruleNumber)) {
      continue;
    }
    const previousContent = changes.modifiedPrev[rule.ruleNumber];
    if (previousContent !== undefined && !hasVisibleRuleChanges(previousContent, rule.content)) {
      silent.add(rule.ruleNumber);
    }
  }
  return silent;
}

export function buildChangeKindMap(
  rules: readonly RuleResponse[],
  changes: RuleChangesResponse,
  version: string,
  newToOld: ReadonlyMap<string, string>,
  displacedSet: ReadonlySet<string>,
  movedTombstones: ReadonlySet<string>,
  silentSet: ReadonlySet<string>,
): Map<string, ChangeKind> {
  const map = new Map<string, ChangeKind>();
  const addedSet = new Set(changes.added);
  for (const rule of rules) {
    if (rule.version !== version) {
      continue;
    }
    if (newToOld.has(rule.ruleNumber)) {
      map.set(rule.ruleNumber, "moved");
    } else if (displacedSet.has(rule.ruleNumber)) {
      map.set(rule.ruleNumber, "replaced");
    } else if (addedSet.has(rule.ruleNumber)) {
      map.set(rule.ruleNumber, "new");
    } else if (rule.changeType === "modified" && !silentSet.has(rule.ruleNumber)) {
      map.set(rule.ruleNumber, "changed");
    }
  }
  for (const tombstone of changes.removed) {
    if (!movedTombstones.has(tombstone.ruleNumber)) {
      map.set(tombstone.ruleNumber, "removed");
    }
  }
  return map;
}

/**
 * sort_order is per-version and collides across versions, so tombstones are merged
 * in by rule_number (natural order) to land in their canonical document position.
 */
export function mergeTombstones(
  rules: readonly RuleResponse[],
  tombstones: readonly RuleResponse[],
  movedTombstones: ReadonlySet<string>,
): RuleResponse[] {
  const visibleTombstones = tombstones.filter((t) => !movedTombstones.has(t.ruleNumber));
  return [...rules, ...visibleTombstones].toSorted((a, b) =>
    compareRuleNumbers(a.ruleNumber, b.ruleNumber),
  );
}

function scanWhile(
  rules: readonly RuleResponse[],
  start: number,
  keepGoing: (rule: RuleResponse) => boolean,
): number {
  let index = start;
  for (;;) {
    const next = rules[index];
    if (next === undefined || !keepGoing(next)) {
      return index;
    }
    index++;
  }
}

export function computeFoldGroups(rules: RuleResponse[]): Map<string, [number, number]> {
  const groups = new Map<string, [number, number]>();
  for (const [index, rule] of rules.entries()) {
    const start = index + 1;
    let endExclusive: number;
    if (rule.ruleType === "title") {
      endExclusive = scanWhile(rules, start, (next) => next.ruleType !== "title");
    } else if (rule.ruleType === "subtitle") {
      endExclusive = scanWhile(
        rules,
        start,
        (next) => next.ruleType !== "subtitle" && next.ruleType !== "title",
      );
    } else {
      const prefix = `${rule.ruleNumber}.`;
      endExclusive = scanWhile(rules, start, (next) => next.ruleNumber.startsWith(prefix));
    }
    if (endExclusive > start) {
      groups.set(rule.ruleNumber, [start, endExclusive]);
    }
  }
  return groups;
}

export function computeAncestorsByRule(
  rules: RuleResponse[],
  groups: Map<string, [number, number]>,
): Map<string, string[]> {
  const ancestorsByRule = new Map<string, string[]>();
  for (const [ancestor, [start, end]] of groups) {
    for (const child of rules.slice(start, end)) {
      const existing = ancestorsByRule.get(child.ruleNumber);
      if (existing) {
        existing.push(ancestor);
      } else {
        ancestorsByRule.set(child.ruleNumber, [ancestor]);
      }
    }
  }
  return ancestorsByRule;
}

// Must stay Object.is-equal across renders for the compiler to cache the .map() result.
export const EMPTY_ANCESTORS: readonly string[] = [];

// Stable empty Set/Map references used when no moves are present.
export const EMPTY_STRING_SET: ReadonlySet<string> = new Set();
export const EMPTY_STRING_MAP: ReadonlyMap<string, string> = new Map();

export function parseSearchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
}

function ruleMatches(rule: RuleResponse, terms: string[]): boolean {
  if (terms.length === 0) {
    return false;
  }
  const content = rule.content.toLowerCase();
  return terms.every((term) => content.includes(term));
}

function findAncestorIndices(
  rules: RuleResponse[],
  match: RuleResponse,
  matchIndex: number,
  rulesByNumber: Map<string, number>,
): number[] {
  const ancestors = new Set<number>();
  const preceding = rules.slice(0, matchIndex);
  const titleIndex = preceding.findLastIndex((rule) => rule.ruleType === "title");
  if (titleIndex !== -1) {
    ancestors.add(titleIndex);
  }
  const headingIndex = preceding.findLastIndex(
    (rule) => rule.ruleType === "title" || rule.ruleType === "subtitle",
  );
  if (preceding[headingIndex]?.ruleType === "subtitle") {
    ancestors.add(headingIndex);
  }
  const stripped = match.ruleNumber.replace(/\.$/u, "");
  const parts = stripped.split(".");
  for (let length = parts.length - 1; length >= 1; length--) {
    const prefix = parts.slice(0, length).join(".");
    const ancestorIndex = rulesByNumber.get(prefix);
    if (ancestorIndex !== undefined && ancestorIndex < matchIndex) {
      ancestors.add(ancestorIndex);
    }
  }
  return [...ancestors];
}

export interface SearchResult {
  visibleIndices: number[];
  matchSet: Set<number>;
  ancestorSet: Set<number>;
}

export function computeSearchResult(rules: RuleResponse[], terms: string[]): SearchResult {
  const matchSet = new Set<number>();
  const ancestorSet = new Set<number>();
  if (terms.length === 0) {
    return { visibleIndices: [], matchSet, ancestorSet };
  }
  const rulesByNumber = new Map<string, number>();
  for (const [index, rule] of rules.entries()) {
    rulesByNumber.set(rule.ruleNumber.replace(/\.$/u, ""), index);
  }
  for (const [index, rule] of rules.entries()) {
    if (ruleMatches(rule, terms)) {
      matchSet.add(index);
      for (const ancestorIndex of findAncestorIndices(rules, rule, index, rulesByNumber)) {
        ancestorSet.add(ancestorIndex);
      }
    }
  }
  const combined = new Set<number>([...matchSet, ...ancestorSet]);
  const visibleIndices = [...combined].toSorted((a, b) => a - b);
  return { visibleIndices, matchSet, ancestorSet };
}
