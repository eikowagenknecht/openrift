import type { RuleChangesResponse, RuleResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  buildChangeKindMap,
  computeAncestorsByRule,
  computeFoldGroups,
  computeSearchResult,
  detectMoves,
  detectSilentChanges,
  mergeTombstones,
  parseSearchTerms,
} from "./rules-changes";

const VERSION = "2.0";
const PREVIOUS_VERSION = "1.0";

function rule(overrides: Partial<RuleResponse> & { ruleNumber: string }): RuleResponse {
  return {
    id: `id-${overrides.ruleNumber}`,
    kind: "core",
    version: VERSION,
    sortOrder: 0,
    depth: 0,
    ruleType: "text",
    content: `content of ${overrides.ruleNumber}`,
    changeType: "added",
    ...overrides,
  };
}

function changes(overrides: Partial<RuleChangesResponse> = {}): RuleChangesResponse {
  return { added: [], modifiedPrev: {}, removed: [], ...overrides };
}

describe("detectMoves", () => {
  it("treats a pure renumber as a move from the tombstone to the new rule", () => {
    const moved = rule({ ruleNumber: "200.1", content: "Damage is marked on the unit." });
    const tombstone = rule({
      ruleNumber: "100.1",
      version: PREVIOUS_VERSION,
      changeType: "removed",
      content: "Damage is marked on the unit.",
    });

    const result = detectMoves(
      [moved],
      changes({ added: ["200.1"], removed: [tombstone] }),
      VERSION,
    );

    expect(result.oldToNew.get("100.1")).toBe("200.1");
    expect(result.newToOld.get("200.1")).toBe("100.1");
    expect([...result.fromRemovedSet]).toEqual(["100.1"]);
    expect([...result.toAddedSet]).toEqual(["200.1"]);
    expect([...result.displacedSet]).toEqual([]);
  });

  it("keeps a tombstone source out of displacedSet even though it lost its content", () => {
    // displacedSet is for rule_numbers that survive holding *different* content.
    // A tombstone no longer exists, so it can never be displaced.
    const tombstone = rule({
      ruleNumber: "100.1",
      version: PREVIOUS_VERSION,
      changeType: "removed",
      content: "Shared text.",
    });

    const result = detectMoves(
      [rule({ ruleNumber: "200.1", content: "Shared text." })],
      changes({ added: ["200.1"], removed: [tombstone] }),
      VERSION,
    );

    expect(result.fromRemovedSet.has("100.1")).toBe(true);
    expect(result.displacedSet.has("100.1")).toBe(false);
  });

  it("marks a rule whose old content went elsewhere as displaced", () => {
    // 100.1 still exists but now holds fresh content, and its previous content
    // resurfaced under 300.5. Its stored previousContent is misleading.
    const rules = [
      rule({ ruleNumber: "100.1", changeType: "modified", content: "Brand new wording." }),
      rule({ ruleNumber: "300.5", content: "The old wording." }),
    ];

    const result = detectMoves(
      rules,
      changes({ added: ["300.5"], modifiedPrev: { "100.1": "The old wording." } }),
      VERSION,
    );

    expect(result.oldToNew.get("100.1")).toBe("300.5");
    expect([...result.displacedSet]).toEqual(["100.1"]);
    expect(result.fromRemovedSet.has("100.1")).toBe(false);
  });

  it("treats a two-rule content swap as two moves and no displacement", () => {
    // Both rule_numbers receive content from the other, so neither is left
    // holding content from outside the tracked diff.
    const rules = [
      rule({ ruleNumber: "100.1", changeType: "modified", content: "Text B." }),
      rule({ ruleNumber: "100.2", changeType: "modified", content: "Text A." }),
    ];

    const result = detectMoves(
      rules,
      changes({ modifiedPrev: { "100.1": "Text A.", "100.2": "Text B." } }),
      VERSION,
    );

    expect(result.oldToNew.get("100.1")).toBe("100.2");
    expect(result.oldToNew.get("100.2")).toBe("100.1");
    expect([...result.displacedSet]).toEqual([]);
  });

  it("still matches when only the rule cross-references were renumbered", () => {
    // Section reorganization renumbers every reference in the body. Without
    // reference normalization this would read as a change, not a move.
    const tombstone = rule({
      ruleNumber: "100.1",
      version: PREVIOUS_VERSION,
      changeType: "removed",
      content: "Resolve the ability as described in rule 540.4.b.",
    });

    const result = detectMoves(
      [rule({ ruleNumber: "620.7", content: "Resolve the ability as described in rule 812.1.a." })],
      changes({ added: ["620.7"], removed: [tombstone] }),
      VERSION,
    );

    expect(result.oldToNew.get("100.1")).toBe("620.7");
  });

  it("ignores emphasis and whitespace differences when matching content", () => {
    const tombstone = rule({
      ruleNumber: "100.1",
      version: PREVIOUS_VERSION,
      changeType: "removed",
      content: "A player  *may*   pass.",
    });

    const result = detectMoves(
      [rule({ ruleNumber: "200.1", content: "A player may pass." })],
      changes({ added: ["200.1"], removed: [tombstone] }),
      VERSION,
    );

    expect(result.oldToNew.get("100.1")).toBe("200.1");
  });

  it("keeps bracketed labels significant, since they carry meaning", () => {
    const tombstone = rule({
      ruleNumber: "100.1",
      version: PREVIOUS_VERSION,
      changeType: "removed",
      content: "[Warning] Slow play.",
    });

    const result = detectMoves(
      [rule({ ruleNumber: "200.1", content: "Slow play." })],
      changes({ added: ["200.1"], removed: [tombstone] }),
      VERSION,
    );

    expect(result.oldToNew.size).toBe(0);
  });

  it("only considers rules that changed in this version as move targets", () => {
    // An untouched rule that happens to share boilerplate with a tombstone is
    // not a move target.
    const untouched = rule({
      ruleNumber: "200.1",
      version: PREVIOUS_VERSION,
      changeType: "added",
      content: "Shared text.",
    });
    const tombstone = rule({
      ruleNumber: "100.1",
      version: PREVIOUS_VERSION,
      changeType: "removed",
      content: "Shared text.",
    });

    const result = detectMoves([untouched], changes({ removed: [tombstone] }), VERSION);

    expect(result.oldToNew.size).toBe(0);
  });

  it("resolves duplicate target content first-write-wins so boilerplate makes one move", () => {
    const rules = [
      rule({ ruleNumber: "200.1", content: "See the appendix." }),
      rule({ ruleNumber: "200.2", content: "See the appendix." }),
    ];
    const tombstones = [
      rule({
        ruleNumber: "100.1",
        version: PREVIOUS_VERSION,
        changeType: "removed",
        content: "See the appendix.",
      }),
      rule({
        ruleNumber: "100.2",
        version: PREVIOUS_VERSION,
        changeType: "removed",
        content: "See the appendix.",
      }),
    ];

    const result = detectMoves(
      rules,
      changes({ added: ["200.1", "200.2"], removed: tombstones }),
      VERSION,
    );

    // 100.1 claims 200.1; 100.2 finds the same target already taken.
    expect(result.oldToNew.get("100.1")).toBe("200.1");
    expect(result.oldToNew.has("100.2")).toBe(false);
  });

  it("does not report a rule as moved onto itself", () => {
    // Emphasis-only edit: the normalized content is unchanged, but the rule
    // stayed where it was.
    const rules = [rule({ ruleNumber: "100.1", changeType: "modified", content: "Draw a card." })];

    const result = detectMoves(
      rules,
      changes({ modifiedPrev: { "100.1": "*Draw* a card." } }),
      VERSION,
    );

    expect(result.oldToNew.size).toBe(0);
    expect(result.displacedSet.size).toBe(0);
  });

  it("skips content that normalizes to nothing", () => {
    const tombstone = rule({
      ruleNumber: "100.1",
      version: PREVIOUS_VERSION,
      changeType: "removed",
      content: "***",
    });

    const result = detectMoves(
      [rule({ ruleNumber: "200.1", content: "___" })],
      changes({ added: ["200.1"], removed: [tombstone] }),
      VERSION,
    );

    expect(result.oldToNew.size).toBe(0);
  });

  it("returns empty maps when nothing changed", () => {
    const result = detectMoves([], changes(), VERSION);

    expect(result.oldToNew.size).toBe(0);
    expect(result.newToOld.size).toBe(0);
    expect(result.fromRemovedSet.size).toBe(0);
    expect(result.toAddedSet.size).toBe(0);
    expect(result.displacedSet.size).toBe(0);
  });
});

