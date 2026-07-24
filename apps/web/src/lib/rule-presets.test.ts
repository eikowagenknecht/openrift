import { EMPTY_CARD_FILTERS, listRulesSchema } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { serializeRules } from "@/stores/rule-editor-store";

import { TRADE_RULE_PRESETS, WISH_RULE_PRESETS } from "./rule-presets";

describe("rule presets", () => {
  it("has unique ids across both intents", () => {
    const ids = [...WISH_RULE_PRESETS, ...TRADE_RULE_PRESETS].map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every wish preset serializes to valid wish rules", () => {
    for (const preset of WISH_RULE_PRESETS) {
      const rules = serializeRules(preset.build(), "wish");
      expect(rules.length).toBeGreaterThan(0);
      expect(() => listRulesSchema.parse(rules)).not.toThrow();
      expect(rules.every((rule) => rule.kind === "wish")).toBe(true);
    }
  });

  it("every trade preset serializes to valid trade rules", () => {
    for (const preset of TRADE_RULE_PRESETS) {
      const rules = serializeRules(preset.build(), "trade");
      expect(rules.length).toBeGreaterThan(0);
      expect(() => listRulesSchema.parse(rules)).not.toThrow();
      expect(rules.every((rule) => rule.kind === "trade")).toBe(true);
    }
  });

  it("seeds the language facet from the context languages, like a blank rule", () => {
    for (const preset of [...WISH_RULE_PRESETS, ...TRADE_RULE_PRESETS]) {
      const [draft] = preset.build({ languages: ["DE", "EN"] });
      expect(draft?.filter.languages).toEqual(["DE", "EN"]);
      const [blank] = preset.build();
      expect(blank?.filter.languages).toEqual([]);
    }
  });

  it("catalog-wide presets leave every other facet blank", () => {
    for (const preset of [...WISH_RULE_PRESETS, ...TRADE_RULE_PRESETS]) {
      if (preset.id === "main-set-playsets") {
        continue;
      }
      const [blank] = preset.build();
      expect(blank?.filter).toEqual(EMPTY_CARD_FILTERS);
    }
  });

  it("main-set playsets scope to the given main sets and count special versions", () => {
    const preset = WISH_RULE_PRESETS.find((entry) => entry.id === "main-set-playsets");
    const [draft] = preset?.build({ mainSetSlugs: ["origins", "spirit-blossom"] }) ?? [];
    expect(draft).toMatchObject({
      quantity: { mode: "playset", multiplier: 1 },
      netOwned: true,
      countSpecialVersions: true,
    });
    expect(draft?.filter).toEqual({
      ...EMPTY_CARD_FILTERS,
      sets: ["origins", "spirit-blossom"],
      isStandard: true,
      artVariantsExclude: ["overnumbered"],
      typesExclude: ["rune"],
      superTypesExclude: ["token"],
    });
    // Without catalog context the set facet stays empty (= all sets) rather
    // than crashing — the dialog always passes the slugs in practice.
    const [bare] = preset?.build() ?? [];
    expect(bare?.filter.sets).toEqual([]);
  });

  it("wish presets want only the shortfall (net owned)", () => {
    const one = WISH_RULE_PRESETS.find((preset) => preset.id === "one-of-everything");
    expect(one?.build()[0]).toMatchObject({ quantity: { mode: "fixed", n: 1 }, netOwned: true });

    const playset = WISH_RULE_PRESETS.find((preset) => preset.id === "playset-of-everything");
    expect(playset?.build()[0]).toMatchObject({
      quantity: { mode: "playset", multiplier: 1 },
      netOwned: true,
    });
  });

  it("trade presets keep the advertised counts", () => {
    const keepPlayset = TRADE_RULE_PRESETS.find((preset) => preset.id === "keep-playset");
    expect(keepPlayset?.build()[0]).toMatchObject({
      keepPerCard: { mode: "playset", multiplier: 1 },
      keepPer: "card",
    });

    const onePerCard = TRADE_RULE_PRESETS.find((preset) => preset.id === "keep-one-per-card");
    expect(onePerCard?.build()[0]).toMatchObject({
      keepPerCard: { mode: "fixed", n: 1 },
      keepPer: "card",
    });

    const onePerPrinting = TRADE_RULE_PRESETS.find(
      (preset) => preset.id === "keep-one-per-printing",
    );
    expect(onePerPrinting?.build()[0]).toMatchObject({
      keepPerCard: { mode: "fixed", n: 1 },
      keepPer: "printing",
    });
  });

  it("builds fresh drafts on every call (no shared references)", () => {
    for (const preset of [...WISH_RULE_PRESETS, ...TRADE_RULE_PRESETS]) {
      const first = preset.build();
      const second = preset.build();
      expect(first).toEqual(second);
      expect(first[0]).not.toBe(second[0]);
      expect(first[0]?.excludeIds).not.toBe(second[0]?.excludeIds);
    }
  });
});
