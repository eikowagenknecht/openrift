import { describe, expect, it } from "vitest";

import {
  copyHasMetadata,
  definedCopyMetadataFields,
  normalizeCopyMetadataPatch,
} from "./copy-metadata.js";

const BARE_COPY = {
  condition: null,
  grader: null,
  grade: null,
  notesPublic: null,
  notesPrivate: null,
  isAltered: false,
  links: [],
};

describe("copyHasMetadata", () => {
  it("is false for a bare copy", () => {
    expect(copyHasMetadata(BARE_COPY)).toBe(false);
  });

  it("is false for a bare public-projection copy (no notesPrivate key)", () => {
    const { notesPrivate: _omitted, ...publicCopy } = BARE_COPY;
    expect(copyHasMetadata(publicCopy)).toBe(false);
  });

  it.each([
    ["condition", { condition: "mint" }],
    ["grading", { grader: "psa", grade: 9.5 }],
    ["altered flag", { isAltered: true }],
    ["public notes", { notesPublic: "hi" }],
    ["private notes", { notesPrivate: "hi" }],
    ["links", { links: [{ url: "https://example.com/a.jpg" }] }],
  ])("is true when %s is set", (_label, overrides) => {
    expect(copyHasMetadata({ ...BARE_COPY, ...overrides })).toBe(true);
  });
});

describe("normalizeCopyMetadataPatch", () => {
  it("passes through an unrelated patch untouched", () => {
    expect(normalizeCopyMetadataPatch({ notesPublic: "hi", isAltered: true })).toEqual({
      notesPublic: "hi",
      isAltered: true,
    });
  });

  it("setting a condition clears grading", () => {
    expect(normalizeCopyMetadataPatch({ condition: "mint" })).toEqual({
      condition: "mint",
      grader: null,
      grade: null,
    });
  });

  it("setting grading clears the condition", () => {
    expect(normalizeCopyMetadataPatch({ grader: "psa", grade: 9.5 })).toEqual({
      grader: "psa",
      grade: 9.5,
      condition: null,
    });
  });

  it("clearing one half of grader/grade clears both", () => {
    expect(normalizeCopyMetadataPatch({ grader: null })).toEqual({ grader: null, grade: null });
    expect(normalizeCopyMetadataPatch({ grade: null })).toEqual({ grader: null, grade: null });
  });

  it("clearing the condition alone leaves grading untouched", () => {
    expect(normalizeCopyMetadataPatch({ condition: null })).toEqual({ condition: null });
  });

  it("does not mutate the input", () => {
    const patch = { condition: "mint" as const };
    normalizeCopyMetadataPatch(patch);
    expect(patch).toEqual({ condition: "mint" });
  });
});

describe("definedCopyMetadataFields", () => {
  it("drops undefined keys but keeps explicit nulls", () => {
    expect(
      definedCopyMetadataFields({ condition: null, grader: undefined, notesPublic: "x" }),
    ).toEqual({ condition: null, notesPublic: "x" });
  });

  it("returns an empty object for an empty patch", () => {
    expect(definedCopyMetadataFields({})).toEqual({});
  });
});