describe("detectSilentChanges", () => {
  const noMoves = new Map<string, string>();
  const noDisplaced = new Set<string>();

  it("flags a modified rule whose rendered output is unchanged", () => {
    const rules = [rule({ ruleNumber: "100.1", changeType: "modified", content: "Draw a card." })];

    const silent = detectSilentChanges(
      rules,
      changes({ modifiedPrev: { "100.1": "Draw  a card." } }),
      VERSION,
      noMoves,
      noDisplaced,
    );

    expect([...silent]).toEqual(["100.1"]);
  });

  it("leaves a real wording change alone", () => {
    const rules = [rule({ ruleNumber: "100.1", changeType: "modified", content: "Draw a card." })];

    const silent = detectSilentChanges(
      rules,
      changes({ modifiedPrev: { "100.1": "Draw two cards." } }),
      VERSION,
      noMoves,
      noDisplaced,
    );

    expect(silent.size).toBe(0);
  });

  it("excludes rules that already carry a moved badge", () => {
    const rules = [rule({ ruleNumber: "100.1", changeType: "modified", content: "Draw a card." })];

    const silent = detectSilentChanges(
      rules,
      changes({ modifiedPrev: { "100.1": "Draw  a card." } }),
      VERSION,
      new Map([["100.1", "090.2"]]),
      noDisplaced,
    );

    expect(silent.size).toBe(0);
  });

  it("excludes displaced rules, whose previousContent is misleading", () => {
    const rules = [rule({ ruleNumber: "100.1", changeType: "modified", content: "Draw a card." })];

    const silent = detectSilentChanges(
      rules,
      changes({ modifiedPrev: { "100.1": "Draw  a card." } }),
      VERSION,
      noMoves,
      new Set(["100.1"]),
    );

    expect(silent.size).toBe(0);
  });

  it("ignores rules from an older version and rules that were added", () => {
    const rules = [
      rule({
        ruleNumber: "100.1",
        version: PREVIOUS_VERSION,
        changeType: "modified",
        content: "Draw a card.",
      }),
      rule({ ruleNumber: "100.2", changeType: "added", content: "Draw a card." }),
    ];

    const silent = detectSilentChanges(
      rules,
      changes({ modifiedPrev: { "100.1": "Draw  a card.", "100.2": "Draw  a card." } }),
      VERSION,
      noMoves,
      noDisplaced,
    );

    expect(silent.size).toBe(0);
  });

  it("ignores a modified rule with no recorded previous content", () => {
    const rules = [rule({ ruleNumber: "100.1", changeType: "modified", content: "Draw a card." })];

    const silent = detectSilentChanges(rules, changes(), VERSION, noMoves, noDisplaced);

    expect(silent.size).toBe(0);
  });
});

