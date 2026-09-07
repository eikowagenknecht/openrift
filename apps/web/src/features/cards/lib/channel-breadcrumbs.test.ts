import type { DistributionChannel } from "@openrift/shared/types/catalog";
import { describe, expect, it } from "vitest";

import { buildChannelBreadcrumbs, buildChannelBreadcrumbsBySlug } from "./channel-breadcrumbs";

function ch(
  id: string,
  slug: string,
  label: string,
  parentId: string | null = null,
): DistributionChannel {
  return {
    id,
    slug,
    label,
    description: null,
    kind: "event",
    parentId,
    childrenLabel: null,
  };
}

describe("buildChannelBreadcrumbs", () => {
  it("returns the leaf label for a root channel", () => {
    const map = buildChannelBreadcrumbs([ch("a", "tournament", "Tournament")]);
    expect(map.get("a")).toBe("Tournament");
  });

  it("walks parentId chains to build the full path", () => {
    const channels = [
      ch("a", "tournament", "Tournament"),
      ch("b", "regionals", "Regionals", "a"),
      ch("c", "top-8", "Top 8", "b"),
    ];
    const map = buildChannelBreadcrumbs(channels);
    expect(map.get("a")).toBe("Tournament");
    expect(map.get("b")).toBe("Tournament › Regionals");
    expect(map.get("c")).toBe("Tournament › Regionals › Top 8");
  });

  it("disambiguates duplicate leaf labels via different parents", () => {
    const channels = [
      ch("a", "tournament", "Tournament"),
      ch("b", "regionals", "Regionals", "a"),
      ch("c", "regionals-top-8", "Top 8", "b"),
      ch("d", "worlds", "Worlds", "a"),
      ch("e", "worlds-top-8", "Top 8", "d"),
    ];
    const map = buildChannelBreadcrumbs(channels);
    expect(map.get("c")).toBe("Tournament › Regionals › Top 8");
    expect(map.get("e")).toBe("Tournament › Worlds › Top 8");
  });

  it("falls back gracefully on a broken parentId chain", () => {
    const channels = [ch("a", "orphan", "Orphan", "missing")];
    const map = buildChannelBreadcrumbs(channels);
    expect(map.get("a")).toBe("Orphan");
  });

  it("halts on a parentId cycle and still resolves a finite path", () => {
    const channels = [ch("a", "a", "A", "b"), ch("b", "b", "B", "a")];
    const map = buildChannelBreadcrumbs(channels);
    expect(map.get("a")).toBeDefined();
    expect(map.get("b")).toBeDefined();
  });
});

describe("buildChannelBreadcrumbsBySlug", () => {
  it("keys the result by slug", () => {
    const channels = [ch("a", "tournament", "Tournament"), ch("b", "regionals", "Regionals", "a")];
    const map = buildChannelBreadcrumbsBySlug(channels);
    expect(map.get("tournament")).toBe("Tournament");
    expect(map.get("regionals")).toBe("Tournament › Regionals");
  });
});
