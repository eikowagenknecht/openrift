import { render, screen } from "@testing-library/react";
import { HandHeartIcon } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CardHoldingLine } from "@/lib/card-holdings";
import { stubPrinting } from "@/test/factories";

const { linesMock, printingIdsSeen } = vi.hoisted(() => ({
  linesMock: vi.fn((): CardHoldingLine[] => []),
  printingIdsSeen: [] as string[][],
}));

vi.mock("@/hooks/use-card-holdings", () => ({
  useCardHoldingLines: (printingIds: readonly string[]) => {
    printingIdsSeen.push([...printingIds]);
    return linesMock();
  },
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { CardHoldingsSection } from "./card-holdings-section";

function line(overrides: Partial<CardHoldingLine> = {}): CardHoldingLine {
  return {
    key: "lent:Ashe",
    icon: HandHeartIcon,
    text: "Lent 2 copies to Ashe",
    tone: "committed",
    ...overrides,
  };
}

describe("CardHoldingsSection", () => {
  beforeEach(() => {
    linesMock.mockReturnValue([]);
    printingIdsSeen.length = 0;
  });

  it("renders nothing when no copies are in flight", () => {
    const { container } = render(<CardHoldingsSection printing={stubPrinting()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists every line under one heading", () => {
    linesMock.mockReturnValue([
      line(),
      line({ key: "borrowed:Jinx", text: "Borrowed 1 copy from Jinx" }),
    ]);
    render(<CardHoldingsSection printing={stubPrinting()} />);
    expect(screen.getByRole("heading", { name: "Loans and trades" })).toBeInTheDocument();
    expect(screen.getByText("Lent 2 copies to Ashe")).toBeInTheDocument();
    expect(screen.getByText("Borrowed 1 copy from Jinx")).toBeInTheDocument();
  });

  it("asks about the detail's sibling printings when the surface supplies them", () => {
    const printing = stubPrinting({ id: "p1" });
    const sibling = stubPrinting({ id: "p2" });
    render(<CardHoldingsSection printing={printing} printings={[printing, sibling]} />);
    expect(printingIdsSeen.at(-1)).toEqual(["p1", "p2"]);
  });

  it("falls back to the printing on screen when there are no siblings", () => {
    render(<CardHoldingsSection printing={stubPrinting({ id: "p1" })} printings={[]} />);
    expect(printingIdsSeen.at(-1)).toEqual(["p1"]);
  });
});