describe("buildChangeKindMap", () => {
  const noMoves = new Map<string, string>();
  const noDisplaced = new Set<string>();
  const noMovedTombstones = new Set<string>();
  const noSilent = new Set<string>();

  it("assigns new, changed and removed on a plain diff", () => {
    const rules = [
      rule({ ruleNumber: "100.1", changeType: "added" }),
      rule({ ruleNumber: "100.2", changeType: "modified" }),
      rule({ ruleNumber: "100.3", changeType: "added", version: PREVIOUS_VERSION }),
    ];
    const tombstone = rule({
      ruleNumber: "100.4",
      version: PREVIOUS_VERSION,
      changeType: "removed",
    });

    const map = buildChangeKindMap(
      rules,
      changes({ added: ["100.1"], removed: [tombstone] }),
      VERSION,
      noMoves,
      noDisplaced,
      noMovedTombstones,
      noSilent,
    );

    expect(map.get("100.1")).toBe("new");
    expect(map.get("100.2")).toBe("changed");
    expect(map.has("100.3")).toBe(false);
    expect(map.get("100.4")).toBe("removed");
  });

  it("prefers moved over new for a rule that received moved content", () => {
    const rules = [rule({ ruleNumber: "100.1", changeType: "added" })];

    const map = buildChangeKindMap(
      rules,
      changes({ added: ["100.1"] }),
      VERSION,
      new Map([["100.1", "090.2"]]),
      noDisplaced,
      noMovedTombstones,
      noSilent,
    );

    expect(map.get("100.1")).toBe("moved");
  });

  it("prefers replaced over changed for a displaced rule", () => {
    const rules = [rule({ ruleNumber: "100.1", changeType: "modified" })];

    const map = buildChangeKindMap(
      rules,
      changes(),
      VERSION,
      noMoves,
      new Set(["100.1"]),
      noMovedTombstones,
      noSilent,
    );

    expect(map.get("100.1")).toBe("replaced");
  });

  it("omits a modified rule whose diff would render nothing", () => {
    const rules = [rule({ ruleNumber: "100.1", changeType: "modified" })];

    const map = buildChangeKindMap(
      rules,
      changes(),
      VERSION,
      noMoves,
      noDisplaced,
      noMovedTombstones,
      new Set(["100.1"]),
    );

    expect(map.has("100.1")).toBe(false);
  });

  it("suppresses a tombstone whose content moved to a new rule number", () => {
    const tombstone = rule({
      ruleNumber: "100.4",
      version: PREVIOUS_VERSION,
      changeType: "removed",
    });

    const map = buildChangeKindMap(
      [],
      changes({ removed: [tombstone] }),
      VERSION,
      noMoves,
      noDisplaced,
      new Set(["100.4"]),
      noSilent,
    );

    expect(map.has("100.4")).toBe(false);
  });

  it("badges an unchanged rule of the current version with nothing", () => {
    const rules = [rule({ ruleNumber: "100.1", changeType: "added" })];

    const map = buildChangeKindMap(
      rules,
      changes(),
      VERSION,
      noMoves,
      noDisplaced,
      noMovedTombstones,
      noSilent,
    );

    expect(map.size).toBe(0);
  });
});

