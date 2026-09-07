import type { CopyResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { stubCopy } from "@/test/factories";

import { decideRemoval, pickNewestCopy, pickRemovalCopy } from "./use-quick-add-actions-helpers";

function copy(
  id: string,
  printingId: string,
  collectionId: string,
  groupId: string | null = null,
): CopyResponse {
  return stubCopy({ id, printingId, collectionId, groupId });
}

function annotatedCopy(
  id: string,
  printingId: string,
  collectionId: string,
  overrides: Partial<CopyResponse> = { condition: "near-mint" },
): CopyResponse {
  return stubCopy({ id, printingId, collectionId, groupId: null, ...overrides });
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

describe("pickRemovalCopy", () => {
  it("prefers the newest bare copy over a newer annotated one", () => {
    const bareOlder = copy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1");
    const bareNewer = copy("01900000-0000-7000-8000-000000000050", "pr-1", "col-1");
    const annotatedNewest = annotatedCopy("01900000-0000-7000-8000-000000000099", "pr-1", "col-1");
    expect(pickRemovalCopy([bareOlder, annotatedNewest, bareNewer])).toBe(bareNewer);
  });

  it("falls back to the newest annotated copy when every copy is annotated", () => {
    const older = annotatedCopy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1");
    const newer = annotatedCopy("01900000-0000-7000-8000-000000000099", "pr-1", "col-1", {
      notesPrivate: "graded at Worlds",
    });
    expect(pickRemovalCopy([older, newer])).toBe(newer);
  });

  it("returns undefined for an empty list", () => {
    expect(pickRemovalCopy([])).toBeUndefined();
  });

  it("skips a reserved copy even when it would otherwise be picked first", () => {
    const reservedNewest = stubCopy({
      id: "01900000-0000-7000-8000-000000000099",
      printingId: "pr-1",
      collectionId: "col-1",
      groupId: null,
      reserved: true,
    });
    const bareOlder = copy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1");
    const bareMiddle = copy("01900000-0000-7000-8000-000000000050", "pr-1", "col-1");
    expect(pickRemovalCopy([reservedNewest, bareOlder, bareMiddle])).toBe(bareMiddle);
  });

  it("returns undefined when every candidate copy is reserved", () => {
    const reservedA = stubCopy({
      id: "01900000-0000-7000-8000-000000000001",
      printingId: "pr-1",
      collectionId: "col-1",
      groupId: null,
      reserved: true,
    });
    const reservedB = stubCopy({
      id: "01900000-0000-7000-8000-000000000099",
      printingId: "pr-1",
      collectionId: "col-1",
      groupId: null,
      reserved: true,
    });
    expect(pickRemovalCopy([reservedA, reservedB])).toBeUndefined();
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

  it("prefers a bare copy over a newer annotated one within the collection", () => {
    const bare = copy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1");
    const annotated = annotatedCopy("01900000-0000-7000-8000-000000000099", "pr-1", "col-1");
    expect(decideRemoval([bare, annotated], "pr-1", "col-1")).toEqual({
      kind: "dispose",
      copyId: bare.id,
    });
  });

  it("asks for confirmation when only annotated copies remain", () => {
    const older = annotatedCopy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1");
    const newer = annotatedCopy("01900000-0000-7000-8000-000000000099", "pr-1", "col-1");
    expect(decideRemoval([older, newer], "pr-1", "col-1")).toEqual({
      kind: "confirmDispose",
      copyId: newer.id,
    });
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

  it("excludes optimistic temp rows when picking the newest", () => {
    const copies = [
      copy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1"),
      copy("temp-99999999-0000-0000-0000-000000000099", "pr-1", "col-1"),
    ];
    expect(decideRemoval(copies, "pr-1")).toEqual({
      kind: "dispose",
      copyId: "01900000-0000-7000-8000-000000000001",
    });
  });

  it("returns 'none' when only a temp row matches the printing", () => {
    const copies = [copy("temp-99999999-0000-0000-0000-000000000099", "pr-1", "col-1")];
    expect(decideRemoval(copies, "pr-1")).toEqual({ kind: "none" });
  });

  it("ignores group-collection copies when unscoped, disposing the personal one", () => {
    const copies = [
      copy("01900000-0000-7000-8000-000000000010", "pr-1", "col-personal"),
      copy("01900000-0000-7000-8000-000000000020", "pr-1", "col-group", "group-1"),
    ];
    expect(decideRemoval(copies, "pr-1")).toEqual({
      kind: "dispose",
      copyId: "01900000-0000-7000-8000-000000000010",
    });
  });

  it("returns 'none' when the only matching copies are in a group collection (unscoped)", () => {
    const copies = [copy("01900000-0000-7000-8000-000000000020", "pr-1", "col-group", "group-1")];
    expect(decideRemoval(copies, "pr-1")).toEqual({ kind: "none" });
  });

  it("still removes group copies when explicitly scoped to that group collection", () => {
    const copies = [copy("01900000-0000-7000-8000-000000000020", "pr-1", "col-group", "group-1")];
    expect(decideRemoval(copies, "pr-1", "col-group")).toEqual({
      kind: "dispose",
      copyId: "01900000-0000-7000-8000-000000000020",
    });
  });

  it("does not open the picker on a multi-collection spread that's only real on one side", () => {
    const copies = [
      copy("01900000-0000-7000-8000-000000000010", "pr-1", "col-A"),
      copy("temp-22222222-0000-0000-0000-000000000022", "pr-1", "col-B"),
    ];
    expect(decideRemoval(copies, "pr-1")).toEqual({
      kind: "dispose",
      copyId: "01900000-0000-7000-8000-000000000010",
    });
  });
});
