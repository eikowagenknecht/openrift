import { describe, expect, it } from "vitest";

import { stubCopy } from "@/test/factories";

import { copyHasRecordedDetails, copyMarkers } from "./copy-indicators";

describe("copyHasRecordedDetails", () => {
  it("returns false for a blank copy", () => {
    expect(copyHasRecordedDetails(stubCopy())).toBe(false);
  });

  it("counts an on-loan copy with no other details", () => {
    expect(copyHasRecordedDetails(stubCopy({ onLoan: true }))).toBe(true);
  });

  it("counts a copy pinned to a live trade with no other details", () => {
    expect(copyHasRecordedDetails(stubCopy({ reserved: true }))).toBe(true);
  });

  it("counts a raw condition", () => {
    expect(copyHasRecordedDetails(stubCopy({ condition: "near-mint" }))).toBe(true);
  });

  it("counts a grade only when both grader and grade are present", () => {
    expect(copyHasRecordedDetails(stubCopy({ grader: "psa" }))).toBe(false);
    expect(copyHasRecordedDetails(stubCopy({ grade: 9 }))).toBe(false);
    expect(copyHasRecordedDetails(stubCopy({ grader: "psa", grade: 9 }))).toBe(true);
  });

  it("counts any marker on its own", () => {
    expect(copyHasRecordedDetails(stubCopy({ isAltered: true }))).toBe(true);
    expect(copyHasRecordedDetails(stubCopy({ notesPublic: "mint corners" }))).toBe(true);
    expect(copyHasRecordedDetails(stubCopy({ notesPrivate: "bought at locals" }))).toBe(true);
    expect(copyHasRecordedDetails(stubCopy({ links: [{ url: "https://example.com" }] }))).toBe(
      true,
    );
  });
});

describe("copyMarkers", () => {
  it("returns no markers for a blank copy", () => {
    expect(copyMarkers(stubCopy())).toEqual([]);
  });

  it("excludes condition, grade, loan, and reservation (those render bespoke)", () => {
    const copy = stubCopy({
      condition: "near-mint",
      grader: "psa",
      grade: 9,
      onLoan: true,
      reserved: true,
    });
    expect(copyMarkers(copy)).toEqual([]);
  });

  it("splits public and private notes into distinct markers", () => {
    const markers = copyMarkers(
      stubCopy({ notesPublic: "front scratch", notesPrivate: "paid $5" }),
    );
    expect(markers.map((m) => m.key)).toEqual(["note", "private-note"]);
    expect(markers[0]!.content).toBe("front scratch");
    expect(markers[1]!.content).toBe("paid $5");
  });

  it("orders markers altered, public note, private note, links", () => {
    const copy = stubCopy({
      isAltered: true,
      notesPublic: "note",
      notesPrivate: "secret",
      links: [{ url: "https://example.com" }],
    });
    expect(copyMarkers(copy).map((m) => m.key)).toEqual([
      "altered",
      "note",
      "private-note",
      "links",
    ]);
  });

  it("carries a link count and a newline-joined tooltip of labels or urls", () => {
    const copy = stubCopy({
      links: [{ url: "https://a.example", label: "Front" }, { url: "https://b.example" }],
    });
    const [links] = copyMarkers(copy);
    expect(links!.count).toBe(2);
    expect(links!.label).toBe("2 links");
    expect(links!.content).toBe("Front\nhttps://b.example");
  });

  it("labels a single link in the singular", () => {
    const [links] = copyMarkers(stubCopy({ links: [{ url: "https://a.example" }] }));
    expect(links!.label).toBe("1 link");
  });
});
