import type {
  AdminPrintingImageResponse,
  AdminPrintingResponse,
  CandidateCardResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared/types/api/admin";
import { describe, expect, it } from "vitest";

import type { FieldDef } from "@/features/admin/components/candidate-field-defs";

import {
  buildPreseededActiveCard,
  buildPreseededActivePrinting,
  findDerivedArtPrinting,
} from "./card-detail-shared";

// Mirrors buildCandidateCardFields: string, dropdown-array, numeric, read-only
// and rich-text fields.
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

    const seed = buildPreseededActiveCard(sources, fields, settings([]));
    expect(seed).not.toHaveProperty("types");
    expect(seed).toEqual({ name: "Card", domains: ["fury"] });
  });

  it("seeds dropdown values unvalidated when the option list has not loaded yet", () => {
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

// Mirrors buildCandidatePrintingFields, including the read-only imageUrl the image switcher owns.
const printingFields: FieldDef[] = [
  { key: "externalId", label: "External ID", readOnly: true },
  { key: "setId", label: "Set" },
  { key: "publicCode", label: "Public Code" },
  {
    key: "rarity",
    label: "Rarity",
    labeledOptions: [
      { value: "common", label: "Common" },
      { value: "rare", label: "Rare" },
    ],
  },
  { key: "printedYear", label: "Printed Year", type: "number" },
  { key: "imageUrl", label: "Image", readOnly: true, collapsible: true },
];

function printing(
  candidateCardId: string,
  values: Record<string, unknown>,
): CandidatePrintingResponse {
  return { candidateCardId, ...values } as unknown as CandidatePrintingResponse;
}

function printingSettings(
  entries: { provider: string; sortOrder: number; isFavorite?: boolean }[],
): ProviderSettingResponse[] {
  return entries.map((e) => ({ isFavorite: false, ...e })) as unknown as ProviderSettingResponse[];
}

describe("buildPreseededActivePrinting", () => {
  const labels = { "cc-official": "official", "cc-gallery": "gallery" };
  const providerSettings = printingSettings([
    { provider: "official", sortOrder: 0, isFavorite: true },
    { provider: "gallery", sortOrder: 1 },
  ]);

  it("seeds writable fields from the highest-priority source (lowest sort order)", () => {
    const candidates = [
      printing("cc-gallery", { setId: "ogn", publicCode: "OGN-002", rarity: "rare" }),
      printing("cc-official", { setId: "ogn", publicCode: "OGN-001", rarity: "common" }),
    ];
    const seed = buildPreseededActivePrinting(
      candidates,
      printingFields,
      providerSettings,
      labels,
      {},
    );
    expect(seed.setId).toBe("ogn");
    expect(seed.publicCode).toBe("OGN-001");
    expect(seed.rarity).toBe("common");
  });

  it("pre-fills imageUrl only from a favorited provider", () => {
    const favoriteFirst = printingSettings([
      { provider: "gallery", sortOrder: 0 },
      { provider: "official", sortOrder: 1, isFavorite: true },
    ]);
    const candidates = [
      printing("cc-gallery", { setId: "ogn", imageUrl: "https://img/gallery.png" }),
      printing("cc-official", { setId: "ogn", imageUrl: "https://img/official.png" }),
    ];
    const seed = buildPreseededActivePrinting(
      candidates,
      printingFields,
      favoriteFirst,
      labels,
      {},
    );
    expect(seed.imageUrl).toBe("https://img/official.png");
  });

  it("leaves imageUrl unset when no favorited provider has an image", () => {
    const noFavorites = printingSettings([
      { provider: "official", sortOrder: 0 },
      { provider: "gallery", sortOrder: 1 },
    ]);
    const candidates = [printing("cc-official", { setId: "ogn", imageUrl: "https://img/x.png" })];
    const seed = buildPreseededActivePrinting(candidates, printingFields, noFavorites, labels, {});
    expect(seed.imageUrl).toBeUndefined();
  });

  it("falls back to the set's release year when no source supplies printedYear", () => {
    const candidates = [printing("cc-official", { setId: "ogn" })];
    const seed = buildPreseededActivePrinting(
      candidates,
      printingFields,
      providerSettings,
      labels,
      {
        ogn: 2025,
      },
    );
    expect(seed.printedYear).toBe(2025);
  });

  it("keeps a source-supplied printedYear over the set's release year", () => {
    const candidates = [printing("cc-official", { setId: "ogn", printedYear: 2024 })];
    const seed = buildPreseededActivePrinting(
      candidates,
      printingFields,
      providerSettings,
      labels,
      {
        ogn: 2025,
      },
    );
    expect(seed.printedYear).toBe(2024);
  });

  it("leaves printedYear unset when the set has no known release year", () => {
    const candidates = [printing("cc-official", { setId: "ogn" })];
    const seed = buildPreseededActivePrinting(
      candidates,
      printingFields,
      providerSettings,
      labels,
      {},
    );
    expect(seed.printedYear).toBeUndefined();
  });
});

function acceptedPrinting(overrides: Partial<AdminPrintingResponse> = {}): AdminPrintingResponse {
  return {
    id: "p1",
    cardId: "card-1",
    expectedPrintingId: "OGN-001 · normal · EN",
    language: "EN",
    rarity: "rare",
    artVariant: "normal",
    isSigned: false,
    markerSlugs: [],
    finish: "normal",
    size: "standard",
    canonicalRank: 0,
    fallbackArtMode: "auto",
    fallbackImageFileId: null,
    ...overrides,
  } as AdminPrintingResponse;
}

function printingImage(
  overrides: Partial<AdminPrintingImageResponse> = {},
): AdminPrintingImageResponse {
  return {
    id: "img1",
    printingId: "p1",
    imageFileId: "file-1",
    face: "front",
    originalUrl: "https://cdn.test/a.png",
    rehostedUrl: "https://cdn.test/rehosted/a",
    isActive: true,
    ...overrides,
  } as AdminPrintingImageResponse;
}

describe("findDerivedArtPrinting", () => {
  it("derives from the standard printing of the same language", () => {
    const subject = acceptedPrinting({ id: "p1", finish: "metal", canonicalRank: 5 });
    const standard = acceptedPrinting({ id: "p2" });

    const derived = findDerivedArtPrinting(
      subject,
      [subject, standard],
      [printingImage({ printingId: "p2" })],
    );

    expect(derived?.id).toBe("p2");
  });

  it("prefers the printing's own language over EN", () => {
    const subject = acceptedPrinting({ id: "p1", language: "DE", finish: "metal" });
    const german = acceptedPrinting({
      id: "p2",
      language: "DE",
      expectedPrintingId: "OGN-001 · normal · DE",
    });
    const english = acceptedPrinting({ id: "p3", language: "EN" });

    const derived = findDerivedArtPrinting(
      subject,
      [subject, german, english],
      [printingImage({ printingId: "p2" }), printingImage({ id: "img2", printingId: "p3" })],
    );

    expect(derived?.id).toBe("p2");
  });

  it("ignores images that are inactive or not rehosted", () => {
    const subject = acceptedPrinting({ id: "p1", finish: "metal" });
    const standard = acceptedPrinting({ id: "p2" });
    const printings = [subject, standard];

    expect(
      findDerivedArtPrinting(subject, printings, [
        printingImage({ printingId: "p2", isActive: false }),
      ]),
    ).toBeNull();
    expect(
      findDerivedArtPrinting(subject, printings, [
        printingImage({ printingId: "p2", rehostedUrl: null }),
      ]),
    ).toBeNull();
  });

  it("returns null when no standard printing carries art", () => {
    const subject = acceptedPrinting({ id: "p1", finish: "metal" });
    const promo = acceptedPrinting({ id: "p2", markerSlugs: ["stamped"] });

    expect(
      findDerivedArtPrinting(subject, [subject, promo], [printingImage({ printingId: "p2" })]),
    ).toBeNull();
  });

  it("ignores the subject's own override", () => {
    const standard = acceptedPrinting({ id: "p2" });
    const images = [printingImage({ printingId: "p2" })];

    for (const mode of ["pinned", "none"] as const) {
      const subject = acceptedPrinting({
        id: "p1",
        finish: "metal",
        fallbackArtMode: mode,
        fallbackImageFileId: mode === "pinned" ? "file-9" : null,
      });
      expect(findDerivedArtPrinting(subject, [subject, standard], images)?.id).toBe("p2");
    }
  });
});
