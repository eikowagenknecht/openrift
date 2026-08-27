import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { createStoreResetter } from "@/test/store-helpers";

const resetStore = createStoreResetter(useCommandPaletteStore);

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

const store = () => useCommandPaletteStore.getState();

describe("useCommandPaletteStore", () => {
  it("starts closed with no quick-add registered", () => {
    expect(store().open).toBe(false);
    expect(store().quickAddOpen).toBe(false);
    expect(store().quickAdd).toBeNull();
  });

  describe("the Ctrl+K shortcut", () => {
    it("opens the global palette when the route offers no quick-add", () => {
      store().toggleShortcut();
      expect(store().open).toBe(true);
      expect(store().quickAddOpen).toBe(false);
    });

    it("closes the global palette on a second press", () => {
      store().toggleShortcut();
      store().toggleShortcut();
      expect(store().open).toBe(false);
    });

    it("opens the route's quick-add instead when one is registered", () => {
      store().registerQuickAdd({
        key: "collection:a",
        label: "Add to Binder",
        moveLabel: "Move to Binder",
        claimsShortcut: true,
      });
      store().toggleShortcut();
      expect(store().quickAddOpen).toBe(true);
      expect(store().open).toBe(false);
    });

    it("toggles the quick-add closed on a second press", () => {
      store().registerQuickAdd({
        key: "collection:a",
        label: "Add to Binder",
        moveLabel: "Move to Binder",
        claimsShortcut: true,
      });
      store().toggleShortcut();
      store().toggleShortcut();
      expect(store().quickAddOpen).toBe(false);
    });

    it("opens the global palette when the quick-add does not claim the chord", () => {
      // The catalog: the page is already a card search, so Ctrl+K is spent on
      // the palette and quick add is one row inside it.
      store().registerQuickAdd({
        key: "catalog:inbox",
        label: "Add to Inbox",
        moveLabel: null,
        claimsShortcut: false,
      });
      store().toggleShortcut();
      expect(store().open).toBe(true);
      expect(store().quickAddOpen).toBe(false);
    });

    it("still closes a non-claiming quick-add that is open", () => {
      store().registerQuickAdd({
        key: "catalog:inbox",
        label: "Add to Inbox",
        moveLabel: null,
        claimsShortcut: false,
      });
      store().openQuickAdd("add");
      store().toggleShortcut();
      expect(store().quickAddOpen).toBe(false);
      expect(store().open).toBe(false);
    });

    it("closes the global palette rather than swapping to the quick-add", () => {
      store().registerQuickAdd({
        key: "collection:a",
        label: "Add to Binder",
        moveLabel: "Move to Binder",
        claimsShortcut: true,
      });
      store().openPalette();
      store().toggleShortcut();
      expect(store().open).toBe(false);
      expect(store().quickAddOpen).toBe(false);
    });
  });

  describe("the query", () => {
    it("survives stepping aside for a card detail", () => {
      store().openPalette();
      store().setQuery("yasuo");
      store().setHighlighted("card:1");
      store().hidePalette();
      store().openPalette();
      expect(store().open).toBe(true);
      expect(store().query).toBe("yasuo");
      expect(store().highlighted).toBe("card:1");
    });

    it("is dropped on a real dismiss, so the next open starts blank", () => {
      store().openPalette();
      store().setQuery("yasuo");
      store().closePalette();
      store().openPalette();
      expect(store().query).toBe("");
      expect(store().highlighted).toBe("");
    });

    it("is dropped when Ctrl+K closes the palette", () => {
      store().openPalette();
      store().setQuery("yasuo");
      store().toggleShortcut();
      expect(store().query).toBe("");
    });

    it("is dropped on the way into the quick-add", () => {
      store().openPalette();
      store().setQuery("yasuo");
      store().openQuickAdd("add");
      store().exitQuickAddScope();
      expect(store().query).toBe("");
    });
  });

  describe("the verb", () => {
    it("opens the quick-add committed to what the palette row asked for", () => {
      store().openQuickAdd("move");
      expect(store().quickAddVerb).toBe("move");
      expect(store().quickAddOpen).toBe(true);
    });

    it("keeps Ctrl+K on add, since move has no chord and needs none", () => {
      store().registerQuickAdd({
        key: "collection:a",
        label: "Add to Binder",
        moveLabel: "Move to Binder",
        claimsShortcut: true,
      });
      store().openQuickAdd("move");
      store().closePalette();
      store().setQuickAddOpen(false);
      store().toggleShortcut();
      expect(store().quickAddVerb).toBe("add");
    });
  });

  describe("scope", () => {
    it("leaving the quick-add scope lands in the global palette", () => {
      store().registerQuickAdd({
        key: "deck:1",
        label: "Add to this deck",
        moveLabel: null,
        claimsShortcut: true,
      });
      store().openQuickAdd("add");
      store().exitQuickAddScope();
      expect(store().quickAddOpen).toBe(false);
      expect(store().open).toBe(true);
    });

    it("entering the quick-add from the global palette closes the global one", () => {
      store().openPalette();
      store().openQuickAdd("add");
      expect(store().open).toBe(false);
      expect(store().quickAddOpen).toBe(true);
    });
  });

  describe("registration", () => {
    it("replaces the previous route's entry", () => {
      store().registerQuickAdd({
        key: "collection:a",
        label: "Add to Binder",
        moveLabel: "Move to Binder",
        claimsShortcut: true,
      });
      store().registerQuickAdd({
        key: "deck:1",
        label: "Add to this deck",
        moveLabel: null,
        claimsShortcut: true,
      });
      expect(store().quickAdd?.label).toBe("Add to this deck");
    });

    it("closes the body when the registration goes away", () => {
      store().registerQuickAdd({
        key: "collection:a",
        label: "Add to Binder",
        moveLabel: "Move to Binder",
        claimsShortcut: true,
      });
      store().openQuickAdd("add");
      store().unregisterQuickAdd("collection:a");
      expect(store().quickAdd).toBeNull();
      expect(store().quickAddOpen).toBe(false);
    });

    it("ignores the outgoing route's cleanup once its successor has registered", () => {
      store().registerQuickAdd({
        key: "collection:a",
        label: "Add to Binder",
        moveLabel: "Move to Binder",
        claimsShortcut: true,
      });
      store().registerQuickAdd({
        key: "deck:1",
        label: "Add to this deck",
        moveLabel: null,
        claimsShortcut: true,
      });
      store().unregisterQuickAdd("collection:a");
      expect(store().quickAdd?.key).toBe("deck:1");
    });
  });
});
