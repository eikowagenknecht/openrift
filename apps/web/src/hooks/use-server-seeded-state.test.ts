import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useServerSeededState } from "./use-server-seeded-state";

describe("useServerSeededState", () => {
  it("seeds from the server value on the first render", () => {
    const { result } = renderHook(() => useServerSeededState("Summoner Skirmish"));
    expect(result.current[0]).toBe("Summoner Skirmish");
  });

  it("adopts a new server value while the field is untouched", () => {
    const { result, rerender } = renderHook(({ value }) => useServerSeededState(value), {
      initialProps: { value: "Summoner Skirmish" },
    });

    rerender({ value: "Rift Rumble" });

    expect(result.current[0]).toBe("Rift Rumble");
  });

  it("keeps a local edit when the server value changes underneath it", () => {
    const { result, rerender } = renderHook(({ value }) => useServerSeededState(value), {
      initialProps: { value: "Summoner Skirmish" },
    });

    act(() => result.current[1]("Half-typed nam"));
    rerender({ value: "Rift Rumble" });

    expect(result.current[0]).toBe("Half-typed nam");
  });

  it("keeps the edit across repeated refetches that report the same server value", () => {
    const { result, rerender } = renderHook(({ value }) => useServerSeededState(value), {
      initialProps: { value: "Summoner Skirmish" },
    });

    act(() => result.current[1]("Half-typed nam"));
    rerender({ value: "Summoner Skirmish" });
    rerender({ value: "Summoner Skirmish" });

    expect(result.current[0]).toBe("Half-typed nam");
  });

  it("resumes tracking the server once the edit is reverted by hand", () => {
    const { result, rerender } = renderHook(({ value }) => useServerSeededState(value), {
      initialProps: { value: "Summoner Skirmish" },
    });

    act(() => result.current[1]("Half-typed nam"));
    rerender({ value: "Rift Rumble" });
    act(() => result.current[1]("Rift Rumble"));
    rerender({ value: "Piltover Open" });

    expect(result.current[0]).toBe("Piltover Open");
  });

  it("resumes tracking the server after an edit is undone back to the previously seeded value", () => {
    const { result, rerender } = renderHook(({ value }) => useServerSeededState(value), {
      initialProps: { value: "Summoner Skirmish" },
    });

    act(() => result.current[1]("Summoner Skirmis"));
    act(() => result.current[1]("Summoner Skirmish"));
    rerender({ value: "Rift Rumble" });

    expect(result.current[0]).toBe("Rift Rumble");
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => useServerSeededState(3));

    act(() => result.current[1]((previous) => previous + 1));

    expect(result.current[0]).toBe(4);
  });

  it("adopts a server value that changes to null", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useServerSeededState<string | null>(value),
      { initialProps: { value: "2026-08-01T18:00Z" as string | null } },
    );

    rerender({ value: null });

    expect(result.current[0]).toBeNull();
  });
});
