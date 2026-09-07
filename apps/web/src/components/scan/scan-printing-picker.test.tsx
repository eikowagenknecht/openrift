import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

import { ScanPrintingPicker } from "./scan-printing-picker";

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
      languages: [{ slug: "EN", label: "English", color: "#1d4ed8", sortOrder: 0 }],
    },
    keywords: {},
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

const normal = stubPrinting({ id: "p-normal", finish: "normal", card: { name: "Yasuo" } });
const foil = stubPrinting({
  id: "p-foil",
  finish: "foil",
  cardId: normal.cardId,
  card: { name: "Yasuo" },
});

describe("ScanPrintingPicker", () => {
  it("marks the printing the row already sits on", () => {
    render(
      <ScanPrintingPicker
        request={{
          artKey: "",
          label: "Yasuo",
          candidates: [normal, foil],
          currentId: "p-normal",
        }}
        onPick={vi.fn()}
        onDismiss={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    const marked = document.querySelectorAll("[aria-current]");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("Current");
    expect(marked[0].textContent).toContain(normal.shortCode);
  });

  it("marks nothing when the picker is resolving a fresh scan", () => {
    render(
      <ScanPrintingPicker
        request={{ artKey: "", label: "Yasuo", candidates: [normal, foil] }}
        onPick={vi.fn()}
        onDismiss={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });
});
