import { describe, expect, it } from "vitest";

import type { MetaDateRange } from "@/lib/meta-scope";

import { optionalQuery } from "./use-meta";

describe("optionalQuery", () => {
  it("resolves a payload-less call to an empty query", () => {
    expect(optionalQuery<MetaDateRange>()).toEqual({});
  });

  it("resolves an explicit undefined to an empty query", () => {
    expect(optionalQuery<MetaDateRange>(undefined)).toEqual({});
  });

  it("passes a query through untouched", () => {
    const range = { from: "2026-08-01", to: "2026-08-31" };
    expect(optionalQuery<MetaDateRange>(range)).toBe(range);
  });
});
