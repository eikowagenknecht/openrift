import type { EnumOrders } from "@openrift/shared/types/enums";
import { beforeEach, describe, expect, it } from "vitest";

import type { CardViewerItem } from "@/lib/card-viewer-types";
import type { EnumLabels } from "@/lib/enum-labels";
import { resetIdCounter, stubPrinting } from "@/test/factories";

import { groupItemsByField, isPrintingsOnlyGrouping } from "./group-by-field";

beforeEach(() => {
  resetIdCounter();
});

const ORDERS: Omit<EnumOrders, "finishes"> = {
  rarities: ["common", "uncommon", "rare"],
  domains: ["fury", "calm", "colorless"],
  cardTypes: ["unit", "spell"],
  superTypes: ["champion", "signature"],
  artVariants: ["normal"],
  cardSizes: ["standard", "oversized"],
};

const LABELS: EnumLabels = {
  finishes: { normal: "Normal" },
  rarities: { common: "Common", uncommon: "Uncommon", rare: "Rare" },
  domains: { fury: "Fury", calm: "Calm", colorless: "Colorless" },
  cardTypes: { unit: "Unit", spell: "Spell" },
  superTypes: { champion: "Champion", signature: "Signature" },
  artVariants: { normal: "Normal" },
  cardSizes: { standard: "Standard", oversized: "Oversized" },
  conditions: {},
  graders: {},
};

function item(printing: ReturnType<typeof stubPrinting>): CardViewerItem {
  return { id: printing.id, printing };
}

describe("isPrintingsOnlyGrouping", () => {
  it("is true for card, marker and distribution channel", () => {
    expect(isPrintingsOnlyGrouping("card")).toBe(true);
    expect(isPrintingsOnlyGrouping("marker")).toBe(true);
    expect(isPrintingsOnlyGrouping("channel")).toBe(true);
  });

  it("is false for axes that work in cards view", () => {
    for (const axis of ["none", "set", "type", "superType", "domain", "rarity", "year"] as const) {
      expect(isPrintingsOnlyGrouping(axis)).toBe(false);
    }
  });
});

describe("groupItemsByField", () => {
  it("labels rarity headers with the display name, not the slug", () => {
    const common = item(stubPrinting({ rarity: "common" }));
    const rare = item(stubPrinting({ rarity: "rare" }));

    const groups = groupItemsByField([common, rare], "rarity", ORDERS, LABELS);

    expect(groups.map((g) => g.group.name)).toEqual(["Common", "Rare"]);
    expect(groups.map((g) => g.group.id)).toEqual(["common", "rare"]);
  });

  it("labels type headers with the display name, not the slug", () => {
    const unit = item(stubPrinting({ card: { type: "unit" } }));
    const spell = item(stubPrinting({ card: { type: "spell" } }));

    const groups = groupItemsByField([unit, spell], "type", ORDERS, LABELS);

    expect(groups.map((g) => g.group.name)).toEqual(["Unit", "Spell"]);
  });

  it("fans multi-type cards into one section per type", () => {
    const unitGear = item(stubPrinting({ card: { types: ["unit", "gear"] } }));
    const spell = item(stubPrinting({ card: { type: "spell" } }));

    const groups = groupItemsByField([unitGear, spell], "type", ORDERS, LABELS);

    expect(groups.map((g) => g.group.id)).toEqual(["unit", "spell", "gear"]);
    const unitGroup = groups.find((g) => g.group.id === "unit");
    const gearGroup = groups.find((g) => g.group.id === "gear");
    expect(unitGroup?.items.map((i) => i.id)).toContain(unitGear.id);
    expect(gearGroup?.items.map((i) => i.id)).toContain(unitGear.id);
  });

  it("labels domain headers with the display name and fans multi-domain cards into each", () => {
    const dual = item(stubPrinting({ card: { domains: ["fury", "calm"] } }));

    const groups = groupItemsByField([dual], "domain", ORDERS, LABELS);

    expect(groups.map((g) => g.group.name)).toEqual(["Fury", "Calm"]);
  });

  it("labels super-type headers but shows the synthetic (None) bucket verbatim", () => {
    const champion = item(stubPrinting({ card: { superTypes: ["champion"] } }));
    const none = item(stubPrinting({ card: { superTypes: [] } }));

    const groups = groupItemsByField([champion, none], "superType", ORDERS, LABELS);

    expect(groups.map((g) => g.group.name)).toEqual(["Champion", "(None)"]);
  });

  it("orders sections by the enum order, appending unknown keys last", () => {
    const rare = item(stubPrinting({ rarity: "rare" }));
    const common = item(stubPrinting({ rarity: "common" }));

    const groups = groupItemsByField([rare, common], "rarity", ORDERS, LABELS);

    expect(groups.map((g) => g.group.id)).toEqual(["common", "rare"]);
  });
});
