import { beforeEach, describe, expect, it } from "vitest";

import { useSiblingOverrideStore } from "./sibling-override-store";

beforeEach(() => {
  useSiblingOverrideStore.setState({
    overrides: { cards: new Map(), collection: new Map(), list: new Map() },
  });
});

describe("useSiblingOverrideStore", () => {
  it("sets and reads an override within a scope", () => {
    useSiblingOverrideStore.getState().setOverride("collection", "card-1", "printing-1");
    const state = useSiblingOverrideStore.getState();
    expect(state.overrides.collection.get("card-1")).toBe("printing-1");
    expect(state.overrides.cards.size).toBe(0);
    expect(state.overrides.list.size).toBe(0);
  });

  it("overrides are isolated per scope", () => {
    useSiblingOverrideStore.getState().setOverride("cards", "card-1", "printing-cards");
    useSiblingOverrideStore.getState().setOverride("collection", "card-1", "printing-coll");
    useSiblingOverrideStore.getState().setOverride("list", "card-1", "printing-list");
    const state = useSiblingOverrideStore.getState();
    expect(state.overrides.cards.get("card-1")).toBe("printing-cards");
    expect(state.overrides.collection.get("card-1")).toBe("printing-coll");
    expect(state.overrides.list.get("card-1")).toBe("printing-list");
  });

  it("setting the same cardId again replaces the previous override", () => {
    useSiblingOverrideStore.getState().setOverride("collection", "card-1", "first");
    useSiblingOverrideStore.getState().setOverride("collection", "card-1", "second");
    expect(useSiblingOverrideStore.getState().overrides.collection.get("card-1")).toBe("second");
  });

  it("clearScope wipes only the named scope", () => {
    useSiblingOverrideStore.getState().setOverride("cards", "card-1", "p1");
    useSiblingOverrideStore.getState().setOverride("collection", "card-2", "p2");
    useSiblingOverrideStore.getState().clearScope("cards");
    const state = useSiblingOverrideStore.getState();
    expect(state.overrides.cards.size).toBe(0);
    expect(state.overrides.collection.get("card-2")).toBe("p2");
  });

  it("clearScope on an already-empty scope is a no-op", () => {
    useSiblingOverrideStore.getState().clearScope("list");
    expect(useSiblingOverrideStore.getState().overrides.list.size).toBe(0);
  });
});
