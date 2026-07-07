import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { readCssVars, useCssVars } from "./use-css-vars";

describe("readCssVars", () => {
  it("maps each name to its trimmed value", () => {
    const style = {
      getPropertyValue: (name: string) => (name === "--primary" ? " oklch(0.38 0.05 195) " : ""),
    };
    expect(readCssVars(["--primary", "--missing"], style)).toEqual({
      "--primary": "oklch(0.38 0.05 195)",
      "--missing": "",
    });
  });

  it("returns an empty record for no names", () => {
    expect(readCssVars([], { getPropertyValue: () => "" })).toEqual({});
  });
});

const NAMES = ["--design-test-var"] as const;

describe("useCssVars", () => {
  it("resolves values from the root element after mount", async () => {
    document.documentElement.style.setProperty("--design-test-var", "red");
    const { result } = renderHook(() => useCssVars(NAMES));
    await waitFor(() => {
      expect(Object.keys(result.current)).toEqual(["--design-test-var"]);
    });
    document.documentElement.style.removeProperty("--design-test-var");
  });
});
