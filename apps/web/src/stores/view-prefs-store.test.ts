import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useCookieViewPrefsStore, useLocalViewPrefsStore } from "./view-prefs-store";

let resetCookieStore: () => void;
let resetLocalStore: () => void;

beforeEach(() => {
  resetCookieStore = createStoreResetter(useCookieViewPrefsStore);
  resetLocalStore = createStoreResetter(useLocalViewPrefsStore);
  localStorage.clear();
});

afterEach(() => {
  resetCookieStore();
  resetLocalStore();
  localStorage.clear();
});

describe("view-prefs stores", () => {
  it("start on each surface's own defaults", () => {
    const cookie = useCookieViewPrefsStore.getState();
    expect(cookie.cards).toEqual({
      sort: "id",
      sortDir: "asc",
      groupBy: "set",
      groupDir: "asc",
    });
    expect(cookie.promos.groupBy).toBe("channel");
    expect(useLocalViewPrefsStore.getState().decks).toEqual({
      sort: "updated",
      sortDir: "desc",
      groupBy: "none",
      groupDir: "asc",
    });
  });

  it("split the surfaces across the two stores", () => {
    expect(useCookieViewPrefsStore.getState()).not.toHaveProperty("decks");
    expect(useLocalViewPrefsStore.getState()).not.toHaveProperty("cards");
  });

  describe("setters", () => {
    it("update only the addressed surface", () => {
      useCookieViewPrefsStore.getState().setSort("cards", "name");
      expect(useCookieViewPrefsStore.getState().cards.sort).toBe("name");
      expect(useCookieViewPrefsStore.getState().promos.sort).toBe("id");
    });

    it("apply each field independently", () => {
      const store = useLocalViewPrefsStore.getState();
      store.setSort("collections", "energy");
      store.setSortDir("collections", "desc");
      store.setGroupBy("collections", "rarity");
      store.setGroupDir("collections", "desc");
      expect(useLocalViewPrefsStore.getState().collections).toEqual({
        sort: "energy",
        sortDir: "desc",
        groupBy: "rarity",
        groupDir: "desc",
      });
    });

    it("clamp a value the surface does not offer", () => {
      // "card" is a /promos axis, so it must not stick on the catalog surface.
      useCookieViewPrefsStore.getState().setGroupBy("cards", "card");
      expect(useCookieViewPrefsStore.getState().cards.groupBy).toBe("set");
      useCookieViewPrefsStore.getState().setGroupBy("promos", "card");
      expect(useCookieViewPrefsStore.getState().promos.groupBy).toBe("card");
    });

    it("restore one surface without touching the others", () => {
      const store = useLocalViewPrefsStore.getState();
      store.setSort("decks", "name");
      store.setSort("collections", "name");
      useLocalViewPrefsStore.getState().resetSurface("decks");
      expect(useLocalViewPrefsStore.getState().decks.sort).toBe("updated");
      expect(useLocalViewPrefsStore.getState().collections.sort).toBe("name");
    });
  });

  describe("persistence merge", () => {
    it("keeps a valid persisted blob", () => {
      const store = useCookieViewPrefsStore;
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.({ cards: { sort: "name", groupBy: "rarity" } }, store.getState());
      expect(result?.cards.sort).toBe("name");
      expect(result?.cards.groupBy).toBe("rarity");
    });

    it("clamps a corrupt blob per field instead of discarding it", () => {
      const store = useCookieViewPrefsStore;
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.({ cards: { sort: "name", groupBy: "moonphase" } }, store.getState());
      expect(result?.cards.sort).toBe("name");
      expect(result?.cards.groupBy).toBe("set");
    });

    it("keeps the setters callable after a merge", () => {
      const store = useCookieViewPrefsStore;
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.({}, store.getState());
      expect(typeof result?.setSort).toBe("function");
    });

    it.each([null, "garbage", 7])("survives a persisted value of %p", (persisted) => {
      const store = useCookieViewPrefsStore;
      const merge = store.persist?.getOptions()?.merge;
      const result = merge?.(persisted, store.getState());
      expect(result?.cards.sort).toBe("id");
    });
  });

  describe("deck-list migration", () => {
    /**
     * Runs the local store's merge the way rehydration would.
     * @returns The merged state, or undefined when persist is unavailable.
     */
    function mergePersisted(persisted: unknown) {
      const store = useLocalViewPrefsStore;
      return store.persist?.getOptions()?.merge?.(persisted, store.getState());
    }

    it("adopts the sort/group the deck list used to own", () => {
      localStorage.setItem(
        "openrift-deck-list-prefs",
        JSON.stringify({
          state: { sortField: "name", sortDir: "asc", groupBy: "legend", groupDir: "desc" },
        }),
      );
      expect(mergePersisted({})?.decks).toEqual({
        sort: "name",
        sortDir: "asc",
        groupBy: "legend",
        groupDir: "desc",
      });
    });

    it("does not overwrite a value this store already stored", () => {
      localStorage.setItem(
        "openrift-deck-list-prefs",
        JSON.stringify({ state: { sortField: "name" } }),
      );
      const result = mergePersisted({ decks: { sort: "created" } });
      expect(result?.decks.sort).toBe("created");
    });

    it("ignores a corrupt legacy blob", () => {
      localStorage.setItem("openrift-deck-list-prefs", "{not json");
      expect(mergePersisted({})?.decks.sort).toBe("updated");
    });

    it("clamps legacy values that are no longer offered", () => {
      localStorage.setItem(
        "openrift-deck-list-prefs",
        JSON.stringify({ state: { sortField: "retired-field", groupBy: "legend" } }),
      );
      const result = mergePersisted({});
      expect(result?.decks.sort).toBe("updated");
      expect(result?.decks.groupBy).toBe("legend");
    });

    it("leaves the other local surfaces alone", () => {
      localStorage.setItem(
        "openrift-deck-list-prefs",
        JSON.stringify({ state: { sortField: "name" } }),
      );
      expect(mergePersisted({})?.collections.sort).toBe("id");
    });
  });
});
