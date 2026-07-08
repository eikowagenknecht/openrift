import type { CandidateCardResponse, ProviderSettingResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { FieldDef } from "@/components/admin/candidate-spreadsheet";

import { buildPreseededActiveCard } from "./card-detail-shared";

// Minimal field set mirroring buildCandidateCardFields: a plain string field, two
// dropdown array fields, a numeric field, a read-only field, and a rich-text field
// that the accept schema does not persist.
const fields: FieldDef[] = [
  { key: "externalId", label: "External ID", readOnly: true },
  { key: "name", label: "Name" },
  {
    key: "types",
    label: "Types",
    labeledOptions: [
      { value: "unit", label: "Unit" },
      { value: "spell", label: "Spell" },
    ],
    array: true,
  },
  {
    key: "domains",
    label: "Domains",
    labeledOptions: [
      { value: "fury", label: "Fury" },
      { value: "calm", label: "Calm" },
    ],
    array: true,
  },
  { key: "energy", label: "Energy", type: "number" },
  { key: "rulesText", label: "Rules Text", multiline: true, richText: true },
];

function source(provider: string, values: Record<string, unknown>): CandidateCardResponse {
  return { provider, ...values } as unknown as CandidateCardResponse;
}

function settings(entries: { provider: string; sortOrder: number }[]): ProviderSettingResponse[] {
  return entries as unknown as ProviderSettingResponse[];
}

describe("buildPreseededActiveCard", () => {
  it("seeds each field from the highest-priority source (lowest sort order)", () => {
    const sources = [
      source("gallery", { name: "Low priority", types: ["spell"], energy: 5 }),
      source("official", { name: "High priority", types: ["unit"], domains: ["fury"], energy: 3 }),
    ];
    const providerSettings = settings([
      { provider: "official", sortOrder: 0 },
      { provider: "gallery", sortOrder: 1 },
    ]);

    expect(buildPreseededActiveCard(sources, fields, providerSettings)).toEqual({
      name: "High priority",
      types: ["unit"],
      domains: ["fury"],
      energy: 3,
    });
  });

  it("falls back to a lower-priority source per field when the top source lacks a value", () => {
    const sources = [
      source("official", { name: "Top", types: ["unit"], domains: ["fury"] }),
      source("gallery", { name: "Second", energy: 4 }),
    ];
    const providerSettings = settings([
      { provider: "official", sortOrder: 0 },
      { provider: "gallery", sortOrder: 1 },
    ]);

    // energy is missing on the top source, so it comes from the second source.
    expect(buildPreseededActiveCard(sources, fields, providerSettings)).toEqual({
      name: "Top",
      types: ["unit"],
      domains: ["fury"],
      energy: 4,
    });
  });

  it("ignores read-only fields and fields the accept schema does not persist", () => {
    const sources = [
      source("official", {
        externalId: "EXT-1",
        name: "Card",
        types: ["unit"],
        domains: ["fury"],
        rulesText: "Deal 2 damage.",
      }),
    ];

    const seed = buildPreseededActiveCard(sources, fields, settings([]));
    expect(seed).not.toHaveProperty("externalId");
    expect(seed).not.toHaveProperty("rulesText");
    expect(seed).toEqual({ name: "Card", types: ["unit"], domains: ["fury"] });
  });

  it("skips dropdown values that are not a valid option", () => {
    const sources = [
      source("official", { name: "Card", types: ["contraption"], domains: ["fury"] }),
    ];

    // "contraption" is not a known type, so it must not pre-fill.
    const seed = buildPreseededActiveCard(sources, fields, settings([]));
    expect(seed).not.toHaveProperty("types");
    expect(seed).toEqual({ name: "Card", domains: ["fury"] });
  });

  it("seeds dropdown values unvalidated when the option list has not loaded yet", () => {
    // Enum lists load async: before they arrive, labeledOptions is empty. In that
    // window we must still seed the raw slug rather than reject everything.
    const fieldsWithoutOptions: FieldDef[] = [
      { key: "name", label: "Name" },
      { key: "types", label: "Types", labeledOptions: [], array: true },
    ];
    const sources = [source("official", { name: "Card", types: ["unit"] })];

    expect(buildPreseededActiveCard(sources, fieldsWithoutOptions, settings([]))).toEqual({
      name: "Card",
      types: ["unit"],
    });
  });

  it("breaks sort-order ties by provider name", () => {
    const sources = [
      source("zeta", { name: "From zeta" }),
      source("alpha", { name: "From alpha" }),
    ];
    const providerSettings = settings([
      { provider: "zeta", sortOrder: 0 },
      { provider: "alpha", sortOrder: 0 },
    ]);

    expect(buildPreseededActiveCard(sources, fields, providerSettings)).toEqual({
      name: "From alpha",
    });
  });

  it("returns an empty object when no source has a usable value", () => {
    const sources = [source("official", { externalId: "EXT-1", rulesText: "ignored" })];
    expect(buildPreseededActiveCard(sources, fields, settings([]))).toEqual({});
  });
});
