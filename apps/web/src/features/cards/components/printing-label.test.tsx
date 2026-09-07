import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { stubPrinting } from "@/test/factories";

import { ImportPrintingLabel, PrintingVariantLabel } from "./printing-label";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["init"], {
    enums: {
      cardTypes: [],
      rarities: [],
      domains: [],
      superTypes: [],
      finishes: [
        { slug: "normal", label: "Normal", sortOrder: 0 },
        { slug: "foil", label: "Foil", sortOrder: 1 },
      ],
      artVariants: [{ slug: "normal", label: "Normal", sortOrder: 0 }],
      cardSizes: [{ slug: "standard", label: "Standard", sortOrder: 0 }],
      deckFormats: [],
      deckZones: [],
      conditions: [],
      graders: [],
      languages: [
        { slug: "EN", label: "English", color: "#1d4ed8", sortOrder: 0, isWellKnown: false },
        { slug: "SC", label: "Chinese", color: "#dc2626", sortOrder: 1, isWellKnown: false },
      ],
    },
    keywords: {},
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("PrintingVariantLabel", () => {
  it("leads with the language chip, before the code slot", () => {
    const en = stubPrinting({ shortCode: "OGN-001", language: "EN" });
    const sc = stubPrinting({ shortCode: "OGN-001", language: "SC" });
    const { container } = render(
      <PrintingVariantLabel printing={sc} siblings={[en, sc]} code={<span>OGN-001</span>} />,
      { wrapper: makeWrapper() },
    );
    const text = container.textContent ?? "";
    expect(container.querySelector('[title="Chinese"]')?.textContent).toBe("SC");
    expect(text.indexOf("SC")).toBeLessThan(text.indexOf("OGN-001"));
  });

  it("appends the fallback after the code for a plain printing", () => {
    const { container } = render(
      <PrintingVariantLabel printing={stubPrinting()} code={<span>OGN-001</span>} />,
      { wrapper: makeWrapper() },
    );
    const text = container.textContent ?? "";
    expect(text).toContain("OGN-001");
    expect(text).toContain("Standard");
    expect(text.indexOf("OGN-001")).toBeLessThan(text.indexOf("Standard"));
    expect(container.querySelector("[title]")).toBeNull();
  });

  it("returns the bare fallback word when there is no code slot", () => {
    const { container } = render(<PrintingVariantLabel printing={stubPrinting()} />, {
      wrapper: makeWrapper(),
    });
    expect(container.textContent).toBe("Standard");
  });
});

describe("ImportPrintingLabel", () => {
  it("leads with the language chip, before the card id", () => {
    const { container } = render(
      <ImportPrintingLabel printing={stubPrinting({ shortCode: "OGN-021", language: "SC" })} />,
      { wrapper: makeWrapper() },
    );
    const text = container.textContent ?? "";
    expect(container.querySelector('[title="Chinese"]')?.textContent).toBe("SC");
    expect(text.indexOf("SC")).toBeLessThan(text.indexOf("OGN-021"));
  });

  it("shows just the card id for a standard English printing", () => {
    const { container } = render(
      <ImportPrintingLabel printing={stubPrinting({ shortCode: "OGN-021", language: "EN" })} />,
      { wrapper: makeWrapper() },
    );
    expect(container.textContent).toBe("OGN-021");
    expect(container.querySelector("[title]")).toBeNull();
  });
});
