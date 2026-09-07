import type {
  CardTradeLiveAnnotation,
  CardTradeLivePhase,
} from "@openrift/shared/types/api/card-trade";
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

// copy.reserved decides whether a marker belongs here; the printing-wide
// annotation only supplies its wording.
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

  // The giver's settle deletes the copy outright, so a handed-over card has
  // no strip to draw.
  it("drops the badge entirely once the printing has no live annotation", () => {
    render(<CopyMetadataStrip copy={stubCopy({ printingId: "p-1", reserved: true })} />);

    expect(screen.queryByLabelText("Reserved (outgoing)")).not.toBeInTheDocument();
  });

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
