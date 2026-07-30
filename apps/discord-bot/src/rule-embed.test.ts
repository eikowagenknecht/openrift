import { describe, expect, it } from "vitest";

import { buildRuleEmbed, linkifyRuleReferences, ruleBreadcrumb } from "./rule-embed.js";
import { buildRuleIndex, findRule } from "./rule-search.js";
import { makeRule, makeRulesSnapshot } from "./test/factories.js";

const SITE_URL = "https://example.test";

function makeIndex() {
  return buildRuleIndex(
    makeRulesSnapshot(
      [
        makeRule({ ruleNumber: "119", ruleType: "subtitle", content: "Game Objects" }),
        makeRule({ ruleNumber: "120", content: "A *Game Object* is anything in the game." }),
        makeRule({ ruleNumber: "120.1", content: "Cards are Game Objects." }),
        makeRule({ ruleNumber: "120.1.a", content: "Tokens too. See rule 179. Tokens." }),
        makeRule({ ruleNumber: "120.2", content: "Runes are Game Objects." }),
        makeRule({ ruleNumber: "153", ruleType: "subtitle", content: "Spells" }),
        makeRule({ ruleNumber: "154", content: "A spell resolves." }),
      ],
      [makeRule({ ruleNumber: "204", content: "Judges apply CR 120 during events." })],
    ),
  );
}

describe("linkifyRuleReferences", () => {
  it("links `rule N` references within the rule's own kind", () => {
    expect(linkifyRuleReferences("See rule 179. Tokens.", "core", SITE_URL)).toBe(
      `See [rule 179](${SITE_URL}/rules/core#rule-179). Tokens.`,
    );
  });

  it("links bare dotted numbers", () => {
    expect(linkifyRuleReferences("As stated in 540.4.b, continue.", "core", SITE_URL)).toBe(
      `As stated in [540.4.b](${SITE_URL}/rules/core#rule-540.4.b), continue.`,
    );
  });

  it("always sends CR references to the core rules, even from tournament rules", () => {
    expect(linkifyRuleReferences("Judges apply CR 120 here.", "tournament", SITE_URL)).toBe(
      `Judges apply [CR 120](${SITE_URL}/rules/core#rule-120) here.`,
    );
  });
});

describe("ruleBreadcrumb", () => {
  it("chains the nearest section heading and the bare ancestor numbers", () => {
    const index = makeIndex();
    const entry = findRule(index, "CR 120.1.a")!;
    expect(ruleBreadcrumb(index, entry)).toBe("Game Objects › 120 › 120.1");
  });

  it("skips a distant heading when the rule's block doesn't start right after it", () => {
    // Models the sparse-heading corpus: 423.1.b has no existing ancestors and
    // sits far from the last subtitle, which must not appear as its context.
    const index = buildRuleIndex(
      makeRulesSnapshot([
        makeRule({ ruleNumber: "201", ruleType: "subtitle", content: "Costs" }),
        makeRule({ ruleNumber: "202", content: "Costs are paid." }),
        makeRule({ ruleNumber: "423.1.b", content: "A *Stunned Unit* deals no combat damage." }),
      ]),
    );
    expect(ruleBreadcrumb(index, findRule(index, "CR 423.1.b")!)).toBeUndefined();
  });

  it("returns undefined for a rule with no heading or ancestors", () => {
    const index = buildRuleIndex(
      makeRulesSnapshot([makeRule({ ruleNumber: "100", content: "First rule." })]),
    );
    expect(ruleBreadcrumb(index, findRule(index, "CR 100")!)).toBeUndefined();
  });

  it("omits the line entirely when there is no heading — numbers alone repeat the title", () => {
    const index = buildRuleIndex(
      makeRulesSnapshot([
        makeRule({ ruleNumber: "103", content: "To play, a player needs a deck." }),
        makeRule({ ruleNumber: "103.2", content: "A Main Deck of at least 40 cards." }),
      ]),
    );
    expect(ruleBreadcrumb(index, findRule(index, "CR 103.2")!)).toBeUndefined();
  });
});

