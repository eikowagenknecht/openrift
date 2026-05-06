import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRulesSearchStore } from "@/stores/rules-search-store";
import { createStoreResetter } from "@/test/store-helpers";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    hash,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    hash?: string;
    children: ReactNode;
    className?: string;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    return (
      <a href={hash ? `${path}#${hash}` : path} className={className} data-testid="router-link">
        {children}
      </a>
    );
  },
}));

const { RuleContent, buildTermAnchors } = await import("./rules-page");

function makeRule(overrides: {
  ruleNumber: string;
  content: string;
  ruleType: "title" | "subtitle" | "text";
  depth?: number;
}) {
  return {
    id: overrides.ruleNumber,
    kind: "core" as const,
    version: "test",
    ruleNumber: overrides.ruleNumber,
    content: overrides.content,
    ruleType: overrides.ruleType,
    depth: overrides.depth ?? 0,
    sortOrder: 0,
    changeType: "added" as const,
  };
}

describe("RuleContent", () => {
  it("renders italic markdown", () => {
    const { container } = render(<RuleContent content="*Card* refers to a Main Deck card." />);
    expect(container.querySelector("em")).toHaveTextContent("Card");
  });

  it("turns each newline in the source into a hard line break", () => {
    const { container } = render(<RuleContent content={"first line\nsecond line"} />);
    expect(container.querySelectorAll("br").length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain("first line");
    expect(container.textContent).toContain("second line");
  });

  it("links a `rule N` reference to the same-page anchor", () => {
    render(<RuleContent content="See *rule 540* for more information." />);
    const link = screen.getByRole("link", { name: "rule 540" });
    expect(link).toHaveAttribute("href", "#rule-540");
  });

  it("links a multi-segment rule reference and stops before a sentence-ending dot", () => {
    render(<RuleContent content="Continue until *rule 540.4.b.* is accomplished." />);
    const link = screen.getByRole("link", { name: "rule 540.4.b" });
    expect(link).toHaveAttribute("href", "#rule-540.4.b");
  });

  it("links a bare numeric tournament reference", () => {
    render(<RuleContent content="See 603.7 for more information." />);
    const link = screen.getByRole("link", { name: "603.7" });
    expect(link).toHaveAttribute("href", "#rule-603.7");
  });

  it("links a `CR N` reference across to the core rules page via the router", () => {
    render(<RuleContent content="Then proceed to *CR 116. Setup Process*." />);
    const link = screen.getByRole("link", { name: "CR 116" });
    expect(link).toHaveAttribute("href", "/rules/core#rule-116");
    expect(link).toHaveAttribute("data-testid", "router-link");
  });

  it("does not link a low single-digit decimal that is not a rule number", () => {
    render(<RuleContent content="The ratio is 1.5x." />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("links an italicized term to its subtitle anchor", () => {
    const anchors = new Map([["combat", "454"]]);
    render(
      <RuleContent content="Resolve during *Combat* now." termAnchors={anchors} ruleNumber="500" />,
    );
    const link = screen.getByRole("link", { name: "Combat" });
    expect(link).toHaveAttribute("href", "#rule-454");
  });

  it("strips a trailing dot from an italicized term when looking up its anchor", () => {
    const anchors = new Map([["combat", "454"]]);
    const { container } = render(
      <RuleContent content="Resolve during *Combat.*" termAnchors={anchors} ruleNumber="500" />,
    );
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "#rule-454");
  });

  it("matches a singular italic against a plural anchor", () => {
    const anchors = buildTermAnchors([
      makeRule({ ruleNumber: "168", ruleType: "subtitle", content: "Battlefields" }),
    ]);
    render(
      <RuleContent
        content="At the *Battlefield* you control."
        termAnchors={anchors}
        ruleNumber="500"
      />,
    );
    const link = screen.getByRole("link", { name: "Battlefield" });
    expect(link).toHaveAttribute("href", "#rule-168");
  });

  it("does not self-link the term to the rule that defines it", () => {
    const anchors = new Map([["accelerate", "805"]]);
    render(<RuleContent content="*Accelerate*" termAnchors={anchors} ruleNumber="805" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not link an italic term that is not in the anchor map", () => {
    const anchors = new Map([["combat", "454"]]);
    render(<RuleContent content="*Hand-shaking* is friendly." termAnchors={anchors} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not double-link an italicized rule reference", () => {
    const anchors = new Map([["rule", "999"]]);
    render(
      <RuleContent content="See *rule 540* for more." termAnchors={anchors} ruleNumber="100" />,
    );
    // The rule-number plugin runs first and converts the inner text to a link;
    // the term linkifier must not re-wrap it.
    const link = screen.getByRole("link", { name: "rule 540" });
    expect(link).toHaveAttribute("href", "#rule-540");
    expect(screen.queryAllByRole("link")).toHaveLength(1);
  });
});

describe("buildTermAnchors", () => {
  it("indexes subtitles and adds singular/plural variants", () => {
    const anchors = buildTermAnchors([
      makeRule({ ruleNumber: "168", ruleType: "subtitle", content: "Battlefields" }),
      makeRule({ ruleNumber: "454", ruleType: "subtitle", content: "Combat" }),
    ]);
    expect(anchors.get("battlefields")).toBe("168");
    expect(anchors.get("battlefield")).toBe("168");
    expect(anchors.get("combat")).toBe("454");
    expect(anchors.get("combats")).toBe("454");
  });

  it("indexes text rules whose body is exactly *Term*", () => {
    const anchors = buildTermAnchors([
      makeRule({ ruleNumber: "423", ruleType: "text", content: "*Stun*" }),
      makeRule({ ruleNumber: "805", ruleType: "text", content: "*Accelerate*" }),
    ]);
    expect(anchors.get("stun")).toBe("423");
    expect(anchors.get("accelerate")).toBe("805");
  });

  it("lets later text-rule definitions override earlier ones", () => {
    const anchors = buildTermAnchors([
      makeRule({ ruleNumber: "158.2.a", ruleType: "text", content: "*Action*" }),
      makeRule({ ruleNumber: "806", ruleType: "text", content: "*Action*" }),
    ]);
    // The keyword glossary at 806 wins over the earlier subsection heading.
    expect(anchors.get("action")).toBe("806");
  });

  it("lets subtitles override text-rule entries", () => {
    const anchors = buildTermAnchors([
      makeRule({ ruleNumber: "133.4.b", ruleType: "text", content: "*Spells*" }),
      makeRule({ ruleNumber: "152", ruleType: "subtitle", content: "Spells" }),
    ]);
    expect(anchors.get("spells")).toBe("152");
    expect(anchors.get("spell")).toBe("152");
  });

  it("indexes multi-word italicized terms", () => {
    const anchors = buildTermAnchors([
      makeRule({ ruleNumber: "107.2", ruleType: "text", content: "*Battlefield Zone*" }),
      makeRule({ ruleNumber: "136", ruleType: "text", content: "*Effect Text*" }),
    ]);
    expect(anchors.get("battlefield zone")).toBe("107.2");
    expect(anchors.get("effect text")).toBe("136");
  });

  it("indexes depth-0 plain-text headings (no italics)", () => {
    const anchors = buildTermAnchors([
      makeRule({ ruleNumber: "363", ruleType: "text", depth: 0, content: "Passive Abilities" }),
      makeRule({ ruleNumber: "367", ruleType: "text", depth: 0, content: "Replacement Effects" }),
    ]);
    expect(anchors.get("passive abilities")).toBe("363");
    expect(anchors.get("passive ability")).toBe("363");
    expect(anchors.get("replacement effects")).toBe("367");
    expect(anchors.get("replacement effect")).toBe("367");
  });

  it("ignores depth-0 prose that happens to start with a capital letter", () => {
    const anchors = buildTermAnchors([
      makeRule({
        ruleNumber: "109",
        ruleType: "text",
        depth: 0,
        content: "All *Game Objects* in the collective *Play Areas* are *Public Information.*",
      }),
    ]);
    // Has italics + ends with period; not a heading.
    expect(anchors.has("all")).toBe(false);
  });

  it("does not index depth>0 plain-text rules as headings", () => {
    const anchors = buildTermAnchors([
      makeRule({
        ruleNumber: "200.1",
        ruleType: "text",
        depth: 1,
        content: "Passive Abilities",
      }),
    ]);
    expect(anchors.has("passive abilities")).toBe(false);
  });

  it("pairs -y/-ies forms (Ability ↔ Abilities)", () => {
    const fromPlural = buildTermAnchors([
      makeRule({ ruleNumber: "360", ruleType: "subtitle", content: "Abilities" }),
    ]);
    expect(fromPlural.get("abilities")).toBe("360");
    expect(fromPlural.get("ability")).toBe("360");

    const fromSingular = buildTermAnchors([
      makeRule({ ruleNumber: "360", ruleType: "subtitle", content: "Ability" }),
    ]);
    expect(fromSingular.get("ability")).toBe("360");
    expect(fromSingular.get("abilities")).toBe("360");
  });

  it("splits compound subtitles on `and`", () => {
    const anchors = buildTermAnchors([
      makeRule({
        ruleNumber: "325",
        ruleType: "subtitle",
        content: "Chains and Showdowns",
      }),
    ]);
    expect(anchors.get("chains")).toBe("325");
    expect(anchors.get("chain")).toBe("325");
    expect(anchors.get("showdowns")).toBe("325");
    expect(anchors.get("showdown")).toBe("325");
  });
});

describe("same-page anchor click handler", () => {
  let resetStore: () => void;

  beforeEach(() => {
    resetStore = createStoreResetter(useRulesSearchStore);
  });

  afterEach(() => {
    resetStore();
  });

  it("clears the search when the target rule is not in the DOM", () => {
    useRulesSearchStore.getState().setQuery("trigger");
    render(<RuleContent content="See *rule 540* for details." />);

    const link = screen.getByRole("link", { name: "rule 540" });
    fireEvent.click(link);

    expect(useRulesSearchStore.getState().query).toBe("");
    expect(useRulesSearchStore.getState().resetSignal).toBe(1);
  });

  it("leaves the search untouched when the target rule is in the DOM", () => {
    useRulesSearchStore.getState().setQuery("trigger");
    const target = document.createElement("div");
    target.id = "rule-540";
    document.body.append(target);

    render(<RuleContent content="See *rule 540* for details." />);
    const link = screen.getByRole("link", { name: "rule 540" });
    fireEvent.click(link);

    expect(useRulesSearchStore.getState().query).toBe("trigger");
    expect(useRulesSearchStore.getState().resetSignal).toBe(0);
    target.remove();
  });
});
