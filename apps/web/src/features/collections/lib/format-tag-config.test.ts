import type { CustomTag } from "@openrift/shared/types/catalog";
import { describe, expect, it } from "vitest";

import { getFormatTagConfig, resolveFormatTagSummary } from "./format-tag-config";

function makeTag(slug: string, label: string, category = "region"): CustomTag {
  return {
    id: `tag-${slug}`,
    slug,
    label,
    category,
    categoryLabel: category,
    description: null,
    sortOrder: 0,
  };
}

describe("getFormatTagConfig", () => {
  it("returns config for custom-region", () => {
    const config = getFormatTagConfig("custom-region");
    expect(config?.category).toBe("region");
    expect(config?.nounPlural).toBe("regions");
  });

  it("returns null for non-tag-locked formats", () => {
    expect(getFormatTagConfig("constructed")).toBeNull();
    expect(getFormatTagConfig("freeform")).toBeNull();
  });
});

describe("resolveFormatTagSummary", () => {
  const tags: CustomTag[] = [makeTag("bandle-city", "Bandle City"), makeTag("neutral", "Neutral")];

  it("returns null for non-tag-locked formats", () => {
    expect(resolveFormatTagSummary("constructed", null, tags)).toBeNull();
    expect(resolveFormatTagSummary("freeform", { tagSlugs: ["x"] }, tags)).toBeNull();
  });

  it("joins resolved labels with ' + '", () => {
    const summary = resolveFormatTagSummary(
      "custom-region",
      { tagSlugs: ["bandle-city", "neutral"] },
      tags,
    );
    expect(summary).toBe("Bandle City + Neutral");
  });

  it("falls back to 'No <nounPlural> picked' when formatConfig is null", () => {
    expect(resolveFormatTagSummary("custom-region", null, tags)).toBe("No regions picked");
  });

  it("falls back to 'No <nounPlural> picked' when tagSlugs is empty", () => {
    expect(resolveFormatTagSummary("custom-region", { tagSlugs: [] }, tags)).toBe(
      "No regions picked",
    );
  });

  it("drops unresolved slugs and falls back when none remain", () => {
    expect(resolveFormatTagSummary("custom-region", { tagSlugs: ["gone"] }, tags)).toBe(
      "No regions picked",
    );
  });

  it("drops unresolved slugs but keeps the rest", () => {
    const summary = resolveFormatTagSummary(
      "custom-region",
      { tagSlugs: ["bandle-city", "gone", "neutral"] },
      tags,
    );
    expect(summary).toBe("Bandle City + Neutral");
  });
});
