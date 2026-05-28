import type { ListEntryDetailResponse } from "@openrift/shared";
import { create } from "zustand";

interface ListEntriesState {
  /** Entry keyed by grid item id — used in browse mode where items are derived from entries. */
  entryByItemId: Map<string, ListEntryDetailResponse>;
  /**
   * Entry keyed by cardId (card-kind lists) or printingId (others). Used in
   * library mode where item.id is a catalog printingId rather than an entry id,
   * so we have to ask "is this card on the list at all?" with the kind-aware key.
   */
  entryByKey: Map<string, ListEntryDetailResponse>;
  setEntries: (
    entryByItemId: Map<string, ListEntryDetailResponse>,
    entryByKey: Map<string, ListEntryDetailResponse>,
  ) => void;
}

/**
 * Per-cell entry lookup for the /lists grid.
 *
 * The parent's `renderCard` closure used to read `entryByItemId` / `entryByKey`
 * directly, which meant every entry mutation re-derived the maps and forced
 * every visible cell to re-render. With this store, cells select their own
 * entry via a per-key selector — when only THIS card's entry changed, Object.is
 * equality on the selector return value lets other cells skip rendering.
 */
export const useListEntriesStore = create<ListEntriesState>()((set) => ({
  entryByItemId: new Map(),
  entryByKey: new Map(),
  setEntries: (entryByItemId, entryByKey) => set({ entryByItemId, entryByKey }),
}));
