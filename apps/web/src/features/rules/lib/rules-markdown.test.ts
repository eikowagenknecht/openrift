import { describe, expect, it } from "vitest";

import type { HastNode } from "./rules-markdown";
import { diffRuleMarkdown, hasVisibleRuleChanges, preprocessRuleMarkdown } from "./rules-markdown";

function collectText(nodes: HastNode[]): string {
  let out = "";
  for (const node of nodes) {
    out += node.type === "text" ? (node.value ?? "") : collectText(node.children ?? []);
  }
  return out;
}

function collectSpans(
  nodes: HastNode[],
  key: string,
  out: { value: string; text: string }[] = [],
): { value: string; text: string }[] {
  for (const node of nodes) {
    if (node.type === "element" && typeof node.properties?.[key] === "string") {
      out.push({ value: node.properties[key] as string, text: collectText([node]) });
    }
    collectSpans(node.children ?? [], key, out);
  }
  return out;
}

function diffSpans(nodes: HastNode[]) {
  return collectSpans(nodes, "data-diff").map((s) => [s.value, s.text]);
}

function findElements(nodes: HastNode[], tagName: string, out: HastNode[] = []): HastNode[] {
  for (const node of nodes) {
    if (node.tagName === tagName) {
      out.push(node);
    }
    findElements(node.children ?? [], tagName, out);
  }
  return out;
}

describe("preprocessRuleMarkdown", () => {
  it("normalizes italicized penalty labels and hard-breaks newlines", () => {
    expect(preprocessRuleMarkdown("[*Warning*] first\nsecond")).toBe("[Warning] first  \nsecond");
  });
});

