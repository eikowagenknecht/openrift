import { describe, expect, it } from "vitest";

import { toCopy, toPublicCopy } from "./copy-presenters.js";

const COPY_METADATA = {
  condition: "near-mint",
  grader: null,
  grade: null,
  notesPublic: "Pack fresh",
  notesPrivate: "Bought at Worlds",
  isAltered: false,
  links: [{ url: "https://example.com/front.jpg", label: "Front" }],
};

describe("toCopy", () => {
  it("maps a copy row including its metadata", () => {
    const result = toCopy({
      id: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      groupId: null,
      ...COPY_METADATA,
      onLoan: false,
      reserved: false,
    });
    expect(result).toEqual({
      id: "copy-1",
      printingId: "p-1",
      collectionId: "col-1",
      groupId: null,
      ...COPY_METADATA,
      onLoan: false,
      reserved: false,
    });
  });
});

describe("toPublicCopy", () => {
  it("exposes public metadata but never notesPrivate", () => {
    const result = toPublicCopy({
      id: "copy-1",
      printingId: "p-1",
      ...COPY_METADATA,
    });
    expect(result).toEqual({
      id: "copy-1",
      printingId: "p-1",
      condition: "near-mint",
      grader: null,
      grade: null,
      notesPublic: "Pack fresh",
      isAltered: false,
      links: [{ url: "https://example.com/front.jpg", label: "Front" }],
    });
    expect(result).not.toHaveProperty("notesPrivate");
    expect(result).not.toHaveProperty("collectionId");
    expect(result).not.toHaveProperty("groupId");
  });
});
