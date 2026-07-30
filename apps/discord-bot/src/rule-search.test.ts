import { describe, expect, it } from "vitest";

import {
  buildRuleIndex,
  findRule,
  isRuleCitation,
  parseRuleQuery,
  ruleChoice,
  searchRules,
} from "./rule-search.js";
import { makeRule, makeRulesSnapshot } from "./test/factories.js";

function makeIndex() {
  return buildRuleIndex(
    makeRulesSnapshot(
      [
        makeRule({
          ruleNumber: "103",
          content: "To play *Riftbound*, a player must have a *Main Deck.*",
        }),
        makeRule({ ruleNumber: "103.1", content: "Choose a champion first." }),
        makeRule({ ruleNumber: "103.1.a", content: "This dictates the *Domain Identity.*" }),
        makeRule({ ruleNumber: "119", ruleType: "subtitle", content: "Game Objects" }),
        makeRule({ ruleNumber: "423", content: "*Stun*" }),
        makeRule({ ruleNumber: "424", content: "A stunned unit does not ready." }),
      ],
      [
        makeRule({ ruleNumber: "103", content: "Judges resolve rules disputes." }),
        makeRule({ ruleNumber: "202", ruleType: "subtitle", content: "Tournament Modes:" }),
      ],
    ),
  );
}

describe("parseRuleQuery", () => {
  it("detects CR and TR prefixes, with or without a space", () => {
    expect(parseRuleQuery("CR 103.1")).toEqual({ kind: "core", rest: "103.1" });
    expect(parseRuleQuery("tr202")).toEqual({ kind: "tournament", rest: "202" });
  });

  it("does not read a leading `cr` inside a word as a prefix", () => {
    expect(parseRuleQuery("creature")).toEqual({ rest: "creature" });
  });
});

describe("isRuleCitation", () => {
  it("accepts CR/TR-prefixed and bare number-shaped references", () => {
    expect(isRuleCitation("cr 103.1")).toBe(true);
    expect(isRuleCitation("TR202")).toBe(true);
    expect(isRuleCitation("103.1")).toBe(true);
    expect(isRuleCitation("1031b")).toBe(true);
  });

  it("rejects card names and printing codes", () => {
    expect(isRuleCitation("Jinx, Rebel")).toBe(false);
    expect(isRuleCitation("ogn202")).toBe(false);
    expect(isRuleCitation("OGN-202/298")).toBe(false);
    expect(isRuleCitation("creature")).toBe(false);
    expect(isRuleCitation("cr something")).toBe(false);
  });
});

describe("searchRules", () => {
  it("matches a bare number in both kinds, core first", () => {
    const results = searchRules(makeIndex(), "103", 25);
    expect(results[0]?.kind).toBe("core");
    expect(results[0]?.number).toBe("103");
    expect(results.some((entry) => entry.kind === "tournament" && entry.number === "103")).toBe(
      true,
    );
  });

  it("restricts to one kind when the query carries a prefix", () => {
    const results = searchRules(makeIndex(), "tr 103", 25);
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("tournament");
  });

  it("ranks the exact number first, then its sub-rules", () => {
    const results = searchRules(makeIndex(), "cr 103.1", 25);
    expect(results.map((entry) => entry.number)).toEqual(["103.1", "103.1.a"]);
  });

  it("matches dot-free number forms (103.1a)", () => {
    const results = searchRules(makeIndex(), "103.1a", 25);
    expect(results[0]?.number).toBe("103.1.a");
  });

  it("resolves a game term to its defining rule first", () => {
    const results = searchRules(makeIndex(), "stun", 25);
    expect(results[0]?.number).toBe("423");
    // The rule merely containing the word follows.
    expect(results.map((entry) => entry.number)).toContain("424");
  });

  it("requires every word of a text query to match", () => {
    const results = searchRules(makeIndex(), "stunned ready", 25);
    expect(results.map((entry) => entry.number)).toEqual(["424"]);
  });

  it("ranks italic term usage and phrase openers over mid-sentence mentions", () => {
    // Models the real corpus: no `*Stun*` definition exists, so ranking falls
    // to how the word is used.
    const index = buildRuleIndex(
      makeRulesSnapshot([
        makeRule({ ruleNumber: "124.2", content: "Statuses include Attached and Stunned." }),
        makeRule({ ruleNumber: "423.1.b", content: "A *Stunned Unit* deals no combat damage." }),
        makeRule({ ruleNumber: "805.1.a", content: "Stunning is described here first." }),
      ]),
    );
    expect(searchRules(index, "stun", 25).map((entry) => entry.number)).toEqual([
      "805.1.a",
      "423.1.b",
      "124.2",
    ]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchRules(makeIndex(), "  ", 25)).toEqual([]);
    expect(searchRules(makeIndex(), "cr", 25)).toEqual([]);
  });

  it("caps results at the limit", () => {
    expect(searchRules(makeIndex(), "10", 2)).toHaveLength(2);
  });
});

describe("findRule", () => {
  it("resolves the autocomplete round-trip citation exactly", () => {
    const entry = findRule(makeIndex(), "CR 103.1");
    expect(entry?.kind).toBe("core");
    expect(entry?.number).toBe("103.1");
  });

  it("falls back to the best search match for free text", () => {
    expect(findRule(makeIndex(), "stun")?.number).toBe("423");
  });

  it("returns undefined when nothing matches", () => {
    expect(findRule(makeIndex(), "xyzzy")).toBeUndefined();
  });
});

describe("ruleChoice", () => {
  it("labels entries with the citation and the start of the rule text", () => {
    const entry = findRule(makeIndex(), "CR 103");
    expect(ruleChoice(entry!)).toEqual({
      name: "CR 103 — To play Riftbound, a player must have a Main Deck.",
      value: "CR 103",
    });
  });

  it("keeps names within Discord's 100-character cap", () => {
    const index = buildRuleIndex(
      makeRulesSnapshot([makeRule({ ruleNumber: "500", content: "word ".repeat(60) })]),
    );
    const choice = ruleChoice(findRule(index, "CR 500")!);
    expect(choice.name.length).toBeLessThanOrEqual(100);
    expect(choice.name.endsWith("…")).toBe(true);
  });
});
