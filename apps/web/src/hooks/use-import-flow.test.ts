import type { ListKind } from "@openrift/shared/types/api/list";
import { describe, expect, it } from "vitest";

import { toImportableListOptions } from "./use-import-flow";

function list(id: string, name: string, kind: ListKind) {
  return { id, name, kind };
}

describe("toImportableListOptions", () => {
  it("keeps card- and printing-kind lists", () => {
    const result = toImportableListOptions([
      list("l1", "Binder", "card"),
      list("l2", "Foils", "printing"),
    ]);
    expect(result).toEqual([
      { id: "l1", name: "Binder", kind: "card" },
      { id: "l2", name: "Foils", kind: "printing" },
    ]);
  });

  it("excludes copy-kind lists (no copy identity in a CSV)", () => {
    const result = toImportableListOptions([
      list("l1", "Binder", "card"),
      list("l2", "Trade copies", "copy"),
    ]);
    expect(result.map((option) => option.id)).toEqual(["l1"]);
  });

  it("returns an empty array when there are no importable lists", () => {
    expect(toImportableListOptions([list("l1", "Trade copies", "copy")])).toEqual([]);
  });
});
