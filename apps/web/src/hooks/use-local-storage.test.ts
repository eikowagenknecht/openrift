import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { useLocalStorage } from "./use-local-storage";

describe("useLocalStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the initial value when nothing is stored", () => {
    const { result } = renderHook(() => useLocalStorage("key", "default"));
    expect(result.current[0]).toBe("default");
  });

  it("reads an existing value from localStorage", () => {
    localStorage.setItem("key", JSON.stringify("stored"));
    const { result } = renderHook(() => useLocalStorage("key", "default"));
    expect(result.current[0]).toBe("stored");
  });

  it("falls back to initial value on corrupt JSON", () => {
    localStorage.setItem("key", "not-valid-json");
    const { result } = renderHook(() => useLocalStorage("key", "fallback"));
    expect(result.current[0]).toBe("fallback");
  });

  it("writes to localStorage when the value changes", () => {
    const { result } = renderHook(() => useLocalStorage("key", 0));

    act(() => result.current[1](42));

    expect(result.current[0]).toBe(42);
    expect(localStorage.getItem("key")).toBe("42");
  });

  it("supports the setState callback pattern", () => {
    const { result } = renderHook(() => useLocalStorage("counter", 1));

    act(() => result.current[1]((prev) => prev + 10));

    expect(result.current[0]).toBe(11);
    expect(localStorage.getItem("counter")).toBe("11");
  });

  it("supports custom serialize / deserialize", () => {
    const serialize = (v: string) => v.toUpperCase();
    const deserialize = (v: string) => v.toLowerCase();

    localStorage.setItem("key", "HELLO");
    const { result } = renderHook(() => useLocalStorage("key", "default", serialize, deserialize));

    expect(result.current[0]).toBe("hello");

    act(() => result.current[1]("world"));
    expect(localStorage.getItem("key")).toBe("WORLD");
  });

  it("handles complex objects", () => {
    const initial = { a: 1, b: [2, 3] };
    const { result } = renderHook(() => useLocalStorage("obj", initial));

    expect(result.current[0]).toEqual(initial);

    const updated = { a: 99, b: [4] };
    act(() => result.current[1](updated));

    expect(result.current[0]).toEqual(updated);
    expect(JSON.parse(localStorage.getItem("obj") ?? "null")).toEqual(updated);
  });
});
