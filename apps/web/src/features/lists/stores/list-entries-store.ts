import type { ListEntryDetailResponse } from "@openrift/shared/types/api/list";
import { create } from "zustand";

interface ListEntriesState {
  entryByItemId: Map<string, ListEntryDetailResponse>;
  entryByKey: Map<string, ListEntryDetailResponse>;
  setEntries: (
    entryByItemId: Map<string, ListEntryDetailResponse>,
    entryByKey: Map<string, ListEntryDetailResponse>,
  ) => void;
}

// Cells select their own entry via a per-key selector so an entry mutation
// only re-renders the cell whose entry actually changed.
export const useListEntriesStore = create<ListEntriesState>()((set) => ({
  entryByItemId: new Map(),
  entryByKey: new Map(),
  setEntries: (entryByItemId, entryByKey) => set({ entryByItemId, entryByKey }),
}));
