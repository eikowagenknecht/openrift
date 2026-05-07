import { describe, expect, it } from "bun:test";

import { contributionFileSchema } from "./contribute-schema.js";

const STAMP = "20260501-1200";

function validFile() {
  return {
    $schema: "../../schemas/card.schema.json",
    card: {
      name: "Ahri, Alluring",
      external_id: `community:ahri-alluring--${STAMP}`,
      type: "unit",
      super_types: ["champion"],
      domains: ["calm"],
      might: 4,
      energy: 5,
      power: 1,
      tags: ["Ahri", "Ionia"],
    },
    printings: [
      {
        public_code: "OGN-066/298",
        external_id: `community:ahri-alluring:OGN-066--${STAMP}:foil:en`,
        set_id: "ogn",
        set_name: "Origins",
        rarity: "rare",
        art_variant: "normal",
        is_signed: false,
        finish: "foil",
        artist: "League Splash Team",
        image_url: "https://example.com/ogn-066.png",
        language: "EN",
        printed_name: "Ahri, Alluring",
      },
    ],
  };
}

describe("contributionFileSchema", () => {
  it("accepts a complete, well-formed file", () => {
    const result = contributionFileSchema.safeParse(validFile());
    expect(result.success).toBe(true);
  });

  it("accepts a minimal file (only the four required fields)", () => {
    const file = {
      card: {
        name: "Ahri, Alluring",
        external_id: `community:ahri-alluring--${STAMP}`,
      },
      printings: [
        {
          public_code: "OGN-066/298",
          external_id: `community:ahri-alluring:OGN-066--${STAMP}:foil:en`,
        },
      ],
    };
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it("rejects a missing card.name", () => {
    const file = validFile();
    file.card.name = "";
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "card.name")).toBe(true);
  });

  it("rejects a missing card.external_id", () => {
    const file = validFile();
    delete (file.card as Partial<typeof file.card>).external_id;
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "card.external_id")).toBe(true);
  });

  it("rejects a missing public_code on a printing", () => {
    const file = validFile();
    delete (file.printings[0] as Partial<(typeof file.printings)[0]>).public_code;
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "printings.0.public_code")).toBe(
      true,
    );
  });

  it("rejects a missing printings array", () => {
    const file = validFile();
    file.printings = [];
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects an external_id that doesn't start with community:", () => {
    const file = validFile();
    file.card.external_id = "official:ahri";
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "card.external_id")).toBe(true);
  });

  it("rejects an http (non-https) image URL", () => {
    const file = validFile();
    file.printings[0].image_url = "http://example.com/img.png";
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects a 3-letter language code", () => {
    const file = validFile();
    file.printings[0].language = "ENG";
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects a lowercase language code", () => {
    const file = validFile();
    file.printings[0].language = "en";
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("accepts a null language", () => {
    const file = validFile();
    file.printings[0].language = null as unknown as string;
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it("rejects a printed_year below 1900", () => {
    const file = validFile();
    (file.printings[0] as { printed_year?: number }).printed_year = 1899;
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects a printed_year above 2999", () => {
    const file = validFile();
    (file.printings[0] as { printed_year?: number }).printed_year = 3000;
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("accepts an integer printed_year in range", () => {
    const file = validFile();
    (file.printings[0] as { printed_year?: number }).printed_year = 2025;
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it("rejects unknown properties on the card", () => {
    const file = validFile();
    (file.card as Record<string, unknown>).extra_data = { foo: "bar" };
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects unknown properties on a printing", () => {
    const file = validFile();
    (file.printings[0] as Record<string, unknown>).extra_data = { foo: "bar" };
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("rejects unknown properties on the file root", () => {
    const file = validFile();
    (file as Record<string, unknown>).comment = "hello";
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(false);
  });

  it("accepts an empty domains array (looser than the DB)", () => {
    const file = validFile();
    file.card.domains = [];
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it("accepts an _instructions string at the root", () => {
    const file = validFile();
    (file as Record<string, unknown>)._instructions = "stripped on PR open";
    const result = contributionFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });
});