describe("diffRuleMarkdown", () => {
  it("renders identical content without any diff marks", () => {
    const nodes = diffRuleMarkdown("See *rule 540* now.", "See *rule 540* now.");
    expect(diffSpans(nodes)).toEqual([]);
    expect(collectText(nodes)).toBe("See rule 540 now.");
    expect(findElements(nodes, "em").length).toBe(1);
    expect(findElements(nodes, "a")[0]?.properties?.href).toBe("#rule-540");
  });

  it("marks a replaced word as removed plus added", () => {
    const nodes = diffRuleMarkdown("the cat sat", "the dog sat");
    expect(diffSpans(nodes)).toEqual([
      ["removed", "cat"],
      ["added", "dog"],
    ]);
    expect(collectText(nodes)).toBe("the cat dog sat");
  });

  it("marks everything added when the old text is empty", () => {
    const nodes = diffRuleMarkdown("", "brand new rule");
    expect(collectText(nodes)).toBe("brand new rule");
    expect(diffSpans(nodes).every(([kind]) => kind === "added")).toBe(true);
  });

  it("produces no marks for a whitespace-only change", () => {
    const nodes = diffRuleMarkdown("first line\nsecond line", "first line second line");
    expect(diffSpans(nodes)).toEqual([]);
    expect(collectText(nodes)).toBe("first line second line");
    expect(findElements(nodes, "br").length).toBe(0);
  });

  it("renders the new version's line structure for equal text", () => {
    const nodes = diffRuleMarkdown("first line second line", "first line\nsecond line");
    expect(diffSpans(nodes)).toEqual([]);
    expect(findElements(nodes, "br").length).toBe(1);
  });

  it("produces no marks when a word only gained emphasis", () => {
    const nodes = diffRuleMarkdown("choose the Board now", "choose *the Board* now");
    expect(diffSpans(nodes)).toEqual([]);
    expect(collectText(nodes)).toBe("choose the Board now");
    expect(collectText(findElements(nodes, "em"))).toBe("the Board");
  });

  it("never leaks emphasis markers when an emphasis boundary moves", () => {
    const oldText = "matches your *Champion Legend.*\nExample: Loose Cannon has the tag Jinx.";
    const newText = "matches your *Champion Legend. Example:* Loose Cannon has the tag *Jinx*.";
    const nodes = diffRuleMarkdown(oldText, newText);
    expect(collectText(nodes)).not.toContain("*");
    expect(diffSpans(nodes)).toEqual([]);
    const emTexts = findElements(nodes, "em").map((em) => collectText([em]));
    expect(emTexts).toEqual(["Champion Legend. Example:", "Jinx"]);
  });

  it("marks a removed segment that spans a line break as one run", () => {
    const oldText = "keep this\nand drop that\nend";
    const newText = "keep this\nend";
    const nodes = diffRuleMarkdown(oldText, newText);
    expect(diffSpans(nodes)).toEqual([["removed", "and drop that"]]);
  });

  it("diffs only the changed number of a renumbered rule reference", () => {
    const nodes = diffRuleMarkdown("See rule 540 for details.", "See rule 541 for details.");
    expect(diffSpans(nodes)).toEqual([
      ["removed", "540"],
      ["added", "541"],
    ]);
    const links = findElements(nodes, "a");
    const hrefs = links.map((a) => a.properties?.href);
    expect(hrefs).toContain("#rule-540");
    expect(hrefs).toContain("#rule-541");
  });

  it("keeps unchanged reference text linked to the new target", () => {
    const nodes = diffRuleMarkdown("See rule 540 for details.", "See rule 541 for details.");
    const links = findElements(nodes, "a");
    const ruleWordLink = links.find((a) => collectText([a]).includes("rule"));
    expect(ruleWordLink?.properties?.href).toBe("#rule-541");
  });

  it("treats a changed penalty label as one badge removed and one added", () => {
    const nodes = diffRuleMarkdown("Penalty: [Warning]", "Penalty: [Game Loss]");
    expect(diffSpans(nodes)).toEqual([
      ["removed", "[Warning]"],
      ["added", "[Game Loss]"],
    ]);
    const badges = collectSpans(nodes, "data-penalty");
    expect(badges).toEqual([
      { value: "Warning", text: "[Warning]" },
      { value: "Game Loss", text: "[Game Loss]" },
    ]);
  });

  it("keeps an unchanged penalty badge unmarked", () => {
    const nodes = diffRuleMarkdown("Do it. [Warning]", "Do it now. [Warning]");
    expect(diffSpans(nodes)).toEqual([["added", "now"]]);
    expect(collectSpans(nodes, "data-penalty")).toEqual([{ value: "Warning", text: "[Warning]" }]);
  });

  it("nests diff marks inside shared emphasis", () => {
    const nodes = diffRuleMarkdown("stays *the same* here", "stays *the sameish* here");
    const em = findElements(nodes, "em")[0]!;
    expect(em).toBeDefined();
    expect(diffSpans([em])).toEqual([
      ["removed", "same"],
      ["added", "sameish"],
    ]);
  });

  it("reconstructs the new text (word-for-word) from equal plus added segments", () => {
    const oldText = "the quick brown fox jumps over the lazy dog";
    const newText = "the slow brown fox leaps across the sleepy dog";
    const nodes = diffRuleMarkdown(oldText, newText);
    const withoutRemoved = (list: HastNode[]): string => {
      let out = "";
      for (const node of list) {
        if (node.type === "text") {
          out += node.value ?? "";
        } else if (node.properties?.["data-diff"] !== "removed") {
          out += withoutRemoved(node.children ?? []);
        }
      }
      return out;
    };
    expect(withoutRemoved(nodes).split(/\s+/u).filter(Boolean)).toEqual(
      newText.split(/\s+/u).filter(Boolean),
    );
  });
});

describe("hasVisibleRuleChanges", () => {
  it("reports no change for identical sources", () => {
    expect(hasVisibleRuleChanges("same text", "same text")).toBe(false);
  });

  it("reports no change when only emphasis moved", () => {
    expect(hasVisibleRuleChanges("a *Champion Legend* here", "a *Champion* Legend here")).toBe(
      false,
    );
  });

  it("reports no change when only whitespace differs", () => {
    expect(hasVisibleRuleChanges("one two\nthree", "one   two three")).toBe(false);
  });

  it("reports no change when a link was added around unchanged text", () => {
    expect(hasVisibleRuleChanges("See 103.2 for details", "See [103.2](/x) for details")).toBe(
      false,
    );
  });

  it("reports a change when a word is added", () => {
    expect(hasVisibleRuleChanges("one two", "one two three")).toBe(true);
  });

  it("reports a change when a word is removed", () => {
    expect(hasVisibleRuleChanges("one two three", "one three")).toBe(true);
  });

  it("reports a change when a word is replaced", () => {
    expect(hasVisibleRuleChanges("the quick fox", "the slow fox")).toBe(true);
  });

  it("reports a change when punctuation differs", () => {
    expect(hasVisibleRuleChanges("cards, not runes", "cards; not runes")).toBe(true);
  });

  it("handles empty sources", () => {
    expect(hasVisibleRuleChanges("", "")).toBe(false);
    expect(hasVisibleRuleChanges("", "new text")).toBe(true);
    expect(hasVisibleRuleChanges("old text", "")).toBe(true);
  });
});
