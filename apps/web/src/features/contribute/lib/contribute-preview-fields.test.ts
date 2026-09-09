import { describe, expect, it } from "vitest";

import { emptyFormState } from "@/features/contribute/lib/contribute-json";
import {
  errorField,
  errorLabel,
  errorPrintingIndex,
  filledPreviewFields,
} from "@/features/contribute/lib/contribute-preview-fields";

describe("errorLabel", () => {
  it("names a card field", () => {
    expect(errorLabel("card.name")).toBe("Card name");
  });

  it("reads a slug failure as the name it derives from", () => {
    expect(errorLabel("slug")).toBe("Card name");
  });

  it("numbers a printing field from one", () => {
    expect(errorLabel("printings[2].publicCode")).toBe("Printing 3: Code");
  });

  it("falls back to the raw path when nothing maps", () => {
    expect(errorLabel("something.unknown")).toBe("something.unknown");
  });
});

describe("errorField", () => {
  it("maps a card path to its preview region", () => {
    expect(errorField("card.name")).toBe("card.name");
  });

  it("maps a printing path regardless of index", () => {
    expect(errorField("printings[4].flavorText")).toBe("printing.flavorText");
  });

  it("returns null for a field the card does not show", () => {
    expect(errorField("printings[0].language")).toBeNull();
  });
});

describe("errorPrintingIndex", () => {
  it("reads the index out of a printing path", () => {
    expect(errorPrintingIndex("printings[3].publicCode")).toBe(3);
  });

  it("returns null for a card path", () => {
    expect(errorPrintingIndex("card.name")).toBeNull();
  });
});

describe("filledPreviewFields", () => {
  it("treats an empty form as having nothing on the card", () => {
    expect(filledPreviewFields(emptyFormState(), 0).size).toBe(0);
  });

  it("counts a card name once it has more than whitespace", () => {
    const state = emptyFormState();
    state.card.name = "  ";
    expect(filledPreviewFields(state, 0).has("card.name")).toBe(false);

    state.card.name = "Ahri, Alluring";
    expect(filledPreviewFields(state, 0).has("card.name")).toBe(true);
  });

  it("counts supertypes towards the type stripe", () => {
    const state = emptyFormState();
    state.card.superTypes = ["champion"];
    expect(filledPreviewFields(state, 0).has("card.types")).toBe(true);
  });

  it("counts a zero stat as filled", () => {
    const state = emptyFormState();
    state.card.energy = 0;
    expect(filledPreviewFields(state, 0).has("card.energy")).toBe(true);
  });

  it("reads printing fields from the active printing", () => {
    const state = emptyFormState();
    state.printings = [
      { ...state.printings[0]!, publicCode: "OGN-066/298" },
      { ...state.printings[0]!, artist: "Riot Artist" },
    ];

    const first = filledPreviewFields(state, 0);
    expect(first.has("printing.publicCode")).toBe(true);
    expect(first.has("printing.artist")).toBe(false);

    const second = filledPreviewFields(state, 1);
    expect(second.has("printing.publicCode")).toBe(false);
    expect(second.has("printing.artist")).toBe(true);
  });

  it("falls back to the first printing when none is open", () => {
    const state = emptyFormState();
    state.printings[0]!.rarity = "common";
    expect(filledPreviewFields(state, null).has("printing.rarity")).toBe(true);
  });
});
