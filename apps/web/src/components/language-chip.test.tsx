import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { LANGUAGE_CHIP_FALLBACK_COLOR, LanguageChip, languageChipStyle } from "./language-chip";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["init"], {
    enums: {
      cardTypes: [],
      rarities: [],
      domains: [],
      superTypes: [],
      finishes: [],
      artVariants: [],
      deckFormats: [],
      deckZones: [],
      languages: [
        { slug: "EN", label: "English", color: "#1d4ed8", sortOrder: 0, isWellKnown: false },
        { slug: "SC", label: "Chinese", color: null, sortOrder: 1, isWellKnown: false },
      ],
    },
    keywords: {},
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("languageChipStyle", () => {
  it("uses the stored color as the fill and picks a contrasting foreground", () => {
    expect(languageChipStyle("#1d4ed8")).toEqual({ backgroundColor: "#1d4ed8", color: "#ffffff" });
  });

  it("picks dark text on a light fill", () => {
    expect(languageChipStyle("#ffcc00")).toEqual({ backgroundColor: "#ffcc00", color: "#1a1a1a" });
  });

  it("falls back to the neutral color when none is set", () => {
    expect(languageChipStyle(null)).toEqual({
      backgroundColor: LANGUAGE_CHIP_FALLBACK_COLOR,
      color: "#ffffff",
    });
  });
});

describe("LanguageChip", () => {
  it("renders the code with its stored color and the full name as the title", () => {
    const { container } = render(<LanguageChip code="EN" />, { wrapper: makeWrapper() });
    const chip = container.querySelector("span[title]");
    expect(chip?.textContent).toBe("EN");
    expect(chip?.getAttribute("title")).toBe("English");
    // jsdom serializes the hex as rgb.
    expect((chip as HTMLElement).style.backgroundColor).toBe("rgb(29, 78, 216)");
  });

  it("uses the neutral fallback fill for a language with no color set", () => {
    const { container } = render(<LanguageChip code="SC" />, { wrapper: makeWrapper() });
    const chip = container.querySelector("span[title]");
    expect(chip?.textContent).toBe("SC");
    expect((chip as HTMLElement).style.backgroundColor).toBe("rgb(106, 106, 106)");
  });

  it("falls back to the raw code as title for an unknown language", () => {
    const { container } = render(<LanguageChip code="XX" />, { wrapper: makeWrapper() });
    const chip = container.querySelector("span[title]");
    expect(chip?.getAttribute("title")).toBe("XX");
  });
});
