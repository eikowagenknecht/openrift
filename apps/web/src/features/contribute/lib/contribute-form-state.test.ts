import { describe, expect, it } from "vitest";

import type { ContributeFormReducerState } from "@/features/contribute/lib/contribute-form-state";
import {
  contributeFormInitialState,
  contributeFormReducer,
  printingErrorIndexes,
} from "@/features/contribute/lib/contribute-form-state";
import type { ContributeFormState } from "@/features/contribute/lib/contribute-json";
import { emptyFormState, emptyPrinting } from "@/features/contribute/lib/contribute-json";

function withPrintedNames(...names: string[]): ContributeFormState {
  return {
    ...emptyFormState(),
    printings: names.map((printedName) => ({ ...emptyPrinting(), printedName })),
  };
}

function withCodes(...codes: string[]): ContributeFormState {
  return {
    ...emptyFormState(),
    printings: codes.map((publicCode) => ({ ...emptyPrinting(), publicCode })),
  };
}

function start(
  form: ContributeFormState = emptyFormState(),
  slugLocked = false,
): ContributeFormReducerState {
  return contributeFormInitialState(form, slugLocked);
}

function codesOf(state: ContributeFormReducerState): (string | null)[] {
  return state.form.printings.map((printing) => printing.publicCode);
}

function namesOf(state: ContributeFormReducerState): string[] {
  return state.form.printings.map((printing) => printing.printedName);
}

describe("contributeFormInitialState", () => {
  it("uses the passed form as both the draft and the diff baseline", () => {
    const form = withCodes("OGN-001/298");
    const state = start(form);

    expect(state.form).toBe(form);
    expect(state.baseline).toBe(form);
    expect(state).toMatchObject({ errors: [], submitted: false, activePrinting: 0, note: "" });
  });
});

