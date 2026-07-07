import { describe, expect, it } from "vitest";

import type { CopyViewRow } from "@/lib/copies-collection";
import { stubCopy } from "@/test/factories";

import { decideRemoval, pickNewestCopy } from "./use-quick-add-actions-helpers";

function copy(id: string, printingId: string, collectionId: string, synced = true): CopyViewRow {
  return { ...stubCopy({ id, printingId, collectionId }), synced };
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

  // Regression: an optimistic row whose add hasn't round-tripped yet
  // (synced: false) must not be picked by the minus button — dispose would
  // 404 on the API (the server doesn't know the id yet) or race the
  // in-flight add. Successor of the old temp-id guard (Sentry OPENRIFT-SSR-R).
  it("excludes unsynced optimistic rows when picking the newest", () => {
    const copies = [
      copy("01900000-0000-7000-8000-000000000001", "pr-1", "col-1"),
      copy("01900000-0000-7000-8000-000000000099", "pr-1", "col-1", false),
    ];
    expect(decideRemoval(copies, "pr-1")).toEqual({
      kind: "dispose",
      copyId: "01900000-0000-7000-8000-000000000001",
    });
  });

  it("returns 'none' when only an unsynced row matches the printing", () => {
    const copies = [copy("01900000-0000-7000-8000-000000000099", "pr-1", "col-1", false)];
    expect(decideRemoval(copies, "pr-1")).toEqual({ kind: "none" });
  });

  it("does not open the picker on a multi-collection spread that's only synced on one side", () => {
    // Synced copy in col-A, unsynced-only in col-B → after filtering, only
    // col-A is in play, so this disposes from col-A rather than opening the
    // picker.
    const copies = [
      copy("01900000-0000-7000-8000-000000000010", "pr-1", "col-A"),
      copy("01900000-0000-7000-8000-000000000022", "pr-1", "col-B", false),
    ];
    expect(decideRemoval(copies, "pr-1")).toEqual({
      kind: "dispose",
      copyId: "01900000-0000-7000-8000-000000000010",
    });
  });
});
