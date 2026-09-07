import { describe, expect, it } from "vitest";

import { TEMP_COPY_ID_PREFIX } from "@/lib/temp-copy-id";
import { stubCopy } from "@/test/factories";

import { buildMoveSources, groupMovableCopies, movableCountsByPrinting } from "./move-sources";

const TARGET = "col-target";
const INBOX = "col-inbox";
const BINDER = "col-binder";

describe("groupMovableCopies", () => {
  it("groups copies by printing and excludes the target collection", () => {
    const copies = [
      stubCopy({ id: "c1", printingId: "p1", collectionId: INBOX }),
      stubCopy({ id: "c2", printingId: "p1", collectionId: BINDER }),
      stubCopy({ id: "c3", printingId: "p2", collectionId: INBOX }),
      stubCopy({ id: "c4", printingId: "p1", collectionId: TARGET }),
    ];
    const grouped = groupMovableCopies(copies, { excludeCollectionId: TARGET });
    expect(grouped.get("p1")?.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(grouped.get("p2")?.map((c) => c.id)).toEqual(["c3"]);
  });

  it("drops trade-reserved copies and optimistic temp rows", () => {
    const copies = [
      stubCopy({ id: "c1", printingId: "p1", collectionId: INBOX, reserved: true }),
      stubCopy({ id: `${TEMP_COPY_ID_PREFIX}abc`, printingId: "p1", collectionId: INBOX }),
      stubCopy({ id: "c3", printingId: "p1", collectionId: INBOX }),
    ];
    const grouped = groupMovableCopies(copies, { excludeCollectionId: TARGET });
    expect(grouped.get("p1")?.map((c) => c.id)).toEqual(["c3"]);
  });

  it("restricts to one source collection when onlyCollectionId is set", () => {
    const copies = [
      stubCopy({ id: "c1", printingId: "p1", collectionId: INBOX }),
      stubCopy({ id: "c2", printingId: "p1", collectionId: BINDER }),
    ];
    const grouped = groupMovableCopies(copies, {
      excludeCollectionId: TARGET,
      onlyCollectionId: BINDER,
    });
    expect(grouped.get("p1")?.map((c) => c.id)).toEqual(["c2"]);
  });

  it("returns an empty map for no movable copies", () => {
    const grouped = groupMovableCopies([], { excludeCollectionId: TARGET });
    expect(grouped.size).toBe(0);
  });
});

describe("buildMoveSources", () => {
  it("puts the inbox first, then larger stashes", () => {
    const copies = [
      stubCopy({ id: "c1", printingId: "p1", collectionId: BINDER }),
      stubCopy({ id: "c2", printingId: "p1", collectionId: BINDER }),
      stubCopy({ id: "c3", printingId: "p1", collectionId: "col-small" }),
      stubCopy({ id: "c4", printingId: "p1", collectionId: INBOX }),
    ];
    const sources = buildMoveSources(copies, INBOX);
    expect(sources.map((s) => s.collectionId)).toEqual([INBOX, BINDER, "col-small"]);
  });

  it("orders sources by size when no inbox is involved", () => {
    const copies = [
      stubCopy({ id: "c1", printingId: "p1", collectionId: "col-a" }),
      stubCopy({ id: "c2", printingId: "p1", collectionId: "col-b" }),
      stubCopy({ id: "c3", printingId: "p1", collectionId: "col-b" }),
    ];
    const sources = buildMoveSources(copies, INBOX);
    expect(sources.map((s) => s.collectionId)).toEqual(["col-b", "col-a"]);
  });

  it("orders copies within a source plainest-first", () => {
    const copies = [
      stubCopy({ id: "graded", collectionId: INBOX, grader: "psa", grade: 9 }),
      stubCopy({ id: "noted", collectionId: INBOX, notesPrivate: "signed at worlds" }),
      stubCopy({ id: "plain", collectionId: INBOX }),
      stubCopy({ id: "conditioned", collectionId: INBOX, condition: "near-mint" }),
    ];
    const sources = buildMoveSources(copies, INBOX);
    expect(sources[0]!.copyIds).toEqual(["plain", "conditioned", "graded", "noted"]);
  });

  it("moves on-loan copies only as a last resort", () => {
    const copies = [
      stubCopy({ id: "lent", collectionId: INBOX, onLoan: true }),
      stubCopy({ id: "graded", collectionId: INBOX, grader: "psa", grade: 10 }),
    ];
    const sources = buildMoveSources(copies, INBOX);
    expect(sources[0]!.copyIds).toEqual(["graded", "lent"]);
  });

  it("returns an empty list for no copies", () => {
    expect(buildMoveSources([], INBOX)).toEqual([]);
  });
});

describe("movableCountsByPrinting", () => {
  it("collapses the grouped map into counts", () => {
    const grouped = groupMovableCopies(
      [
        stubCopy({ id: "c1", printingId: "p1", collectionId: INBOX }),
        stubCopy({ id: "c2", printingId: "p1", collectionId: BINDER }),
        stubCopy({ id: "c3", printingId: "p2", collectionId: INBOX }),
      ],
      { excludeCollectionId: TARGET },
    );
    expect(movableCountsByPrinting(grouped)).toEqual({ p1: 2, p2: 1 });
  });
});
