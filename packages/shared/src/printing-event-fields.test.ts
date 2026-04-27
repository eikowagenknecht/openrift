import { describe, expect, it } from "bun:test";

import { humanizePrintingField } from "./printing-event-fields.js";

describe("humanizePrintingField", () => {
  it("returns the curated label for known fields", () => {
    expect(humanizePrintingField("printedRulesText")).toBe("Rules text");
    expect(humanizePrintingField("markerSlugs")).toBe("Markers");
    expect(humanizePrintingField("setId")).toBe("Set");
    expect(humanizePrintingField("publicCode")).toBe("Public code");
  });

  it("falls back to a generic camelCase split for unknown fields", () => {
    expect(humanizePrintingField("someNewField")).toBe("Some new field");
    expect(humanizePrintingField("urgent")).toBe("Urgent");
  });

  it("handles snake_case fields in the fallback", () => {
    expect(humanizePrintingField("printed_rules_text")).toBe("Printed rules text");
  });

  it("returns the original string unchanged when it would otherwise be empty", () => {
    expect(humanizePrintingField("")).toBe("");
  });
});
