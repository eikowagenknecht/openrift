import { describe, expect, it } from "vitest";

import type { SetOption } from "@/features/contribute/lib/contribute-set-code";
import {
  resolveSetFromPublicCode,
  setSlugFromPublicCode,
} from "@/features/contribute/lib/contribute-set-code";

const sets: SetOption[] = [
  { slug: "OGN", name: "Origins" },
  { slug: "SFD", name: "Spirit of Fire" },
];

describe("setSlugFromPublicCode", () => {
  it("extracts the segment before the first hyphen", () => {
    expect(setSlugFromPublicCode("OGN-066/298")).toBe("OGN");
  });

  it("treats a hyphen-less code as the bare set slug", () => {
    expect(setSlugFromPublicCode("OGN")).toBe("OGN");
  });

  it("uppercases a lowercase code", () => {
    expect(setSlugFromPublicCode("ogn-066/298")).toBe("OGN");
  });

  it("trims surrounding whitespace", () => {
    expect(setSlugFromPublicCode("  OGN-066/298  ")).toBe("OGN");
  });

  it("returns null for an empty string", () => {
    expect(setSlugFromPublicCode("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(setSlugFromPublicCode(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(setSlugFromPublicCode(undefined)).toBeNull();
  });

  it("returns null for a code that starts with a hyphen", () => {
    expect(setSlugFromPublicCode("-066/298")).toBeNull();
  });

  it("returns null for a code that is only a hyphen", () => {
    expect(setSlugFromPublicCode("-")).toBeNull();
  });
});

describe("resolveSetFromPublicCode", () => {
  it("resolves a code to its matching set", () => {
    expect(resolveSetFromPublicCode("OGN-066/298", sets)).toEqual({
      slug: "OGN",
      name: "Origins",
    });
  });

  it("matches set slugs case-insensitively", () => {
    expect(resolveSetFromPublicCode("sfd-012/240", sets)).toEqual({
      slug: "SFD",
      name: "Spirit of Fire",
    });
  });

  it("returns null when the prefix matches no known set", () => {
    expect(resolveSetFromPublicCode("XYZ-001/100", sets)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(resolveSetFromPublicCode(null, sets)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(resolveSetFromPublicCode(undefined, sets)).toBeNull();
  });
});
