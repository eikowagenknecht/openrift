import { describe, expect, it } from "vitest";

import { stubCopy } from "@/test/factories";

import { copyHasRecordedDetails } from "./copy-details-dialog";

describe("copyHasRecordedDetails", () => {
  it("returns false for a blank copy", () => {
    expect(copyHasRecordedDetails(stubCopy())).toBe(false);
  });

  it("counts an on-loan copy with no other details", () => {
    expect(copyHasRecordedDetails(stubCopy({ onLoan: true }))).toBe(true);
  });

  it("counts a raw condition", () => {
    expect(copyHasRecordedDetails(stubCopy({ condition: "near-mint" }))).toBe(true);
  });

  it("counts a grade only when both grader and grade are present", () => {
    expect(copyHasRecordedDetails(stubCopy({ grader: "psa" }))).toBe(false);
    expect(copyHasRecordedDetails(stubCopy({ grade: 9 }))).toBe(false);
    expect(copyHasRecordedDetails(stubCopy({ grader: "psa", grade: 9 }))).toBe(true);
  });

  // Regression: an altered flag (or a note, or links) alone used to read as
  // "No details yet" because the summary only looked at condition/grade.
  it("counts the altered flag on its own", () => {
    expect(copyHasRecordedDetails(stubCopy({ isAltered: true }))).toBe(true);
  });

  it("counts public and private notes", () => {
    expect(copyHasRecordedDetails(stubCopy({ notesPublic: "mint corners" }))).toBe(true);
    expect(copyHasRecordedDetails(stubCopy({ notesPrivate: "bought at locals" }))).toBe(true);
  });

  it("counts at least one link", () => {
    expect(copyHasRecordedDetails(stubCopy({ links: [{ url: "https://example.com" }] }))).toBe(
      true,
    );
  });
});