describe("buildRuleEmbed", () => {
  it("builds a text-rule embed: citation title, anchor link, body, full subtree, version footer", () => {
    const index = makeIndex();
    const embed = buildRuleEmbed({ entry: findRule(index, "CR 120")!, index, siteUrl: SITE_URL });
    expect(embed.title).toBe("CR 120");
    expect(embed.url).toBe(`${SITE_URL}/rules/core#rule-120`);
    expect(embed.description).toContain("A *Game Object* is anything in the game.");
    expect(embed.description).toContain("- **120.1** Cards are Game Objects.");
    // Descendants of any depth are quoted in full, in document order, as a
    // nested list indented by depth below the selected rule.
    expect(embed.description).toContain(
      `\n  - **120.1.a** Tokens too. See [rule 179](${SITE_URL}/rules/core#rule-179). Tokens.`,
    );
    expect(embed.description).toContain("\n- **120.2** Runes are Game Objects.");
    expect(embed.footer?.text).toBe("Core Rules · 2026-07-16");
  });

  it("puts the heading text in the title and quotes the whole section for a subtitle", () => {
    const index = makeIndex();
    const embed = buildRuleEmbed({ entry: findRule(index, "CR 119")!, index, siteUrl: SITE_URL });
    expect(embed.title).toBe("CR 119 — Game Objects");
    // The section runs to the next subtitle, sub-rules included, indented by
    // each rule's own depth (the section doesn't share the heading's number).
    expect(embed.description).toContain("- **120**");
    expect(embed.description).toContain("\n  - **120.1**");
    expect(embed.description).toContain("\n    - **120.1.a**");
    expect(embed.description).not.toContain("**154**");
  });

  it("indents a rule's inner newlines along with its bullet", () => {
    const index = buildRuleIndex(
      makeRulesSnapshot([
        makeRule({ ruleNumber: "500", content: "The parent rule." }),
        makeRule({
          ruleNumber: "500.1.a",
          content: "Sub-rule text.\n  *Example:* An example line.",
        }),
      ]),
    );
    const embed = buildRuleEmbed({ entry: findRule(index, "CR 500")!, index, siteUrl: SITE_URL });
    expect(embed.description).toContain(
      "\n  - **500.1.a** Sub-rule text.\n      *Example:* An example line.",
    );
  });

  it("drops whole sub-rules when the budget runs out, never cutting mid-sentence", () => {
    const filler = "This sub-rule carries a full paragraph of rules text. ".repeat(20).trim();
    const index = buildRuleIndex(
      makeRulesSnapshot([
        makeRule({ ruleNumber: "500", content: "The parent rule." }),
        ...Array.from({ length: 10 }, (_, i) =>
          makeRule({ ruleNumber: `500.${i + 1}`, content: filler }),
        ),
      ]),
    );
    const embed = buildRuleEmbed({ entry: findRule(index, "CR 500")!, index, siteUrl: SITE_URL });
    expect(embed.description?.length).toBeLessThanOrEqual(4096);
    // Every included sub-rule is complete, and the cut is announced.
    const included = [...embed.description!.matchAll(/\*\*500\.\d+\*\*/gu)].length;
    expect(included).toBeGreaterThan(0);
    expect(included).toBeLessThan(10);
    expect(embed.description).toContain(`…and ${10 - included} more on OpenRift`);
    expect(embed.description).toContain(`**500.${included}** ${filler}`);
  });

  it("lists a tournament-style subtitle's own numeric children, without a sibling breadcrumb", () => {
    // Tournament sections nest under the subtitle's own number (705 → 705.1),
    // and the preceding subtitle is a sibling section, not context.
    const index = buildRuleIndex(
      makeRulesSnapshot(
        [],
        [
          makeRule({ ruleNumber: "415", ruleType: "subtitle", content: "Tracking Score" }),
          makeRule({ ruleNumber: "415.4", content: "Players track their own resources." }),
          makeRule({ ruleNumber: "705", ruleType: "subtitle", content: "Disciplinary Code" }),
          makeRule({ ruleNumber: "705.1", content: "All players accept these rules." }),
        ],
      ),
    );
    const embed = buildRuleEmbed({ entry: findRule(index, "TR 705")!, index, siteUrl: SITE_URL });
    expect(embed.title).toBe("TR 705 — Disciplinary Code");
    expect(embed.description).toContain("**705.1** All players accept these rules.");
    expect(embed.description).not.toContain("Tracking Score");
  });

  it("uses the TR prefix and tournament footer for tournament rules", () => {
    const index = makeIndex();
    const embed = buildRuleEmbed({ entry: findRule(index, "TR 204")!, index, siteUrl: SITE_URL });
    expect(embed.title).toBe("TR 204");
    expect(embed.url).toBe(`${SITE_URL}/rules/tournament#rule-204`);
    expect(embed.footer?.text).toBe("Tournament Rules · 2026-05-01");
  });

  it("keeps the description under Discord's limit for a huge rule", () => {
    const index = buildRuleIndex(
      makeRulesSnapshot([
        makeRule({ ruleNumber: "500", content: "long words here. ".repeat(400) }),
      ]),
    );
    const embed = buildRuleEmbed({ entry: findRule(index, "CR 500")!, index, siteUrl: SITE_URL });
    expect(embed.description?.length).toBeLessThanOrEqual(4096);
    expect(embed.description?.endsWith("…")).toBe(true);
  });
});
