import type { CardTradeLiveAnnotation, CardTradeLivePhase } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stubCopy } from "@/test/factories";

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    labels: {
      conditions: { "near-mint": "Near Mint" },
      graders: { psa: "PSA" },
    },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
const { CopyMetadataStrip } = await import("./copy-metadata-badges");

function annotation(phase: CardTradeLivePhase): CardTradeLiveAnnotation {
  return { printingId: "p-1", role: "giver", phase, tradeCount: 1, quantity: 2 };
}

// The copies view puts one physical copy on each tile, so the two data sources
// split: `copy.reserved` is the only per-copy fact and decides whether a marker
// belongs here at all, while the printing-wide annotation supplies its wording.
describe("CopyMetadataStrip live-trade marker", () => {
  it("marks a pinned copy with its printing's word", () => {
    render(
      <CopyMetadataStrip
        copy={stubCopy({ printingId: "p-1", reserved: true })}
        tradeAnnotation={annotation("reserved")}
      />,
    );

    expect(screen.getByLabelText("Reserved (outgoing)")).toBeInTheDocument();
  });

  // `reserved` stays true through the handover until the giver applies their
  // sync, so the flag alone would keep saying "Reserved" after the cards had
  // physically changed hands. The phase is what moves the word on.
  it("says Traded, not Reserved, once the trade has completed", () => {
    render(
      <CopyMetadataStrip
        copy={stubCopy({ printingId: "p-1", reserved: true })}
        tradeAnnotation={annotation("traded")}
      />,
    );

    expect(screen.getByLabelText("Traded (outgoing)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reserved (outgoing)")).not.toBeInTheDocument();
  });

  // The annotation covers the printing, not this copy. It may belong to a
  // sibling copy, or to a pending trade that has pinned nothing yet.
  it("leaves an unpinned copy unmarked even when its printing has a live trade", () => {
    render(
      <CopyMetadataStrip
        copy={stubCopy({ printingId: "p-1", reserved: false })}
        tradeAnnotation={annotation("reserved")}
      />,
    );

    expect(screen.queryByLabelText("Reserved (outgoing)")).not.toBeInTheDocument();
  });

  it("shows no marker when the annotations have not loaded yet", () => {
    render(<CopyMetadataStrip copy={stubCopy({ printingId: "p-1", reserved: true })} />);

    expect(screen.queryByLabelText("Reserved (outgoing)")).not.toBeInTheDocument();
  });

  it("drops the count: a copies-view tile is one copy, so it would always read 1", () => {
    render(
      <CopyMetadataStrip
        copy={stubCopy({ printingId: "p-1", reserved: true })}
        // The annotation covers two copies of the printing.
        tradeAnnotation={annotation("reserved")}
      />,
    );

    expect(screen.getByLabelText("Reserved (outgoing)")).not.toHaveTextContent("2");
  });

  it("keeps the loan and trade markers side by side", () => {
    render(
      <CopyMetadataStrip
        copy={stubCopy({ printingId: "p-1", reserved: true, onLoan: true })}
        tradeAnnotation={annotation("reserved")}
      />,
    );

    expect(screen.getByLabelText("On loan")).toBeInTheDocument();
    expect(screen.getByLabelText("Reserved (outgoing)")).toBeInTheDocument();
  });
});
