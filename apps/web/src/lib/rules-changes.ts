import type { RuleChangesResponse, RuleResponse } from "@openrift/shared";
import { compareRuleNumbers } from "@openrift/shared";

import { hasVisibleRuleChanges, RULE_REFERENCE_REGEX } from "@/lib/rules-markdown";

export type ChangeKind = "new" | "changed" | "moved" | "replaced" | "removed";

export const CHANGE_KIND_BADGE: Record<ChangeKind, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  },
  changed: {
    label: "Changed",
    className: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  },
  moved: {
    label: "Moved",
    className: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  },
  replaced: {
    label: "Replaced",
    className: "bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  },
  removed: {
    label: "Removed",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
};

export interface RuleMoves {
  /** Map from a source rule_number (removed or modified) to its new home. */
  oldToNew: Map<string, string>;
  /** Map from a target rule_number (added or modified) back to the source. */
  newToOld: Map<string, string>;
  /** Source rule_numbers that were tombstones — used to suppress those rows. */
  fromRemovedSet: Set<string>;
  /** Target rule_numbers that are brand-new adds (vs. modified). */
  toAddedSet: Set<string>;
  /**
   * Modified rule_numbers whose previous content went elsewhere AND that did
   * not themselves receive content from another tracked rule. These rows are
   * "replaced": the rule_number now holds different content, but the old
   * content lives at a new rule_number. Their stored `previousContent` is
   * misleading (it's now at the new home), so the diff is suppressed.
   */
  displacedSet: Set<string>;
}

// Fresh instance of the rule-reference regex, used by the move-detection
// normalizer. Derived from `RULE_REFERENCE_REGEX.source` so the two stay in
// sync, but with its own `lastIndex` state to avoid clobbering the markdown
// pipeline's iteration.
const RULE_REFERENCE_NORMALIZE_REGEX = new RegExp(RULE_REFERENCE_REGEX.source, "gu");

/**
 * Canonicalizes rule content for move detection: strips emphasis/code
 * markers, collapses whitespace, and replaces rule cross-references
 * (`rule 173`, `CR 540`, bare `540.4.b`) with a placeholder. This way a
 * rule whose only change is renumbered cross-refs (an inevitable consequence
 * of section reorganization) still matches its previous-version twin.
 * Brackets, parens, and other punctuation stay — they carry semantic content
 * (e.g. `[Warning]` penalty labels).
 *
 * @returns The canonical form for content equality comparison.
 */
function normalizeForMoveDetection(text: string): string {
  return text
    .replaceAll(RULE_REFERENCE_NORMALIZE_REGEX, "REF")
    .replaceAll(/[*_`]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

/**
 * Detects "moves" — content that ended up under a different rule_number than
 * it had in the previous version. Two flavors:
 *
 * - **removed → added/modified**: a tombstone's content matches a target row's
 *   current content (classic renumber).
 * - **modified → modified**: a modified rule's *previous* content matches
 *   another rule's current content (renumber-shift, where both rule_numbers
 *   exist in both versions but the content swapped/shifted).
 *
 * Both are surfaced as a single "Moved" entry on the target, with the source
 * rule_number in a tooltip.
 *
 * @returns Move maps and per-source/target kind sets for summary accounting.
 */
export function detectMoves(
  rules: readonly RuleResponse[],
  changes: RuleChangesResponse,
  version: string,
): RuleMoves {
  const addedSet = new Set(changes.added);

  // Index: target rule's current content (normalized) → its rule_number,
  // considering only rules that changed in this version (added or modified).
  // First-write-wins for duplicates, so generic boilerplate doesn't generate
  // spurious moves.
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

  // Pass 1: tombstone sources (removed-then-added/modified).
  for (const tombstone of changes.removed) {
    tryRecordMove(tombstone.ruleNumber, tombstone.content, true);
  }
  // Pass 2: modified-rule sources (renumber-shifts where both old + new
  // rule_numbers exist in both versions).
  for (const [oldRuleNumber, prevContent] of Object.entries(changes.modifiedPrev)) {
    tryRecordMove(oldRuleNumber, prevContent, false);
  }

  // A modified rule is "displaced" iff its old content moved elsewhere but
  // it didn't itself receive content from another tracked rule (i.e. the
  // new content is fresh / from outside the tracked diff).
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
 * Rules the source marks as modified whose rendered output is identical to the
 * previous version's — the edit only touched whitespace, emphasis, or link
 * markup, all of which the inline diff renders silently. Badging these as
 * "Changed" opens an empty diff, so they're treated as unchanged instead.
 * Rules whose content moved or was replaced are excluded: those carry their
 * own badge and are accounted for separately.
 *
 * @returns The set of rule_numbers whose diff would show no marks.
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

/**
 * Builds a map from rule_number → ChangeKind for the given version's diff.
 * A rule whose new content matches some other rule's previous content is
 * tagged "moved" — whether it's brand-new or just modified. Tombstones whose
 * content moved to a new rule_number (per `movedTombstones`) are skipped, and
 * so are rules in `silentSet` (see `detectSilentChanges`).
 *
 * @returns Map of rule_number to its change kind in this version.
 */
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
 * Interleaves tombstones into the rules list at their natural rule-number
 * position. Skips tombstones whose content moved to a new rule_number — those
 * are surfaced as "Moved" badges on the new rule instead.
 *
 * `sort_order` is per-version and collides across versions, so we sort on
 * `rule_number` (natural order) when in diff mode to keep new + tombstone
 * rows in their canonical document position.
 *
 * @returns The merged list ordered by rule_number.
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

/**
 * Computes, for each foldable rule, the half-open `[start, end)` range of
 * sibling indices that collapse with it. Three grouping rules apply:
 *
 * - A `title` groups every rule until the next `title` (or the end of list).
 * - A `subtitle` groups every rule until the next `subtitle` or `title`.
 * - A `text` rule groups any directly dot-nested descendants
 *   (e.g. `103` groups `103.1`, `103.1.a`, etc.).
 *
 * Only rules that actually have at least one child get an entry.
 *
 * @returns Map of rule number to the index range of its children.
 */
export function computeFoldGroups(rules: RuleResponse[]): Map<string, [number, number]> {
  const groups = new Map<string, [number, number]>();
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index];
    let endExclusive = index + 1;
    if (rule.ruleType === "title") {
      while (endExclusive < rules.length && rules[endExclusive].ruleType !== "title") {
        endExclusive++;
      }
    } else if (rule.ruleType === "subtitle") {
      while (
        endExclusive < rules.length &&
        rules[endExclusive].ruleType !== "subtitle" &&
        rules[endExclusive].ruleType !== "title"
      ) {
        endExclusive++;
      }
    } else {
      const prefix = `${rule.ruleNumber}.`;
      while (endExclusive < rules.length && rules[endExclusive].ruleNumber.startsWith(prefix)) {
        endExclusive++;
      }
    }
    if (endExclusive > index + 1) {
      groups.set(rule.ruleNumber, [index + 1, endExclusive]);
    }
  }
  return groups;
}

/**
 * Inverts `computeFoldGroups` to map each rule number to the rule numbers
 * whose folding would hide it. A rule is hidden iff at least one of its
 * ancestors is in the folded set. Pre-computing this lets each row check
 * its visibility from the fold store without scanning the full fold map.
 *
 * @returns Map of rule number to the rule numbers that own a fold group covering it.
 */
export function computeAncestorsByRule(
  rules: RuleResponse[],
  groups: Map<string, [number, number]>,
): Map<string, string[]> {
  const ancestorsByRule = new Map<string, string[]>();
  for (const [ancestor, [start, end]] of groups) {
    for (let index = start; index < end; index++) {
      const childRuleNumber = rules[index].ruleNumber;
      const existing = ancestorsByRule.get(childRuleNumber);
      if (existing) {
        existing.push(ancestor);
      } else {
        ancestorsByRule.set(childRuleNumber, [ancestor]);
      }
    }
  }
  return ancestorsByRule;
}

// Stable empty-array reference for rows with no ancestors — keeps the prop
// Object.is-equal across renders so the compiler can cache the .map() result.
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

/**
 * Collects the indices that should be shown alongside a match: the most
 * recent enclosing title, the most recent enclosing subtitle, and every
 * dot-nested parent rule (e.g. `103.1.a` pulls in `103.1` and `103`).
 *
 * @returns Indices of ancestor rules within the original list.
 */
function findAncestorIndices(
  rules: RuleResponse[],
  matchIndex: number,
  rulesByNumber: Map<string, number>,
): number[] {
  const ancestors = new Set<number>();
  for (let index = matchIndex - 1; index >= 0; index--) {
    if (rules[index].ruleType === "title") {
      ancestors.add(index);
      break;
    }
  }
  for (let index = matchIndex - 1; index >= 0; index--) {
    if (rules[index].ruleType === "title") {
      break;
    }
    if (rules[index].ruleType === "subtitle") {
      ancestors.add(index);
      break;
    }
  }
  const stripped = rules[matchIndex].ruleNumber.replace(/\.$/u, "");
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
  for (let index = 0; index < rules.length; index++) {
    rulesByNumber.set(rules[index].ruleNumber.replace(/\.$/u, ""), index);
  }
  for (let index = 0; index < rules.length; index++) {
    if (ruleMatches(rules[index], terms)) {
      matchSet.add(index);
      for (const ancestorIndex of findAncestorIndices(rules, index, rulesByNumber)) {
        ancestorSet.add(ancestorIndex);
      }
    }
  }
  const combined = new Set<number>([...matchSet, ...ancestorSet]);
  const visibleIndices = [...combined].toSorted((a, b) => a - b);
  return { visibleIndices, matchSet, ancestorSet };
}
