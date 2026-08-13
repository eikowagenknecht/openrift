import type { CardSubmissionInput } from "@openrift/shared/contracts/card-submissions";
import { describe, expect, it } from "vitest";

import {
  buildUserSubmissionCard,
  formatSubmissionDateStamp,
  inferSubmissionKind,
} from "./ingest-user-submission.js";

const USER_ID = "11111111-2222-3333-4444-555555555555";
const STAMP = "20260702-0900";

function submission(overrides: Partial<CardSubmissionInput> = {}): CardSubmissionInput {
  return {
    slug: "ahri-alluring",
    card: {
      name: "Ahri, Alluring",
      types: ["unit"],
      super_types: ["champion"],
      domains: ["calm"],
      might: 4,
      energy: 5,
      power: 1,
      might_bonus: null,
      tags: ["Ahri"],
    },
    printings: [
      {
        public_code: "OGN-066/298",
        set_id: "ogn",
        set_name: "Origins",
        rarity: "rare",
        finish: "foil",
        language: "EN",
        printed_name: "Ahri, Alluring",
      },
    ],
    submissionNote: null,
    ...overrides,
  };
}

describe("formatSubmissionDateStamp", () => {
  it("formats a UTC instant as YYYYMMDD-HHmm", () => {
    expect(formatSubmissionDateStamp(new Date("2026-07-02T09:00:00.000Z"))).toBe(STAMP);
  });

  it("uses UTC, not the local timezone", () => {
    // A late-UTC instant must not roll to the next local day.
    expect(formatSubmissionDateStamp(new Date("2026-07-02T23:59:00.000Z"))).toBe("20260702-2359");
  });
});

describe("buildUserSubmissionCard", () => {
  it("mints the card external_id as <slug>--<dateStamp>--<userId>", () => {
    const card = buildUserSubmissionCard(submission(), USER_ID, STAMP);
    expect(card.external_id).toBe(`ahri-alluring--${STAMP}--${USER_ID}`);
  });

  it("maps the contribution card fields and nulls the card-level rules/short_code", () => {
    const card = buildUserSubmissionCard(submission(), USER_ID, STAMP);
    expect(card).toMatchObject({
      name: "Ahri, Alluring",
      types: ["unit"],
      super_types: ["champion"],
      domains: ["calm"],
      might: 4,
      rules_text: null,
      effect_text: null,
      short_code: null,
    });
  });

  it("derives printing short_code from the prefix of public_code", () => {
    const card = buildUserSubmissionCard(submission(), USER_ID, STAMP);
    expect(card.printings[0].short_code).toBe("OGN-066");
    expect(card.printings[0].public_code).toBe("OGN-066/298");
  });

  it("namespaces each printing external_id by slug, stamp, user, finish and language", () => {
    const card = buildUserSubmissionCard(submission(), USER_ID, STAMP);
    expect(card.printings[0].external_id).toBe(
      `ahri-alluring:OGN-066--${STAMP}--${USER_ID}:foil:en`,
    );
  });

  it("falls back to normal finish and EN language in the external_id when omitted", () => {
    const card = buildUserSubmissionCard(
      submission({
        printings: [{ public_code: "OGN-001/298" }],
      }),
      USER_ID,
      STAMP,
    );
    expect(card.printings[0].external_id).toContain(":normal:en");
    expect(card.printings[0].finish).toBeNull();
    expect(card.printings[0].language).toBeNull();
  });

  it("keeps multiple printings distinct", () => {
    const card = buildUserSubmissionCard(
      submission({
        printings: [
          { public_code: "OGN-066/298", finish: "foil" },
          { public_code: "OGN-066/298", finish: "normal" },
        ],
      }),
      USER_ID,
      STAMP,
    );
    expect(card.printings).toHaveLength(2);
    expect(card.printings[0].external_id).not.toBe(card.printings[1].external_id);
  });
});

describe("inferSubmissionKind", () => {
  it("calls an unmatched submission a new card", () => {
    const card = buildUserSubmissionCard(submission(), USER_ID, STAMP);
    expect(inferSubmissionKind(card, false)).toBe("new_card");
  });

  it("calls a matched submission carrying card data a correction", () => {
    // The correction form prefills every card field from the live card, which
    // is what separates it from an image suggestion.
    const card = buildUserSubmissionCard(submission(), USER_ID, STAMP);
    expect(inferSubmissionKind(card, true)).toBe("correction");
  });

  it("calls a matched, stats-free, image-carrying submission an image", () => {
    const card = buildUserSubmissionCard(
      submission({
        card: { name: "Ahri, Alluring" },
        printings: [
          {
            public_code: "OGN-066/298",
            set_id: "ogn",
            set_name: "Origins",
            image_url: "https://example.test/ahri.png",
            language: "EN",
          },
        ],
      }),
      USER_ID,
      STAMP,
    );
    expect(inferSubmissionKind(card, true)).toBe("image");
  });

  it("does not call it an image when only some printings carry one", () => {
    const card = buildUserSubmissionCard(
      submission({
        card: { name: "Ahri, Alluring" },
        printings: [
          { public_code: "OGN-066/298", image_url: "https://example.test/ahri.png" },
          { public_code: "OGN-067/298" },
        ],
      }),
      USER_ID,
      STAMP,
    );
    expect(inferSubmissionKind(card, true)).toBe("correction");
  });
});
