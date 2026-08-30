import type * as ReactQuery from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const setList = vi.hoisted(() => ({
  sets: [
    {
      slug: "origins",
      name: "Origins",
      setType: "main",
      releases: { en: { releasedAt: "2025-10-31", precision: "day" } },
    },
    {
      slug: "proving",
      name: "Proving Grounds",
      setType: "main",
      releases: { en: { releasedAt: "2026-03-06", precision: "day" } },
    },
    {
      slug: "promo",
      name: "Promo Pack",
      setType: "supplemental",
      releases: { en: { releasedAt: "2026-01-15", precision: "day" } },
    },
  ],
}));

// Only the read is stubbed: use-public-sets pulls a real QueryClient in through
// the server cache, and replacing the whole module takes that with it.
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useSuspenseQuery: () => ({ data: setList }),
}));

const { useMetaEras } = await import("./use-meta-eras");

describe("useMetaEras", () => {
  it("turns the set list into eras, newest first", () => {
    const { result } = renderHook(() => useMetaEras());
    expect(result.current.map((era) => era.id)).toEqual(["proving", "origins"]);
  });

  it("runs each era up to the day before the next main set", () => {
    const { result } = renderHook(() => useMetaEras());
    expect(result.current[1]).toEqual({
      id: "origins",
      label: "Origins",
      from: "2025-10-31",
      to: "2026-03-05",
    });
  });

  it("leaves the supplemental product out of the boundaries", () => {
    const { result } = renderHook(() => useMetaEras());
    expect(result.current.map((era) => era.id)).not.toContain("promo");
  });
});
