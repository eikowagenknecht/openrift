import type { CopyResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { decideRemoval, pickNewestCopy } from "./use-quick-add-actions-helpers";

function copy(id: string, printingId: string, collectionId: string): CopyResponse {
  return { id, printingId, collectionId };
}

describe("pickNewestCopy", () => {
  it("returns undefined for an empty list", () => {
    expect(pickNewestCopy([])).toBeUndefined();
  });

  it("returns the single entry when there's only one", () => {
    const only = copy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1");
    expect(pickNewestCopy([only])).toBe(only);
  });

  it("picks the lexicographically largest id (uuidv7 newest)", () => {
    const older = copy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1");
    const newer = copy("01900000-0000-7000-8000-000000000099", "pr-1", "col-1");
    expect(pickNewestCopy([older, newer])).toBe(newer);
    expect(pickNewestCopy([newer, older])).toBe(newer);
  });
});

describe("decideRemoval", () => {
  it("returns 'none' when no copies match the printing", () => {
    const copies = [copy("c1", "pr-OTHER", "col-1")];
    expect(decideRemoval(copies, "pr-1")).toEqual({ kind: "none" });
  });

  it("returns 'none' when the scoped collection has no matching copies", () => {
    const copies = [copy("c1", "pr-1", "col-1")];
    expect(decideRemoval(copies, "pr-1", "col-OTHER")).toEqual({ kind: "none" });
  });

  it("disposes the newest copy when all matches live in one collection", () => {
    const copies = [
      copy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1"),
      copy("01900000-0000-7000-8000-000000000099", "pr-1", "col-1"),
      copy("01900000-0000-7000-8000-000000000050", "pr-1", "col-1"),
    ];
    expect(decideRemoval(copies, "pr-1")).toEqual({
      kind: "dispose",
      copyId: "01900000-0000-7000-8000-000000000099",
    });
  });

  it("scopes to viewCollectionId, disposing the newest from that collection only", () => {
    const copies = [
      copy("01900000-0000-7000-8000-000000000099", "pr-1", "col-2"),
      copy("01900000-0000-7000-8000-000000000050", "pr-1", "col-1"),
      copy("01900000-0000-7000-8000-000000000010", "pr-1", "col-1"),
    ];
    expect(decideRemoval(copies, "pr-1", "col-1")).toEqual({
      kind: "dispose",
      copyId: "01900000-0000-7000-8000-000000000050",
    });
  });

  it("opens the picker when copies span multiple collections and no scope is set", () => {
    const copies = [copy("c1", "pr-1", "col-A"), copy("c2", "pr-1", "col-B")];
    expect(decideRemoval(copies, "pr-1")).toEqual({ kind: "picker" });
  });

  it("does not open the picker when scoped to one collection, even if other collections also own the printing", () => {
    const copies = [
      copy("01900000-0000-7000-8000-000000000010", "pr-1", "col-A"),
      copy("01900000-0000-7000-8000-000000000020", "pr-1", "col-B"),
    ];
    expect(decideRemoval(copies, "pr-1", "col-A")).toEqual({
      kind: "dispose",
      copyId: "01900000-0000-7000-8000-000000000010",
    });
  });

  it("ignores copies of unrelated printings", () => {
    const copies = [
      copy("c1", "pr-OTHER", "col-A"),
      copy("c2", "pr-1", "col-B"),
      copy("c3", "pr-OTHER", "col-C"),
    ];
    expect(decideRemoval(copies, "pr-1")).toEqual({
      kind: "dispose",
      copyId: "c2",
    });
  });
});