describe("contributeFormReducer", () => {
  describe("setCardField", () => {
    it("sets a plain card field without touching the slug", () => {
      const state = contributeFormReducer(start(), {
        type: "setCardField",
        key: "domains",
        value: ["fury"],
      });

      expect(state.form.card.domains).toEqual(["fury"]);
      expect(state.form.slug).toBe("");
    });

    it("derives the slug from the name when the slug is unlocked", () => {
      const state = contributeFormReducer(start(), {
        type: "setCardField",
        key: "name",
        value: "Ahri, Alluring",
      });

      expect(state.form.slug).toBe("ahri-alluring");
    });

    it("keeps the slug when it is locked", () => {
      const locked = start({ ...emptyFormState(), slug: "ahri-alluring" }, true);

      const state = contributeFormReducer(locked, {
        type: "setCardField",
        key: "name",
        value: "Ahri, Nine-Tailed",
      });

      expect(state.form.slug).toBe("ahri-alluring");
      expect(state.form.card.name).toBe("Ahri, Nine-Tailed");
    });

    it("renames printings that matched the old name or were blank, leaving diverged ones", () => {
      const before = contributeFormReducer(start(withPrintedNames("Ahri", "", "Ahri (JP)")), {
        type: "setCardField",
        key: "name",
        value: "Ahri",
      });

      const state = contributeFormReducer(before, {
        type: "setCardField",
        key: "name",
        value: "Ahri, Alluring",
      });

      expect(namesOf(state)).toEqual(["Ahri, Alluring", "Ahri, Alluring", "Ahri (JP)"]);
    });
  });

  describe("setPrintingField", () => {
    it("changes only the addressed printing", () => {
      const state = contributeFormReducer(start(withCodes("A", "B")), {
        type: "setPrintingField",
        index: 1,
        key: "publicCode",
        value: "C",
      });

      expect(codesOf(state)).toEqual(["A", "C"]);
    });

    it("ignores an index outside the list", () => {
      const state = contributeFormReducer(start(withCodes("A")), {
        type: "setPrintingField",
        index: 4,
        key: "publicCode",
        value: "C",
      });

      expect(codesOf(state)).toEqual(["A"]);
    });
  });

  describe("addPrinting", () => {
    it("appends an empty printing and opens it", () => {
      const state = contributeFormReducer(start(withCodes("A")), { type: "addPrinting" });

      expect(codesOf(state)).toEqual(["A", null]);
      expect(state.activePrinting).toBe(1);
    });
  });

  describe("duplicatePrinting", () => {
    it("inserts the copy right after the source and opens it", () => {
      const state = contributeFormReducer(start(withCodes("A", "B")), {
        type: "duplicatePrinting",
        index: 0,
      });

      expect(codesOf(state)).toEqual(["A", "A", "B"]);
      expect(state.activePrinting).toBe(1);
    });

    it("leaves the state alone for an index outside the list", () => {
      const before = start(withCodes("A"));

      expect(contributeFormReducer(before, { type: "duplicatePrinting", index: 3 })).toBe(before);
    });
  });

  describe("removePrinting", () => {
    it("drops the printing and clamps the open one to the new last index", () => {
      const opened = contributeFormReducer(start(withCodes("A", "B")), {
        type: "setActivePrinting",
        index: 1,
      });

      const state = contributeFormReducer(opened, { type: "removePrinting", index: 1 });

      expect(codesOf(state)).toEqual(["A"]);
      expect(state.activePrinting).toBe(0);
    });

    it("keeps every printing closed when none was open", () => {
      const closed = contributeFormReducer(start(withCodes("A", "B")), {
        type: "setActivePrinting",
        index: null,
      });

      const state = contributeFormReducer(closed, { type: "removePrinting", index: 0 });

      expect(codesOf(state)).toEqual(["B"]);
      expect(state.activePrinting).toBeNull();
    });
  });

  describe("setNote", () => {
    it("stores the note", () => {
      const state = contributeFormReducer(start(), { type: "setNote", note: "Spotted in OGN." });

      expect(state.note).toBe("Spotted in OGN.");
    });
  });

  describe("prefill", () => {
    it("replaces draft and baseline, closes every printing and drops past errors", () => {
      const submitted = contributeFormReducer(start(), {
        type: "submitAttempt",
        result: { ok: false, errors: [{ path: "card.name", message: "Card name is required." }] },
      });
      const prefilled = withCodes("OGN-066/298");

      const state = contributeFormReducer(submitted, { type: "prefill", state: prefilled });

      expect(state.form).toBe(prefilled);
      expect(state.baseline).toBe(prefilled);
      expect(state).toMatchObject({ errors: [], submitted: false, activePrinting: null });
    });

    it("keeps the note", () => {
      const noted = contributeFormReducer(start(), { type: "setNote", note: "Keep me." });

      const state = contributeFormReducer(noted, { type: "prefill", state: emptyFormState() });

      expect(state.note).toBe("Keep me.");
    });
  });

  describe("reset", () => {
    it("returns an empty draft, clears the note and opens the first printing", () => {
      const dirty = contributeFormReducer(
        contributeFormReducer(start(withCodes("A", "B")), { type: "setNote", note: "Drop me." }),
        { type: "setActivePrinting", index: 1 },
      );

      const state = contributeFormReducer(dirty, { type: "reset" });

      expect(state.form).toEqual(emptyFormState());
      expect(state.baseline).toEqual(emptyFormState());
      expect(state).toMatchObject({ errors: [], submitted: false, activePrinting: 0, note: "" });
    });

    it("keeps the slug locked", () => {
      const state = contributeFormReducer(start(emptyFormState(), true), { type: "reset" });

      expect(state.slugLocked).toBe(true);
    });
  });

  describe("submitAttempt", () => {
    it("records the errors and opens the first failed printing", () => {
      const state = contributeFormReducer(start(withCodes("A", "B", "C")), {
        type: "submitAttempt",
        result: {
          ok: false,
          errors: [
            { path: "printings[2].publicCode", message: "Code is required." },
            { path: "printings[1].language", message: "Invalid language." },
          ],
        },
      });

      expect(state.submitted).toBe(true);
      expect(state.errors).toHaveLength(2);
      expect(state.activePrinting).toBe(1);
    });

    it("leaves the open printing alone when only the card failed", () => {
      const state = contributeFormReducer(start(withCodes("A", "B")), {
        type: "submitAttempt",
        result: { ok: false, errors: [{ path: "card.name", message: "Card name is required." }] },
      });

      expect(state.activePrinting).toBe(0);
    });

    it("leaves the open printing alone when validation passes", () => {
      const closed = contributeFormReducer(start(withCodes("A")), {
        type: "setActivePrinting",
        index: null,
      });

      const state = contributeFormReducer(closed, {
        type: "submitAttempt",
        result: { ok: true, errors: [] },
      });

      expect(state.submitted).toBe(true);
      expect(state.errors).toEqual([]);
      expect(state.activePrinting).toBeNull();
    });
  });
});

describe("printingErrorIndexes", () => {
  it("collects the printing indexes and ignores card-level paths", () => {
    const indexes = printingErrorIndexes([
      { path: "card.name", message: "Card name is required." },
      { path: "slug", message: "Slug must be lowercase letters, digits, and hyphens." },
      { path: "printings[0].publicCode", message: "Code is required." },
      { path: "printings[10].imageUrl", message: "Invalid URL." },
      { path: "printings[0].language", message: "Invalid language." },
    ]);

    expect([...indexes].toSorted((a, b) => a - b)).toEqual([0, 10]);
  });
});
