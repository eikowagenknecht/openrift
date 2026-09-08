import type { ListKind } from "@openrift/shared/types/api/list";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useImportHandoffStore } from "@/features/collections/stores/import-handoff-store";
import { createStoreResetter } from "@/test/store-helpers";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/features/cards/hooks/use-cards", () => ({ useCards: () => ({ allPrintings: [] }) }));
vi.mock("@/features/collections/hooks/use-collections", () => ({
  useCreateCollection: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/features/collections/hooks/use-copies", () => ({
  useAddCopies: () => ({ mutateAsync: vi.fn() }),
  useDisposeCopies: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/features/collections/lib/copies-collection", () => ({
  useCopiesCollection: () => null,
}));
vi.mock("@/features/lists/hooks/use-lists", () => ({
  useLists: () => ({ data: [] }),
  useBulkAddListEntries: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/stores/display-store", () => ({
  useDisplayStore: (selector: (state: { languages: string[] }) => unknown) =>
    selector({ languages: [] }),
}));

const { toImportableListOptions, useImportFlow } = await import("./use-import-flow");

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

describe("useImportFlow handoff", () => {
  const resetHandoffStore = createStoreResetter(useImportHandoffStore);

  beforeEach(() => {
    resetHandoffStore();
  });

  afterEach(() => {
    resetHandoffStore();
  });

  it("consumes a pending handoff on mount and lands on the preview step", () => {
    useImportHandoffStore.getState().setHandoff({ rawText: "1 Yasuo", collectionId: "col-1" });

    const { result } = renderHook(() => useImportFlow());

    expect(result.current.rawText).toBe("1 Yasuo");
    expect(result.current.collectionId).toBe("col-1");
    expect(result.current.step).toBe("preview");
    expect(useImportHandoffStore.getState().handoff).toBeNull();
  });

  it("leaves the target collection unset when the handoff carries none", () => {
    useImportHandoffStore.getState().setHandoff({ rawText: "1 Yasuo" });

    const { result } = renderHook(() => useImportFlow());

    expect(result.current.collectionId).toBe("");
    expect(result.current.step).toBe("preview");
  });

  it("stays on the input step when there is no pending handoff", () => {
    const { result } = renderHook(() => useImportFlow());

    expect(result.current.step).toBe("input");
    expect(result.current.rawText).toBe("");
  });
});