describe("mergeTombstones", () => {
  it("interleaves tombstones at their natural rule-number position", () => {
    const rules = [rule({ ruleNumber: "100.1" }), rule({ ruleNumber: "100.3" })];
    const tombstones = [rule({ ruleNumber: "100.2", changeType: "removed" })];

    const merged = mergeTombstones(rules, tombstones, new Set());

    expect(merged.map((r) => r.ruleNumber)).toEqual(["100.1", "100.2", "100.3"]);
  });

  it("drops tombstones whose content moved elsewhere", () => {
    const rules = [rule({ ruleNumber: "100.1" })];
    const tombstones = [
      rule({ ruleNumber: "100.2", changeType: "removed" }),
      rule({ ruleNumber: "100.3", changeType: "removed" }),
    ];

    const merged = mergeTombstones(rules, tombstones, new Set(["100.2"]));

    expect(merged.map((r) => r.ruleNumber)).toEqual(["100.1", "100.3"]);
  });

  it("sorts on rule number rather than sort order, which collides across versions", () => {
    const rules = [
      rule({ ruleNumber: "100.10", sortOrder: 1 }),
      rule({ ruleNumber: "100.2", sortOrder: 2 }),
    ];

    const merged = mergeTombstones(rules, [], new Set());

    expect(merged.map((r) => r.ruleNumber)).toEqual(["100.2", "100.10"]);
  });

  it("leaves the input arrays untouched", () => {
    const rules = [rule({ ruleNumber: "100.3" })];
    const tombstones = [rule({ ruleNumber: "100.1", changeType: "removed" })];

    mergeTombstones(rules, tombstones, new Set());

    expect(rules.map((r) => r.ruleNumber)).toEqual(["100.3"]);
    expect(tombstones.map((r) => r.ruleNumber)).toEqual(["100.1"]);
  });
});

describe("computeFoldGroups", () => {
  it("groups everything under a title until the next title", () => {
    const rules = [
      rule({ ruleNumber: "1", ruleType: "title" }),
      rule({ ruleNumber: "100" }),
      rule({ ruleNumber: "101" }),
      rule({ ruleNumber: "2", ruleType: "title" }),
      rule({ ruleNumber: "200" }),
    ];

    const groups = computeFoldGroups(rules);

    expect(groups.get("1")).toEqual([1, 3]);
    expect(groups.get("2")).toEqual([4, 5]);
  });

  it("stops a subtitle group at the next subtitle or title", () => {
    const rules = [
      rule({ ruleNumber: "1", ruleType: "title" }),
      rule({ ruleNumber: "1a", ruleType: "subtitle" }),
      rule({ ruleNumber: "100" }),
      rule({ ruleNumber: "1b", ruleType: "subtitle" }),
      rule({ ruleNumber: "101" }),
      rule({ ruleNumber: "2", ruleType: "title" }),
    ];

    const groups = computeFoldGroups(rules);

    expect(groups.get("1a")).toEqual([2, 3]);
    expect(groups.get("1b")).toEqual([4, 5]);
    expect(groups.get("1")).toEqual([1, 5]);
  });

  it("groups a text rule with its dot-nested descendants only", () => {
    const rules = [
      rule({ ruleNumber: "103" }),
      rule({ ruleNumber: "103.1" }),
      rule({ ruleNumber: "103.1.a" }),
      rule({ ruleNumber: "104" }),
    ];

    const groups = computeFoldGroups(rules);

    expect(groups.get("103")).toEqual([1, 3]);
    expect(groups.get("103.1")).toEqual([2, 3]);
    expect(groups.has("103.1.a")).toBe(false);
    expect(groups.has("104")).toBe(false);
  });

  it("does not group a numeric-prefix sibling that is not dot-nested", () => {
    // 1030 starts with "103" but not with "103.", so it is a sibling.
    const rules = [rule({ ruleNumber: "103" }), rule({ ruleNumber: "1030" })];

    expect(computeFoldGroups(rules).size).toBe(0);
  });

  it("omits rules with no children and handles an empty list", () => {
    expect(computeFoldGroups([]).size).toBe(0);
    expect(computeFoldGroups([rule({ ruleNumber: "1", ruleType: "title" })]).size).toBe(0);
  });
});

