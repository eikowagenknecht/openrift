import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useScanTrayDisclosure } from "./use-scan-tray-disclosure";

describe("useScanTrayDisclosure", () => {
  it("opens the newest row by default", () => {
    const { result } = renderHook(() => useScanTrayDisclosure(["lux", "jinx"]));
    expect(result.current.openId).toBe("lux");
  });

  it("opens nothing when the tray is empty", () => {
    const { result } = renderHook(() => useScanTrayDisclosure([]));
    expect(result.current.openId).toBeNull();
  });

  it("follows the newest row when a scan lands", () => {
    const { result, rerender } = renderHook(({ ids }) => useScanTrayDisclosure(ids), {
      initialProps: { ids: ["lux", "jinx"] },
    });
    rerender({ ids: ["teemo", "lux", "jinx"] });
    expect(result.current.openId).toBe("teemo");
  });

  it("keeps a pinned row open when a scan lands", () => {
    const { result, rerender } = renderHook(({ ids }) => useScanTrayDisclosure(ids), {
      initialProps: { ids: ["lux", "jinx"] },
    });
    act(() => result.current.toggle("jinx"));
    expect(result.current.openId).toBe("jinx");

    rerender({ ids: ["teemo", "lux", "jinx"] });
    expect(result.current.openId).toBe("jinx");
  });

  it("collapses the open row when it is tapped again, and stays collapsed across scans", () => {
    const { result, rerender } = renderHook(({ ids }) => useScanTrayDisclosure(ids), {
      initialProps: { ids: ["lux", "jinx"] },
    });
    act(() => result.current.toggle("lux"));
    expect(result.current.openId).toBeNull();

    rerender({ ids: ["teemo", "lux", "jinx"] });
    expect(result.current.openId).toBeNull();
  });

  it("resumes following the live row when the newest row is reopened", () => {
    const { result, rerender } = renderHook(({ ids }) => useScanTrayDisclosure(ids), {
      initialProps: { ids: ["lux", "jinx"] },
    });
    act(() => result.current.toggle("jinx"));
    act(() => result.current.toggle("lux"));
    expect(result.current.openId).toBe("lux");

    rerender({ ids: ["teemo", "lux", "jinx"] });
    expect(result.current.openId).toBe("teemo");
  });

  it("moves a pinned row's actions to another row when that row is tapped", () => {
    const { result } = renderHook(() => useScanTrayDisclosure(["lux", "jinx", "teemo"]));
    act(() => result.current.toggle("jinx"));
    act(() => result.current.toggle("teemo"));
    expect(result.current.openId).toBe("teemo");
  });

  it("falls back to the live row when the pinned row's last copy is removed", () => {
    const { result, rerender } = renderHook(({ ids }) => useScanTrayDisclosure(ids), {
      initialProps: { ids: ["lux", "jinx"] },
    });
    act(() => result.current.toggle("jinx"));
    rerender({ ids: ["lux"] });
    expect(result.current.openId).toBe("lux");
  });

  it("opens nothing when the pinned row is removed and the tray empties", () => {
    const { result, rerender } = renderHook(({ ids }) => useScanTrayDisclosure(ids), {
      initialProps: { ids: ["lux", "jinx"] },
    });
    act(() => result.current.toggle("jinx"));
    rerender({ ids: [] });
    expect(result.current.openId).toBeNull();
  });
});
