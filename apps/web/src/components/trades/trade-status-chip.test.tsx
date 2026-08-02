import type { CardTradeLiveAnnotation, CardTradeLivePhase, CardTradeRole } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SharedTradeStatusChip, TradeStatusChip } from "@/components/trades/trade-status-chip";

function annotation(overrides: Partial<CardTradeLiveAnnotation> = {}): CardTradeLiveAnnotation {
  return {
    printingId: "printing-1",
    role: "giver",
    phase: "asked",
    tradeCount: 1,
    quantity: 1,
    ...overrides,
  };
}

describe("TradeStatusChip", () => {
  it.each([
    ["giver", "asked", "Asked for"],
    ["giver", "offered", "Offered"],
    ["giver", "reserved", "Reserved"],
    ["giver", "traded", "Traded"],
    ["receiver", "asked", "Requested"],
    ["receiver", "offered", "Offered to you"],
    ["receiver", "reserved", "Coming to you"],
    ["receiver", "traded", "Ready to add"],
  ] as [CardTradeRole, CardTradeLivePhase, string][])(
    "spells out %s/%s as %s",
    (role, phase, label) => {
      render(<TradeStatusChip detail="label" annotation={annotation({ role, phase })} />);
      expect(screen.getByTitle(`${label} · 1 copy`)).toHaveTextContent(`${label}1`);
    },
  );

  it("keeps the wording in the tooltip in the strip default", () => {
    render(<TradeStatusChip annotation={annotation({ phase: "reserved", quantity: 2 })} />);
    const chip = screen.getByTitle("Reserved · 2 copies");
    expect(chip).toHaveTextContent("2");
    expect(chip).not.toHaveTextContent("Reserved");
  });

  it("drops the number in icon detail", () => {
    render(<TradeStatusChip detail="icon" annotation={annotation({ phase: "traded" })} />);
    const chip = screen.getByTitle("Traded");
    expect(chip).not.toHaveTextContent("1");
  });

  // A per-copy row stands for one physical card, so the annotation's
  // printing-wide count would read as several times what is really in flight.
  it("keeps the word but drops the number in word detail", () => {
    render(
      <TradeStatusChip detail="word" annotation={annotation({ phase: "reserved", quantity: 2 })} />,
    );
    // Dropping the count also drops it from the tooltip, so the title is the
    // bare word.
    const chip = screen.getByTitle("Reserved");
    expect(chip).toHaveTextContent("Reserved");
    expect(chip).not.toHaveTextContent("2");
  });

  it("shows the cross-printing total when it diverges", () => {
    render(
      <TradeStatusChip
        annotation={annotation({ role: "receiver", phase: "reserved", quantity: 1 })}
        totalCount={3}
      />,
    );
    const chip = screen.getByTitle("Coming to you · 1 of this printing (3 across all printings)");
    expect(chip).toHaveTextContent("1(3)");
  });

  it("hides a matching total", () => {
    render(
      <TradeStatusChip annotation={annotation({ phase: "offered", quantity: 2 })} totalCount={2} />,
    );
    const chip = screen.getByTitle("Offered · 2 copies");
    expect(chip).not.toHaveTextContent("(2)");
  });

  it("still renders when the displayed printing has none but siblings do", () => {
    render(
      <TradeStatusChip annotation={annotation({ phase: "offered", quantity: 0 })} totalCount={4} />,
    );
    expect(
      screen.getByTitle("Offered · 0 of this printing (4 across all printings)"),
    ).toBeInTheDocument();
  });

  it("renders nothing when the annotation covers no copies", () => {
    const { container } = render(<TradeStatusChip annotation={annotation({ quantity: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  // Offered and Reserved both mean "do not promise this card again", so the
  // chip must not draw Offered as the weaker of the two. Only a bid is soft.
  it.each([
    ["offered", "Offered · 1 copy"],
    ["reserved", "Reserved · 1 copy"],
    ["traded", "Traded · 1 copy"],
  ] as [CardTradeLivePhase, string][])("weights the committed %s state", (phase, title) => {
    render(<TradeStatusChip detail="label" annotation={annotation({ phase })} />);
    expect(screen.getByTitle(title)).toHaveClass("text-foreground", "font-semibold");
  });

  it("leaves a bid muted", () => {
    render(<TradeStatusChip detail="label" annotation={annotation({ phase: "asked" })} />);
    const chip = screen.getByTitle("Asked for · 1 copy");
    expect(chip).not.toHaveClass("text-foreground");
    expect(chip).toHaveClass("text-muted-foreground");
  });
});

describe("SharedTradeStatusChip", () => {
  it("says only that the copies are reserved", () => {
    render(<SharedTradeStatusChip />);
    expect(screen.getByTitle("Reserved")).toHaveTextContent("Reserved");
  });

  it("counts copies without naming anyone", () => {
    render(<SharedTradeStatusChip count={2} />);
    expect(screen.getByTitle("Reserved · 2 copies")).toHaveTextContent("Reserved2");
  });

  it("drops the number in icon detail", () => {
    render(<SharedTradeStatusChip detail="icon" count={2} />);
    expect(screen.getByTitle("Reserved")).not.toHaveTextContent("2");
  });

  // The public chip must stay unable to carry identity or negotiation detail.
  // These are type errors, and typecheck fails if a prop ever accepts them.
  it("takes no prop that could carry a name or a phase", () => {
    render(
      <>
        {/* @ts-expect-error -- a shared surface may never name a counterparty */}
        <SharedTradeStatusChip counterpartyName="Robin" />
        {/* @ts-expect-error -- a shared surface may never show a live negotiation */}
        <SharedTradeStatusChip phase="asked" />
        {/* @ts-expect-error -- no free text of any kind */}
        <SharedTradeStatusChip title="Reserved for Robin" />
        {/* @ts-expect-error -- no children to render text through */}
        <SharedTradeStatusChip>Robin</SharedTradeStatusChip>
      </>,
    );
    expect(screen.getAllByTitle("Reserved")).toHaveLength(4);
  });
});
