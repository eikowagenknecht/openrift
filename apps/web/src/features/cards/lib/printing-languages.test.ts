import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { groupPrintingsByLanguage } from "./printing-languages";

const en = stubPrinting({ id: "p-en", language: "EN" });
const de = stubPrinting({ id: "p-de", language: "DE" });
const fr = stubPrinting({ id: "p-fr", language: "FR" });

describe("groupPrintingsByLanguage", () => {
  it("returns nothing for an empty list", () => {
    expect(groupPrintingsByLanguage([])).toEqual([]);
    expect(groupPrintingsByLanguage([], ["EN", "DE"])).toEqual([]);
  });

  it("keeps the input order when no taxonomy order is given", () => {
    const groups = groupPrintingsByLanguage([fr, en, de]);

    expect(groups.map((group) => group.language)).toEqual(["FR", "EN", "DE"]);
  });

  it("follows the taxonomy order when one is given", () => {
    const groups = groupPrintingsByLanguage([fr, de, en], ["EN", "DE", "FR"]);

    expect(groups.map((group) => group.language)).toEqual(["EN", "DE", "FR"]);
  });

  it("omits languages the list has no printings for", () => {
    const groups = groupPrintingsByLanguage([en], ["EN", "DE", "FR"]);

    expect(groups.map((group) => group.language)).toEqual(["EN"]);
  });

  it("appends languages the taxonomy does not know rather than dropping them", () => {
    const klingon = stubPrinting({ id: "p-tlh", language: "TLH" });
    const groups = groupPrintingsByLanguage([klingon, en], ["EN", "DE"]);

    expect(groups.map((group) => group.language)).toEqual(["EN", "TLH"]);
    expect(groups.at(-1)?.printings).toEqual([klingon]);
  });

  it("keeps every printing of a language together, in input order", () => {
    const enAlt = stubPrinting({ id: "p-en-alt", language: "EN" });
    const groups = groupPrintingsByLanguage([en, de, enAlt], ["EN", "DE"]);

    expect(groups[0]?.printings.map((printing) => printing.id)).toEqual(["p-en", "p-en-alt"]);
    expect(groups[1]?.printings.map((printing) => printing.id)).toEqual(["p-de"]);
  });
});
