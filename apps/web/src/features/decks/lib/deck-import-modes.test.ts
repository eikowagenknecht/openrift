import { describe, expect, it } from "vitest";

import {
  DETECTED_FORMAT_LABELS,
  IMPORT_MODE_LABELS,
  IMPORT_MODE_ORDER,
  IMPORT_PLACEHOLDERS,
} from "./deck-import-modes";

describe("IMPORT_MODE_ORDER", () => {
  it("lists every labelled mode exactly once", () => {
    expect(IMPORT_MODE_ORDER.toSorted()).toEqual(Object.keys(IMPORT_MODE_LABELS).toSorted());
  });

  it("offers automatic detection first", () => {
    expect(IMPORT_MODE_ORDER[0]).toBe("auto");
  });
});

describe("IMPORT_PLACEHOLDERS", () => {
  it("gives every offered mode a placeholder", () => {
    for (const mode of IMPORT_MODE_ORDER) {
      expect(IMPORT_PLACEHOLDERS[mode]).not.toBe("");
    }
  });
});

describe("DETECTED_FORMAT_LABELS", () => {
  it("names every mode except automatic detection", () => {
    expect(Object.keys(DETECTED_FORMAT_LABELS).toSorted()).toEqual(
      IMPORT_MODE_ORDER.filter((mode) => mode !== "auto").toSorted(),
    );
  });
});
