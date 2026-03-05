import { ALL_SEARCH_FIELDS, DEFAULT_SEARCH_SCOPE } from "@openrift/shared";
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { useSearchScope } from "./use-search-scope";

const STORAGE_KEY = "openrift-search-scope";

describe("useSearchScope", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default scope when nothing is stored", () => {
    const { result } = renderHook(() => useSearchScope());
    expect(result.current.scope).toEqual(DEFAULT_SEARCH_SCOPE);
  });

  it("reads a valid scope from localStorage", () => {
    const stored = ["name", "cardText"];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useSearchScope());
    expect(result.current.scope).toEqual(stored);
  });

  it("falls back to default when stored value is not an array", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("name"));

    const { result } = renderHook(() => useSearchScope());
    expect(result.current.scope).toEqual(DEFAULT_SEARCH_SCOPE);
  });

  it("filters out invalid fields from stored scope", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["name", "bogus", "id"]));

    const { result } = renderHook(() => useSearchScope());
    expect(result.current.scope).toEqual(["name", "id"]);
  });

  it("falls back to default when all stored fields are invalid", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["bogus1", "bogus2"]));

    const { result } = renderHook(() => useSearchScope());
    expect(result.current.scope).toEqual(DEFAULT_SEARCH_SCOPE);
  });

  it("falls back to default on corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");

    const { result } = renderHook(() => useSearchScope());
    expect(result.current.scope).toEqual(DEFAULT_SEARCH_SCOPE);
  });

  it("toggles a field into the scope", () => {
    const { result } = renderHook(() => useSearchScope());

    act(() => result.current.toggleField("cardText"));

    expect(result.current.scope).toContain("cardText");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toContain("cardText");
  });

  it("toggles a field out of the scope", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["name", "cardText"]));
    const { result } = renderHook(() => useSearchScope());

    act(() => result.current.toggleField("cardText"));

    expect(result.current.scope).toEqual(["name"]);
  });

  it("prevents removing the last field (empty scope)", () => {
    // DEFAULT_SEARCH_SCOPE is ["name"] — try to remove it
    const { result } = renderHook(() => useSearchScope());
    expect(result.current.scope).toEqual(["name"]);

    act(() => result.current.toggleField("name"));

    // Scope should remain unchanged
    expect(result.current.scope).toEqual(["name"]);
  });

  it("can toggle all fields on", () => {
    const { result } = renderHook(() => useSearchScope());

    for (const field of ALL_SEARCH_FIELDS) {
      if (!result.current.scope.includes(field)) {
        act(() => result.current.toggleField(field));
      }
    }

    expect(result.current.scope).toHaveLength(ALL_SEARCH_FIELDS.length);
  });
});
