import { describe, expect, it } from "vitest";

import { candidateExportDocumentSchema, uploadCandidatesSchema } from "./card-mutations.js";

// The `exportCandidates` endpoint emits `candidateExportDocumentSchema` and it is
// meant to be re-uploaded through `uploadCandidatesSchema`. The two are separate
// schemas (strict emit vs lenient, value-validated input), so nothing at the type
// level forces them to stay compatible — this test is the guard. If either schema
// drifts so an export can no longer be re-imported, this fails.

// A representative export document, matching the shape `buildExport` produces.
const sampleExport = [
  {
    card: {
      name: "Test Card",
      types: ["Unit"],
      super_types: [] as string[],
      domains: ["Fury"],
      might: 3,
      energy: 2,
      power: null,
      might_bonus: null,
      rules_text: null,
      effect_text: null,
      tags: [] as string[],
      short_code: "ogn-001",
      external_id: "11111111-1111-4111-8111-111111111111",
      extra_data: null,
    },
    printings: [
      {
        short_code: "OGN-001",
        set_id: "ogn",
        set_name: "Origins",
        rarity: "Epic",
        art_variant: "normal",
        is_signed: false,
        finish: "foil",
        artist: "Someone",
        public_code: "001",
        printed_rules_text: null,
        printed_effect_text: null,
        image_url: "https://example.test/img.png",
        flavor_text: null,
        external_id: "22222222-2222-4222-8222-222222222222",
        extra_data: { image_id: "33333333-3333-4333-8333-333333333333" },
        // The fields a prior export silently dropped — they must round-trip.
        language: "ZH",
        printed_name: "遗弃",
        // marker_slugs / distribution_channel_slugs are admin-curated and
        // deliberately absent from the export (optional in the document schema).
      },
    ],
  },
];

describe("candidate export ↔ upload round-trip", () => {
  it("a valid export document parses as the export output schema", () => {
    expect(candidateExportDocumentSchema.safeParse(sampleExport).success).toBe(true);
  });

  it("the same export re-parses as a valid upload body", () => {
    const result = uploadCandidatesSchema.safeParse({
      provider: "roundtrip",
      candidates: sampleExport,
    });
    expect(result.success).toBe(true);
  });

  it("a legacy export with a scalar `type` still uploads, folded into `types` (ADR-037)", () => {
    const legacy = structuredClone(sampleExport) as unknown as Record<string, unknown>[];
    const card = (legacy[0] as { card: Record<string, unknown> }).card;
    delete card.types;
    card.type = "Unit";
    const result = uploadCandidatesSchema.safeParse({ provider: "roundtrip", candidates: legacy });
    expect(result.success).toBe(true);
    expect(result.data?.candidates[0].types).toEqual(["Unit"]);
  });

  it("language and printed_name are part of the exported document (not droppable)", () => {
    const missingFields = structuredClone(sampleExport);
    // @ts-expect-error — deleting a required key to prove the schema demands it.
    delete missingFields[0].printings[0].language;
    expect(candidateExportDocumentSchema.safeParse(missingFields).success).toBe(false);
  });
});
