import type { ListEntryDetailResponse } from "@openrift/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { useListEntriesStore } from "./list-entries-store";

function stubEntry(overrides: Partial<ListEntryDetailResponse> = {}): ListEntryDetailResponse {
  return {
    id: "entry-1",
    listId: "list-1",
    kind: "card",
    cardId: "card-1",
    cardName: "Card 1",
    quantity: 1,
    tradeOverride: {
      pricePref: null,
      priceAbsoluteCents: null,
      tradeType: null,
    },
    ...overrides,
  } as ListEntryDetailResponse;
}

beforeEach(() => {
  useListEntriesStore.setState({ entryByItemId: new Map(), entryByKey: new Map() });
});

describe("useListEntriesStore", () => {
  it("starts with empty maps", () => {
    const state = useListEntriesStore.getState();
    expect(state.entryByItemId.size).toBe(0);
    expect(state.entryByKey.size).toBe(0);
  });

  it("setEntries replaces both indexes atomically", () => {
    const entry = stubEntry();
    const byItem = new Map([["item-1", entry]]);
    const byKey = new Map([["card-1", entry]]);
    useListEntriesStore.getState().setEntries(byItem, byKey);
    const state = useListEntriesStore.getState();
    expect(state.entryByItemId.get("item-1")).toBe(entry);
    expect(state.entryByKey.get("card-1")).toBe(entry);
  });

  it("selectors return Object.is-equal refs across re-runs for unchanged entries", () => {
    const entry = stubEntry({ id: "stable-1" });
    const byItem = new Map([["item-1", entry]]);
    const byKey = new Map([["card-1", entry]]);
    useListEntriesStore.getState().setEntries(byItem, byKey);
    const first = useListEntriesStore.getState().entryByItemId.get("item-1");

    // Re-feed with new Map instances but the same entry refs inside.
    useListEntriesStore
      .getState()
      .setEntries(new Map([["item-1", entry]]), new Map([["card-1", entry]]));
    const second = useListEntriesStore.getState().entryByItemId.get("item-1");

    expect(second).toBe(first);
  });
});