describe("computeAncestorsByRule", () => {
  it("collects every fold group covering a rule", () => {
    const rules = [
      rule({ ruleNumber: "1", ruleType: "title" }),
      rule({ ruleNumber: "103" }),
      rule({ ruleNumber: "103.1" }),
    ];

    const ancestors = computeAncestorsByRule(rules, computeFoldGroups(rules));

    expect(ancestors.get("103")).toEqual(["1"]);
    expect(ancestors.get("103.1")).toEqual(["1", "103"]);
    expect(ancestors.has("1")).toBe(false);
  });

  it("returns an empty map when nothing folds", () => {
    const rules = [rule({ ruleNumber: "100" }), rule({ ruleNumber: "101" })];

    expect(computeAncestorsByRule(rules, computeFoldGroups(rules)).size).toBe(0);
  });
});

describe("parseSearchTerms", () => {
  it("lowercases, trims and splits on whitespace", () => {
    expect(parseSearchTerms("  Draw   A Card ")).toEqual(["draw", "a", "card"]);
  });

  it("returns no terms for an empty or whitespace-only query", () => {
    expect(parseSearchTerms("")).toEqual([]);
    expect(parseSearchTerms("   ")).toEqual([]);
  });
});

describe("computeSearchResult", () => {
  const rules = [
    rule({ ruleNumber: "1", ruleType: "title", content: "Game Concepts" }),
    rule({ ruleNumber: "1a", ruleType: "subtitle", content: "Starting the Game" }),
    rule({ ruleNumber: "103", content: "Each player shuffles their deck." }),
    rule({ ruleNumber: "103.1", content: "The starting player is chosen at random." }),
    rule({ ruleNumber: "103.1.a", content: "A coin flip settles a tie." }),
    rule({ ruleNumber: "2", ruleType: "title", content: "Combat" }),
    rule({ ruleNumber: "200", content: "Units deal damage simultaneously." }),
  ];

  it("returns nothing for an empty term list", () => {
    const result = computeSearchResult(rules, []);

    expect(result.visibleIndices).toEqual([]);
    expect(result.matchSet.size).toBe(0);
    expect(result.ancestorSet.size).toBe(0);
  });

  it("pulls in the enclosing title, subtitle and dot-nested parents of a match", () => {
    const result = computeSearchResult(rules, ["coin"]);

    expect([...result.matchSet]).toEqual([4]);
    expect([...result.ancestorSet].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(result.visibleIndices).toEqual([0, 1, 2, 3, 4]);
  });

  it("stops at the nearest title and does not reach into an earlier section", () => {
    const result = computeSearchResult(rules, ["damage"]);

    expect([...result.matchSet]).toEqual([6]);
    expect([...result.ancestorSet]).toEqual([5]);
  });

  it("requires every term to appear in the same rule", () => {
    expect(computeSearchResult(rules, ["shuffles", "damage"]).matchSet.size).toBe(0);
    expect([...computeSearchResult(rules, ["shuffles", "deck"]).matchSet]).toEqual([2]);
  });

  it("matches case-insensitively against the rule content", () => {
    // Callers pass terms through parseSearchTerms, which lowercases them.
    expect([...computeSearchResult(rules, parseSearchTerms("COMBAT")).matchSet]).toEqual([5]);
  });

  it("returns visible indices in ascending order across several matches", () => {
    const result = computeSearchResult(rules, ["player"]);

    expect(result.visibleIndices).toEqual([0, 1, 2, 3]);
  });
});
