import { describe, expect, it } from "vitest";

import {
  COOKIE_VIEW_SURFACES,
  LOCAL_VIEW_SURFACES,
  resolveViewPrefsFromCookie,
  sanitizeSurfacePrefs,
  sanitizeViewPrefsBlob,
  VIEW_SURFACE_CONFIGS,
} from "./view-prefs";

describe("sanitizeSurfacePrefs", () => {
  it("keeps values the surface offers", () => {
    expect(
      sanitizeSurfacePrefs(
        { sort: "name", sortDir: "desc", groupBy: "rarity", groupDir: "desc" },
        "cards",
      ),
    ).toEqual({ sort: "name", sortDir: "desc", groupBy: "rarity", groupDir: "desc" });
  });

  it("falls back per field, keeping the valid ones", () => {
    expect(
      sanitizeSurfacePrefs(
        { sort: "name", sortDir: "sideways", groupBy: "moonphase", groupDir: "desc" },
        "cards",
      ),
    ).toEqual({ sort: "name", sortDir: "asc", groupBy: "set", groupDir: "desc" });
  });

  it("rejects another surface's vocabulary", () => {
    const result = sanitizeSurfacePrefs({ sort: "updated", groupBy: "legend" }, "cards");
    expect(result.sort).toBe("id");
    expect(result.groupBy).toBe("set");
  });

  it("rejects the shared axes /promos does not offer", () => {
    expect(sanitizeSurfacePrefs({ groupBy: "none" }, "promos").groupBy).toBe("channel");
    expect(sanitizeSurfacePrefs({ groupBy: "collection" }, "promos").groupBy).toBe("channel");
    expect(sanitizeSurfacePrefs({ groupBy: "none" }, "cards").groupBy).toBe("none");
  });

  it("accepts each surface's own vocabulary", () => {
    expect(sanitizeSurfacePrefs({ groupBy: "card" }, "promos").groupBy).toBe("card");
    expect(sanitizeSurfacePrefs({ sort: "updated" }, "decks").sort).toBe("updated");
    expect(sanitizeSurfacePrefs({ groupBy: "legend" }, "decks").groupBy).toBe("legend");
  });

  it.each([undefined, null, "not an object", 42, []])("falls back entirely for %p", (raw) => {
    expect(sanitizeSurfacePrefs(raw, "cards")).toEqual(VIEW_SURFACE_CONFIGS.cards.defaults);
  });

  it("returns a fresh object so callers cannot mutate the shared defaults", () => {
    const first = sanitizeSurfacePrefs(undefined, "cards");
    first.sort = "name";
    expect(sanitizeSurfacePrefs(undefined, "cards").sort).toBe("id");
  });
});

describe("sanitizeViewPrefsBlob", () => {
  it("fills every requested surface", () => {
    const blob = sanitizeViewPrefsBlob({}, LOCAL_VIEW_SURFACES);
    expect(Object.keys(blob).toSorted()).toEqual([...LOCAL_VIEW_SURFACES].toSorted());
  });

  it("drops surfaces the store does not own", () => {
    const blob = sanitizeViewPrefsBlob(
      { cards: { sort: "name" }, decks: { sort: "name" } },
      COOKIE_VIEW_SURFACES,
    );
    expect(blob.cards.sort).toBe("name");
    expect(blob).not.toHaveProperty("decks");
  });

  it("gives each surface its own defaults rather than one shared set", () => {
    const blob = sanitizeViewPrefsBlob(undefined, COOKIE_VIEW_SURFACES);
    expect(blob.cards.groupBy).toBe("set");
    expect(blob.promos.groupBy).toBe("channel");
  });
});

describe("resolveViewPrefsFromCookie", () => {
  it("reads the Zustand persist envelope", () => {
    const raw = JSON.stringify({
      state: { cards: { sort: "name", sortDir: "desc", groupBy: "rarity", groupDir: "asc" } },
    });
    expect(resolveViewPrefsFromCookie(raw).cards).toEqual({
      sort: "name",
      sortDir: "desc",
      groupBy: "rarity",
      groupDir: "asc",
    });
  });

  it.each([null, undefined, ""])("defaults when the cookie is %p", (raw) => {
    expect(resolveViewPrefsFromCookie(raw).cards).toEqual(VIEW_SURFACE_CONFIGS.cards.defaults);
  });

  it("defaults on malformed JSON instead of throwing", () => {
    expect(resolveViewPrefsFromCookie("{not json")).toEqual(
      sanitizeViewPrefsBlob(undefined, COOKIE_VIEW_SURFACES),
    );
  });

  it("clamps a hand-edited cookie", () => {
    const raw = JSON.stringify({ state: { cards: { groupBy: "<script>" } } });
    expect(resolveViewPrefsFromCookie(raw).cards.groupBy).toBe("set");
  });

  it("defaults when the envelope has no state key", () => {
    expect(resolveViewPrefsFromCookie(JSON.stringify({ cards: { sort: "name" } })).cards.sort).toBe(
      "id",
    );
  });
});
